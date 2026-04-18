const express       = require("express");
const cors          = require("cors");
const multer        = require("multer");
const fetch         = require("node-fetch");
const FormData      = require("form-data");
const rateLimit     = require("express-rate-limit");
const crypto        = require("crypto");

const app    = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 }
});

const GROQ_KEY        = process.env.GROQ_API_KEY;
const GEMINI_KEY      = process.env.GEMINI_API_KEY;
const OWNER_SECRET    = process.env.OWNER_SECRET    || "";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PORT            = process.env.PORT            || 3000;
const FREE_DAILY_LIMIT = 3;
const STATS_PASSWORD   = process.env.STATS_PASSWORD || "nana2026";
const UPSTASH_URL      = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!GROQ_KEY)        { console.error("❌ GROQ_API_KEY not set.");           process.exit(1); }
if (!GEMINI_KEY)      { console.error("❌ GEMINI_API_KEY not set.");          process.exit(1); }
if (!UPSTASH_URL)     { console.error("❌ UPSTASH_REDIS_REST_URL not set.");  process.exit(1); }
if (!UPSTASH_TOKEN)   { console.error("❌ UPSTASH_REDIS_REST_TOKEN not set.");process.exit(1); }
if (!PAYSTACK_SECRET) { console.error("❌ PAYSTACK_SECRET_KEY not set.");     process.exit(1); }

console.log("✅ All env vars present. Server starting...");

app.use(cors({ origin: "*" }));
app.use(express.json());

/* ═══════════════════════════════════════════
   Upstash Redis helper
   ═══════════════════════════════════════════ */
