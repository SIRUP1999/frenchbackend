const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const GROQ_KEY        = process.env.GROQ_API_KEY;
const GEMINI_KEY      = process.env.GEMINI_API_KEY;
const OWNER_SECRET    = process.env.OWNER_SECRET || "";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PORT            = process.env.PORT || 3000;
const FREE_DAILY_LIMIT = 3; // ← CHANGED FROM 7 TO 3
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

// ── Upstash Redis ─────────────────────────────────────────────────────────────
async function redis(...args) {
  try {
    const res = await fetch(UPSTASH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const d = await res.json();
    if (d.error) { console.error(`[REDIS] Error: ${d.error}`); return null; }
    console.log(`[REDIS] ${args[0]} ${args[1]} = ${d.result}`);
    return d.result ?? null;
  } catch (e) {
    console.error(`[REDIS] ${args[0]} failed: ${e.message}`);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function secondsUntilMidnight() {
  const now = new Date(), midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}
function generateToken() { return crypto.randomBytes(16).toString("hex"); }

// ── Paystack ──────────────────────────────────────────────────────────────────
async function createPayment(email, amount, metadata, callbackUrl) {
  try {
    const body = { email, amount: amount * 100, currency: "GHS", metadata };
    if (callbackUrl) body.callback_url = callbackUrl;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`[PAYSTACK] Init: ${res.status}`, JSON.stringify(data).slice(0, 300));
    return data;
  } catch (e) {
    console.error("[PAYSTACK] Init error:", e.message);
    return { status: false, message: e.message };
  }
}

async function verifyPaystackPayment(reference) {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json();
    console.log("[PAYSTACK] Verify:", JSON.stringify(data).slice(0, 300));
    return data;
  } catch (e) {
    console.error("[PAYSTACK] Verify error:", e.message);
    return { status: false };
  }
}

// ── Extra transcriptions ──────────────────────────────────────────────────────
async function addExtraTranscriptions(token, count) {
  const key = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  const newTotal = parseInt(current) + count;
  await redis("SET", key, newTotal);
  await redis("EXPIRE", key, 60 * 60 * 24 * 30);
  console.log(`[EXTRA] Added ${count} → ${token.slice(0,8)}... total=${newTotal}`);
  return newTotal;
}
async function getExtraTranscriptions(token) {
  const val = await redis("GET", `fom:extra:${token}`);
  return val ? parseInt(val) : 0;
}
async function useExtraTranscription(token) {
  const key = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  if (parseInt(current) > 0) { await redis("DECR", key); return true; }
  return false;
}

// ── Usage tracking ────────────────────────────────────────────────────────────
function tokenKey(token) { return `fom:${token}:${todayStr()}`; }
async function getUsageByToken(token) {
  const val = await redis("GET", tokenKey(token));
  return val ? parseInt(val) : 0;
}
async function incrementUsageByToken(token) {
  const key = tokenKey(token);
  const newVal = await redis("INCR", key);
  if (newVal === 1) await redis("EXPIRE", key, secondsUntilMidnight());
  return newVal || 1;
}

function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  return fwd ? fwd.split(",")[0].trim() : (req.ip || "unknown");
}
function ipKey(ip) { return `fom:ip:${ip.replace(/[^a-zA-Z0-9]/g, "")}:${todayStr()}`; }
async function getUsageByIP(ip) {
  const val = await redis("GET", ipKey(ip));
  return val ? parseInt(val) : 0;
}
async function incrementUsageByIP(ip) {
  const key = ipKey(ip);
  const newVal = await redis("INCR", key);
  if (newVal === 1) await redis("EXPIRE", key, secondsUntilMidnight());
  return newVal || 1;
}

// ── Audio mime ────────────────────────────────────────────────────────────────
function getAudioMime(name, mime) {
  const ext = (name || "").split(".").pop().toLowerCase();
  const map = { mp3:"audio/mpeg",m4a:"audio/mp4",mp4:"audio/mp4",ogg:"audio/ogg",
    wav:"audio/wav",aac:"audio/aac",webm:"audio/webm",opus:"audio/ogg",
    mpeg:"audio/mpeg",mpga:"audio/mpeg",flac:"audio/flac" };
  return map[ext] || mime || "audio/mpeg";
}