async function redis(...args) {
  try {
    const res = await fetch(UPSTASH_URL, {
      method:  "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify(args),
    });
    const d = await res.json();
    if (d.error) { console.error(`[REDIS] Error: ${d.error}`); return null; }
    return d.result ?? null;
  } catch(e) {
    console.error(`[REDIS] ${args[0]} failed: ${e.message}`);
    return null;
  }
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
function todayStr()            { return new Date().toISOString().slice(0, 10); }
function secondsUntilMidnight(){ const n=new Date(),m=new Date(n);m.setUTCHours(24,0,0,0);return Math.floor((m-n)/1000); }
function generateToken()       { return crypto.randomBytes(16).toString("hex"); }

/* ═══════════════════════════════════════════
   Paystack helpers
   ═══════════════════════════════════════════ */
async function createPayment(email, amount, metadata, callbackUrl) {
  try {
    const body = { email, amount: amount * 100, currency: "GHS", metadata };
    if (callbackUrl) body.callback_url = callbackUrl;
    const res  = await fetch("https://api.paystack.co/transaction/initialize", {
      method:  "POST",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`[PAYSTACK] Init: ${res.status}`, JSON.stringify(data).slice(0, 300));
    return data;
  } catch(e) {
    console.error("[PAYSTACK] Init error:", e.message);
    return { status: false, message: e.message };
  }
}

async function verifyPaystackPayment(reference) {
  try {
    const res  = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json();
    console.log("[PAYSTACK] Verify:", JSON.stringify(data).slice(0, 300));
    return data;
  } catch(e) {
    console.error("[PAYSTACK] Verify error:", e.message);
    return { status: false };
  }
}

/* ═══════════════════════════════════════════
   Extra transcriptions
   ═══════════════════════════════════════════ */
async function addExtraTranscriptions(token, count) {
  const key     = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  const total   = parseInt(current) + count;
  await redis("SET", key, total);
  await redis("EXPIRE", key, 60 * 60 * 24 * 30);
  console.log(`[EXTRA] +${count} → ${token.slice(0,8)}… total=${total}`);
  return total;
}
async function getExtraTranscriptions(token) {
  const v = await redis("GET", `fom:extra:${token}`);
  return v ? parseInt(v) : 0;
}
async function useExtraTranscription(token) {
  const key     = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  if (parseInt(current) > 0) { await redis("DECR", key); return true; }
  return false;
}

/* ═══════════════════════════════════════════
   Usage tracking (token + IP dual tracking)
   ═══════════════════════════════════════════ */
const tokenKey = token => `fom:${token}:${todayStr()}`;
const ipKey    = ip    => `fom:ip:${ip.replace(/[^a-zA-Z0-9]/g,"")}:${todayStr()}`;

async function getUsageByToken(token) { const v=await redis("GET",tokenKey(token)); return v?parseInt(v):0; }
async function getUsageByIP(ip)       { const v=await redis("GET",ipKey(ip));       return v?parseInt(v):0; }

async function incrementUsageByToken(token) {
  const key = tokenKey(token);
  const v   = await redis("INCR", key);
  if (v === 1) await redis("EXPIRE", key, secondsUntilMidnight());
  return v || 1;
}
async function incrementUsageByIP(ip) {
  const key = ipKey(ip);
  const v   = await redis("INCR", key);
  if (v === 1) await redis("EXPIRE", key, secondsUntilMidnight());
  return v || 1;
}

function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  return fwd ? fwd.split(",")[0].trim() : (req.ip || "unknown");
}

/* ═══════════════════════════════════════════
   Audio mime helper
   ═══════════════════════════════════════════ */
function getAudioMime(name, mime) {
  const ext = (name || "").split(".").pop().toLowerCase();
  const map = {
    mp3:"audio/mpeg", m4a:"audio/mp4", mp4:"audio/mp4", ogg:"audio/ogg",
    wav:"audio/wav",  aac:"audio/aac", webm:"audio/webm", opus:"audio/ogg",
    mpeg:"audio/mpeg",mpga:"audio/mpeg",flac:"audio/flac"
  };
  return map[ext] || mime || "audio/mpeg";
}

/* ═══════════════════════════════════════════
   Transcription with retry
   ═══════════════════════════════════════════ */
async function transcribeWithRetry(buf, name, mime, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const safeMime = getAudioMime(name, mime);
      const form     = new FormData();
      form.append("file",            buf,  { filename: name || "audio.mp3", contentType: safeMime });
      form.append("model",           "whisper-large-v3-turbo");
      form.append("language",        "fr");
      form.append("response_format", "text");

      const res  = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
        body:    form,
      });
      const body = await res.text();
      console.log(`[TRANSCRIBE] Groq: ${res.status} | ${body.slice(0,150)}`);

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, attempt * 10000));
        continue;
      }
      if (res.status === 400) {
        /* Retry with forced mp3 mime on first attempt */
        if (attempt === 1) {
          const f2 = new FormData();
          f2.append("file",            buf, { filename: "audio.mp3", contentType: "audio/mpeg" });
          f2.append("model",           "whisper-large-v3-turbo");
          f2.append("language",        "fr");
          f2.append("response_format", "text");
          const r2  = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, ...f2.getHeaders() }, body: f2,
          });
          const b2 = await r2.text();
          if (r2.ok && b2.trim()) return { ok: true, transcript: b2.trim() };
        }
        return { ok: false, error: "Audio format not supported. Please use MP3, M4A, or WAV." };
      }
      if (!res.ok)       return { ok: false, error: `Transcription failed (${res.status}). Please try again.` };
      if (!body.trim())  return { ok: false, error: "No speech detected in the audio file." };
      return { ok: true, transcript: body.trim() };

    } catch(e) {
      if (attempt === retries) return { ok: false, error: "Connection error. Please try again." };
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { ok: false, error: "Transcription failed after multiple attempts." };
}

/* ═══════════════════════════════════════════
   Middleware
   ═══════════════════════════════════════════ */
const stats   = { visits: 0 };
const limiter = rateLimit({ windowMs: 60000, max: 30, message: { error: "Too many requests." } });
app.use(limiter);

/*
  BUG 13 FIX: Add multer error-handling middleware.
  Without this, exceeding the 25 MB file size limit throws an
  unhandled multerError that crashes the request with a cryptic 500.
*/
function handleMulterError(err, req, res, next) {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Audio file is too large. Maximum size is 25 MB." });
  }
  next(err);
}

/* ═══════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════ */
app.get("/", (req, res) => {
  stats.visits++;
  res.json({ status: "French Oral Master API 🇫🇷" });
});

app.get("/session", async (req, res) => {
  const existing = req.headers["x-session-token"];
  if (existing && existing.length === 32) {
    const [used, extra] = await Promise.all([
      getUsageByToken(existing),
      getExtraTranscriptions(existing)
    ]);
    return res.json({
      token: existing, used, limit: FREE_DAILY_LIMIT,
      remaining: Math.max(0, FREE_DAILY_LIMIT - used),
      extra_transcriptions: extra
    });
  }
  const token = generateToken();
  res.json({ token, used: 0, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT, extra_transcriptions: 0 });
});

app.get("/usage", async (req, res) => {
  const token = req.headers["x-session-token"];
  const ip    = getIP(req);
  const used  = (token && token.length === 32)
                ? await getUsageByToken(token)
                : await getUsageByIP(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const [total, today] = await Promise.all([
    redis("GET", "fom:stats:total"),
    redis("GET", `fom:stats:day:${todayStr()}`)
  ]);
  res.json({
    "🇫🇷 French Oral Master Stats": "━━━━━━━━━━━━━━━━━━",
    total_transcriptions_ever: parseInt(total || 0),
    today_transcriptions:      parseInt(today || 0),
    session_visits:            stats.visits,
    free_limit_per_user:       FREE_DAILY_LIMIT,
    server_time:               new Date().toISOString(),
  });
});

app.post("/create-payment", async (req, res) => {
  const { email, pkg, callback_url } = req.body;
  const token = req.headers["x-session-token"];
  if (!email || !pkg || !token) {
    return res.status(400).json({ error: "Missing email, pkg, or session token" });
  }

  const packages = {
    small:  { price: 5,  transcriptions: 10, name: "10 Extra Transcriptions" },
    medium: { price: 12, transcriptions: 15, name: "15 Extra Transcriptions" },
    large:  { price: 20, transcriptions: 20, name: "20 Extra Transcriptions" },
  };
  const selectedPkg = packages[pkg];
  if (!selectedPkg) return res.status(400).json({ error: "Invalid package" });

  const payment = await createPayment(
    email, selectedPkg.price,
    { token, pkg, transcriptions: selectedPkg.transcriptions },
    callback_url || null
  );

  if (payment.status && payment.data?.authorization_url) {
    res.json({ status: true, payment_url: payment.data.authorization_url, reference: payment.data.reference });
  } else {
    res.status(500).json({ error: payment.message || "Payment creation failed" });
  }
});

app.post("/verify-payment", async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: "Reference required" });

  const v = await verifyPaystackPayment(reference);
  if (v.status && v.data?.status === "success") {
    const meta      = v.data.metadata;
    const userToken = (meta && meta.token) || req.headers["x-session-token"];
    const count     = parseInt((meta && meta.transcriptions) || 10);
    if (!userToken) return res.status(400).json({ error: "Cannot identify user session" });
    const newTotal = await addExtraTranscriptions(userToken, count);
    res.json({ status: true, message: "Payment successful!", extra_transcriptions: newTotal });
  } else {
    res.status(400).json({ error: `Payment not successful. Status: ${v.data?.status || "unknown"}` });
  }
});

/* ═════════════════════════════════════════════════════════
   /transcribe
   ═════════════════════════════════════════════════════════ */
app.post("/transcribe", (req, res, next) => {
  upload.single("file")(req, res, err => {
    if (err) return handleMulterError(err, req, res, next); // BUG 13 FIX
    transcribeHandler(req, res);
  });
});