// ── Transcription with retry ──────────────────────────────────────────────────
async function transcribeWithRetry(buf, name, mime, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const safeMime = getAudioMime(name, mime);
      const form = new FormData();
      form.append("file", buf, { filename: name || "audio.mp3", contentType: safeMime });
      form.append("model", "whisper-large-v3-turbo");
      form.append("language", "fr");
      form.append("response_format", "text");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() }, body: form,
      });
      const body = await res.text();
      console.log(`[TRANSCRIBE] Groq: ${res.status} | ${body.slice(0,150)}`);
      if (res.status === 429) { await new Promise(r => setTimeout(r, attempt * 10000)); continue; }
      if (res.status === 400) {
        if (attempt === 1) {
          const f2 = new FormData();
          f2.append("file", buf, { filename: "audio.mp3", contentType: "audio/mpeg" });
          f2.append("model", "whisper-large-v3-turbo"); f2.append("language", "fr"); f2.append("response_format", "text");
          const r2 = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, ...f2.getHeaders() }, body: f2,
          });
          const b2 = await r2.text();
          if (r2.ok && b2.trim()) return { ok: true, transcript: b2.trim() };
        }
        return { ok: false, error: "Audio format not supported. Please use MP3, M4A, or WAV." };
      }
      if (!res.ok) return { ok: false, error: `Transcription failed (${res.status}). Please try again.` };
      if (!body.trim()) return { ok: false, error: "No speech detected in the audio file." };
      return { ok: true, transcript: body.trim() };
    } catch (e) {
      if (attempt === retries) return { ok: false, error: "Connection error. Please try again." };
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { ok: false, error: "Transcription failed. Please try again." };
}

// ── Middleware ────────────────────────────────────────────────────────────────
const stats = { visits: 0 };
const limiter = rateLimit({ windowMs: 60000, max: 30, message: { error: "Too many requests." } });
app.use(limiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => { stats.visits++; res.json({ status: "French Oral Master API 🇫🇷" }); });

app.get("/session", async (req, res) => {
  const existing = req.headers["x-session-token"];
  if (existing && existing.length === 32) {
    const [used, extra] = await Promise.all([getUsageByToken(existing), getExtraTranscriptions(existing)]);
    return res.json({ token: existing, used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used), extra_transcriptions: extra });
  }
  const token = generateToken();
  res.json({ token, used: 0, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT, extra_transcriptions: 0 });
});

app.get("/usage", async (req, res) => {
  const token = req.headers["x-session-token"];
  const ip = getIP(req);
  const used = (token && token.length === 32) ? await getUsageByToken(token) : await getUsageByIP(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const [total, today] = await Promise.all([redis("GET", "fom:stats:total"), redis("GET", `fom:stats:day:${todayStr()}`)]);
  res.json({
    "🇫🇷 French Oral Master Stats": "━━━━━━━━━━━━━━━━━━",
    total_transcriptions_ever: parseInt(total || 0),
    today_transcriptions: parseInt(today || 0),
    session_visits: stats.visits,
    free_limit_per_user: FREE_DAILY_LIMIT,
    server_time: new Date().toISOString(),
  });
});

app.post("/create-payment", async (req, res) => {
  const { email, pkg, callback_url } = req.body;
  const token = req.headers["x-session-token"];
  if (!email || !pkg || !token) return res.status(400).json({ error: "Missing email, pkg, or session token" });

  // ← UPDATED PACKAGES: GHS 5 = 10, GHS 12 = 15, GHS 20 = 20
  const packages = {
    small:  { price: 5,  transcriptions: 10, name: "10 Extra Transcriptions" },
    medium: { price: 12, transcriptions: 15, name: "15 Extra Transcriptions" },
    large:  { price: 20, transcriptions: 20, name: "20 Extra Transcriptions" },
  };

  const selectedPkg = packages[pkg];
  if (!selectedPkg) return res.status(400).json({ error: "Invalid package" });

  const payment = await createPayment(email, selectedPkg.price,
    { token, pkg, transcriptions: selectedPkg.transcriptions }, callback_url || null);

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
    const meta = v.data.metadata;
    const userToken = (meta && meta.token) || req.headers["x-session-token"];
    const count = parseInt((meta && meta.transcriptions) || 10);
    if (!userToken) return res.status(400).json({ error: "Cannot identify user session" });
    const newTotal = await addExtraTranscriptions(userToken, count);
    res.json({ status: true, message: "Payment successful!", extra_transcriptions: newTotal });
  } else {
    res.status(400).json({ error: `Payment verification failed. Status: ${v.data?.status || "unknown"}` });
  }
});