async function transcribeHandler(req, res) {
  const ip      = getIP(req);
  const token   = req.headers["x-session-token"];
  const isOwner = OWNER_SECRET && (req.headers["x-owner-secret"] || "") === OWNER_SECRET;

  try {
    const useToken = !!(token && token.length === 32);
    const [currentUsage, extraTranscriptions] = await Promise.all([
      useToken ? getUsageByToken(token) : getUsageByIP(ip),
      useToken ? getExtraTranscriptions(token) : Promise.resolve(0),
    ]);

    console.log(`[TRANSCRIBE] usage=${currentUsage}/${FREE_DAILY_LIMIT} extra=${extraTranscriptions}`);

    if (!isOwner && currentUsage >= FREE_DAILY_LIMIT && extraTranscriptions === 0) {
      return res.status(429).json({
        error: "daily_limit",
        message: `You've used all ${FREE_DAILY_LIMIT} free transcriptions for today. Buy more or come back tomorrow! ☀️`,
      });
    }

    if (!req.file)               return res.status(400).json({ error: "No audio file received." });
    if (req.file.size < 1000)    return res.status(400).json({ error: "Audio file is too small." });

    const result = await transcribeWithRetry(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!result.ok) return res.status(502).json({ error: result.error });

    let used = currentUsage;
    if (!isOwner) {
      if (currentUsage >= FREE_DAILY_LIMIT) {
        await useExtraTranscription(token);
      } else {
        used = useToken
          ? await incrementUsageByToken(token)
          : await incrementUsageByIP(ip);
      }
    }

    redis("INCR", "fom:stats:total");
    const dayKey = `fom:stats:day:${todayStr()}`;
    redis("INCR", dayKey).then(v => { if (v === 1) redis("EXPIRE", dayKey, 60*60*24*7); });

    const finalExtra = useToken ? await getExtraTranscriptions(token) : 0;
    console.log(`[TRANSCRIBE] ✅ usage=${used}/${FREE_DAILY_LIMIT} extra=${finalExtra}`);

    res.json({
      transcript: result.transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used), extra_transcriptions: finalExtra },
    });
  } catch(e) {
    console.error(`[TRANSCRIBE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

/* ═════════════════════════════════════════════════════════
   /study-guide
   BUG 9  FIX: maxOutputTokens raised from 1500 → 2500.
              1500 was too small for a full 5-section guide
              (especially WORD-FOR-WORD TRANSLATION of a long
              transcript), causing the AI to cut off mid-section
              and subsequent section headers to never appear.
   BUG 10 FIX: Same fix applied to ALL Groq fallback models.
   BUG 11 FIX: AbortSignal.timeout(30000) added to all API calls
              so a hanging Gemini/Groq request doesn't stall forever.
   BUG 12 FIX: After a successful Groq 429 retry, we now `continue`
              properly to avoid falling through to `lastError = …`
              and the loop checking for guide on next iteration.
   ═════════════════════════════════════════════════════════ */
app.post("/study-guide", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: "No transcript provided." });

    /*
      IMPORTANT: These section headers must EXACTLY match what parseGuide()
      searches for in the frontend. Headers are uppercase and wrapped in **.
      Do NOT change them without updating parseGuide() in the frontend too.
    */
    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:

"${transcript}"

Write a complete study guide using EXACTLY these 5 section headers formatted with double asterisks.
Do NOT use ## markdown headings. Use ONLY the ** format shown below.

**WORD-FOR-WORD TRANSLATION**
Translate the entire French transcript into English, sentence by sentence, word for word. Include every sentence.

**KEY VOCABULARY**
List 8-10 important French words or phrases from the audio with their English meanings.
Format each as: French word - English meaning

**GRAMMAR POINTS**
Explain 3-4 important grammar structures from the audio that students should know for their oral exam.

**SAMPLE QUESTIONS & MODEL ANSWERS**
Write 3 exam-style questions about this audio topic. For each question provide:
- The question in French
- A model answer in French (2-3 sentences)
- An English translation of the model answer

**TIPS TO ACE THIS TOPIC**
Give 3-4 practical, specific tips for performing well on this topic in a French oral exam.

CRITICAL RULES:
1. Use EXACTLY the headers shown above with ** on both sides, in UPPERCASE.
2. Complete ALL 5 sections fully — do not stop early.
3. Do NOT add any text before the first section header.`;

    let guide = "", lastError = "";

    /* ── Try Gemini models first ── */
    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"]) {
      if (guide) break;
      try {
        /* BUG 11 FIX: timeout added */
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            /* BUG 9 FIX: maxOutputTokens raised from 1500 → 2500 */
            body:    JSON.stringify({
              contents:         [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2500, temperature: 0.7 }
            }),
            signal:  AbortSignal.timeout(30000)
          }
        );

        if (r.status === 429) {
          /* Rate-limited — wait and try same model once */
          console.log(`[STUDY-GUIDE] Gemini ${model} rate-limited, waiting 10s…`);
          await new Promise(r => setTimeout(r, 10000));
          const r2   = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
            {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                contents:         [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 2500, temperature: 0.7 }
              }),
              signal: AbortSignal.timeout(30000)
            }
          );
          const d2 = await r2.json();
          if (r2.ok && d2?.candidates?.[0]?.content?.parts?.[0]?.text) {
            guide = d2.candidates[0].content.parts[0].text;
            console.log(`[STUDY-GUIDE] ✅ Gemini ${model} (retry)`);
          } else {
            lastError = JSON.stringify(d2).slice(0, 200);
          }
          continue; // BUG 12 FIX pattern: always continue to next model after retry attempt
        }

        const data = await r.json();
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini ${model}`);
        } else {
          lastError = JSON.stringify(data).slice(0, 200);
          console.log(`[STUDY-GUIDE] ⚠️ Gemini ${model} failed: ${lastError}`);
        }
      } catch(e) {
        lastError = e.message;
        console.log(`[STUDY-GUIDE] ⚠️ Gemini ${model} error: ${e.message}`);
      }
    }

    /* ── Fallback: Groq models ── */
    if (!guide) {
      for (const model of ["llama-3.3-70b-versatile", "llama3-8b-8192", "llama-3.1-8b-instant"]) {
        if (guide) break;
        try {
          /* BUG 10 FIX: max_tokens raised from 1500 → 2500 for ALL Groq models */
          /* BUG 11 FIX: timeout added */
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method:  "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ model, max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
            signal:  AbortSignal.timeout(30000)
          });
          const data = await r.json();

          if (r.ok && data?.choices?.[0]?.message?.content) {
            guide = data.choices[0].message.content;
            console.log(`[STUDY-GUIDE] ✅ Groq ${model}`);
            continue; // found guide — break inner loop on next iteration
          }

          if (r.status === 429) {
            /* BUG 12 FIX: retry once on 429, then continue cleanly */
            console.log(`[STUDY-GUIDE] Groq ${model} rate-limited, waiting 10s…`);
            await new Promise(r => setTimeout(r, 10000));
            const r2   = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method:  "POST",
              headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
              body:    JSON.stringify({ model, max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
              signal:  AbortSignal.timeout(30000)
            });
            const d2 = await r2.json();
            if (r2.ok && d2?.choices?.[0]?.message?.content) {
              guide = d2.choices[0].message.content;
              console.log(`[STUDY-GUIDE] ✅ Groq ${model} (retry)`);
              continue; // BUG 12 FIX: continue, not fall-through to lastError below
            }
            lastError = JSON.stringify(d2).slice(0, 200);
          } else {
            lastError = JSON.stringify(data).slice(0, 200);
          }
          console.log(`[STUDY-GUIDE] ⚠️ Groq ${model} failed: ${lastError}`);

        } catch(e) {
          lastError = e.message;
          console.log(`[STUDY-GUIDE] ⚠️ Groq ${model} error: ${e.message}`);
        }
      }
    }

    if (!guide) {
      console.error(`[STUDY-GUIDE] ❌ All models failed. Last error: ${lastError}`);
      return res.status(502).json({ error: "Could not generate study guide. Please try again in a moment." });
    }

    res.json({ guide });

  } catch(e) {
    console.error(`[STUDY-GUIDE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* ═══════════════════════════════════════════
   Start server + keepalive ping
   ═══════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const SELF = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try { await fetch(`${SELF}/`); console.log(`[KEEPALIVE] ✅ Awake`); }
    catch(e) { console.log(`[KEEPALIVE] ⚠️ ${e.message}`); }
  }, 14 * 60 * 1000);
});