app.post("/transcribe", upload.single("file"), async (req, res) => {
  const ip = getIP(req);
  const token = req.headers["x-session-token"];
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
        message: `You've used all ${FREE_DAILY_LIMIT} free transcriptions for today. Buy extra or come back tomorrow! ☀️`,
      });
    }

    if (!req.file) return res.status(400).json({ error: "No audio file received." });
    if (req.file.size < 1000) return res.status(400).json({ error: "Audio file is too small." });

    const result = await transcribeWithRetry(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!result.ok) return res.status(502).json({ error: result.error });

    let used = currentUsage;
    if (!isOwner) {
      if (currentUsage >= FREE_DAILY_LIMIT) {
        await useExtraTranscription(token);
      } else {
        used = useToken ? await incrementUsageByToken(token) : await incrementUsageByIP(ip);
      }
    }

    redis("INCR", "fom:stats:total");
    const dayKey = `fom:stats:day:${todayStr()}`;
    redis("INCR", dayKey).then(v => { if (v === 1) redis("EXPIRE", dayKey, 60 * 60 * 24 * 7); });

    const finalExtra = useToken ? await getExtraTranscriptions(token) : 0;
    console.log(`[TRANSCRIBE] ✅ Done. usage=${used}/${FREE_DAILY_LIMIT} extra=${finalExtra}`);

    res.json({
      transcript: result.transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used), extra_transcriptions: finalExtra },
    });
  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.post("/study-guide", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: "No transcript provided." });

    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:

"${transcript}"

Write a complete study guide using EXACTLY these 5 section headers formatted with double asterisks:

**WORD-FOR-WORD TRANSLATION**
Translate the entire French transcript into English word-for-word.

**KEY VOCABULARY**
List 8-10 important French words/phrases with English meanings. Format: French word - English meaning

**GRAMMAR POINTS**
Explain 3-4 grammar structures from the audio useful for the exam.

**SAMPLE QUESTIONS & MODEL ANSWERS**
Write 3 exam questions with model French answers and English translations.

**TIPS TO ACE THIS TOPIC**
Give 3-4 practical tips for this topic in the oral exam.

CRITICAL: Use EXACTLY these headers with ** on both sides. Do NOT use ## headings.`;

    let guide = "", lastError = "";

    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"]) {
      if (guide) break;
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1500, temperature: 0.7 } }) }
        );
        const data = await r.json();
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini ${model}`);
        } else { lastError = JSON.stringify(data).slice(0,200); }
      } catch (e) { lastError = e.message; }
    }

    if (!guide) {
      for (const model of ["llama-3.3-70b-versatile", "llama3-8b-8192", "llama-3.1-8b-instant"]) {
        if (guide) break;
        try {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
          });
          const data = await r.json();
          if (r.ok && data?.choices?.[0]?.message?.content) {
            guide = data.choices[0].message.content;
            console.log(`[STUDY-GUIDE] ✅ Groq ${model}`);
          } else {
            if (r.status === 429) {
              await new Promise(r => setTimeout(r, 10000));
              const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
              });
              const d2 = await r2.json();
              if (r2.ok && d2?.choices?.[0]?.message?.content) { guide = d2.choices[0].message.content; }
            }
            lastError = JSON.stringify(data).slice(0,200);
          }
        } catch (e) { lastError = e.message; }
      }
    }

    if (!guide) return res.status(502).json({ error: "Could not generate study guide. Please try again." });
    res.json({ guide });
  } catch (e) {
    console.error(`[STUDY-GUIDE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const SELF = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try { await fetch(`${SELF}/`); console.log(`[KEEPALIVE] ✅ Awake`); }
    catch (e) { console.log(`[KEEPALIVE] ⚠️ ${e.message}`); }
  }, 14 * 60 * 1000);
});
