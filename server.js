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
const FREE_DAILY_LIMIT = 7;
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
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const d = await res.json();
    if (d.error) {
      console.error(`[REDIS] Command error: ${d.error}`);
      return null;
    }
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
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}

function generateToken() { return crypto.randomBytes(16).toString("hex"); }

// ── Paystack Payment Functions ────────────────────────────────────────────────
// FIXED: channels explicitly includes mobile_money for GHS MoMo PIN prompt
async function createPayment(email, amount, metadata, callbackUrl) {
  try {
    const body = {
      email,
      amount: amount * 100,   // Paystack uses pesewas (GHS × 100)
      currency: "GHS",
      metadata,
      // FIXED: explicitly list channels so mobile money PIN prompt appears
      channels: ["mobile_money", "card"],
    };

    // FIXED: always set callback_url so Paystack redirects back after payment
    if (callbackUrl) {
      body.callback_url = callbackUrl;
    }

    console.log("[PAYSTACK] Initializing payment:", { email, amount, currency: "GHS", callbackUrl });

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log("[PAYSTACK] Initialize response status:", res.status);
    console.log("[PAYSTACK] Initialize response:", JSON.stringify(data).slice(0, 400));
    return data;
  } catch (e) {
    console.error("[PAYSTACK] Create payment error:", e.message);
    return { status: false, message: "Payment initialization failed: " + e.message };
  }
}

async function verifyPaystackPayment(reference) {
  try {
    const url = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
    console.log("[PAYSTACK] Verifying:", url);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json();
    console.log("[PAYSTACK] Verify response:", JSON.stringify(data).slice(0, 400));
    return data;
  } catch (e) {
    console.error("[PAYSTACK] Verify payment error:", e.message);
    return { status: false };
  }
}

// ── Extra transcription management ───────────────────────────────────────────
async function addExtraTranscriptions(token, count) {
  const key = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  const newTotal = parseInt(current) + count;
  await redis("SET", key, newTotal);
  await redis("EXPIRE", key, 60 * 60 * 24 * 30); // 30 days
  console.log(`[PAYMENT] Added ${count} extra → ${token.slice(0,8)}... total=${newTotal}`);
  return newTotal;
}

async function getExtraTranscriptions(token) {
  const key = `fom:extra:${token}`;
  const val = await redis("GET", key);
  return val ? parseInt(val) : 0;
}

async function useExtraTranscription(token) {
  const key = `fom:extra:${token}`;
  const current = await redis("GET", key) || 0;
  if (parseInt(current) > 0) {
    await redis("DECR", key);
    return true;
  }
  return false;
}

// ── Token-based usage ─────────────────────────────────────────────────────────
function tokenKey(token) { return `fom:${token}:${todayStr()}`; }

async function getUsageByToken(token) {
  const val = await redis("GET", tokenKey(token));
  const count = val ? parseInt(val) : 0;
  console.log(`[USAGE] token ${token.slice(0,8)}... = ${count}`);
  return count;
}

async function incrementUsageByToken(token) {
  const key = tokenKey(token);
  const newVal = await redis("INCR", key);
  if (newVal === 1) {
    const secs = secondsUntilMidnight();
    await redis("EXPIRE", key, secs);
    console.log(`[USAGE] New key ${key}, expires in ${secs}s`);
  }
  console.log(`[USAGE] token ${token.slice(0,8)}... → ${newVal}`);
  return newVal || 1;
}

// ── IP-based usage (fallback) ─────────────────────────────────────────────────
function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  return fwd ? fwd.split(",")[0].trim() : (req.ip || "unknown");
}

function ipKey(ip) {
  const safe = ip.replace(/[^a-zA-Z0-9]/g, "");
  return `fom:ip:${safe}:${todayStr()}`;
}

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

// ── Audio mime detection ──────────────────────────────────────────────────────
function getAudioMime(name, mime) {
  const ext = (name || "").split(".").pop().toLowerCase();
  const map = {
    mp3:"audio/mpeg", m4a:"audio/mp4", mp4:"audio/mp4",
    ogg:"audio/ogg",  wav:"audio/wav", aac:"audio/aac",
    webm:"audio/webm", opus:"audio/ogg", mpeg:"audio/mpeg",
    mpga:"audio/mpeg", flac:"audio/flac",
  };
  return map[ext] || mime || "audio/mpeg";
}

// ── Groq transcription with retry ─────────────────────────────────────────────
async function transcribeWithRetry(buf, name, mime, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const safeMime = getAudioMime(name, mime);
      console.log(`[TRANSCRIBE] Attempt ${attempt} — ${name}, mime: ${safeMime}`);

      const form = new FormData();
      form.append("file", buf, { filename: name || "audio.mp3", contentType: safeMime });
      form.append("model", "whisper-large-v3-turbo");
      form.append("language", "fr");
      form.append("response_format", "text");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
        body: form,
      });
      const body = await res.text();
      console.log(`[TRANSCRIBE] Groq: ${res.status} | ${body.slice(0,150)}`);

      if (res.status === 429) {
        const wait = attempt * 10;
        console.log(`[TRANSCRIBE] Rate limited. Waiting ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }

      if (res.status === 400) {
        if (attempt === 1) {
          // Retry with forced mp3 mime
          const f2 = new FormData();
          f2.append("file", buf, { filename: "audio.mp3", contentType: "audio/mpeg" });
          f2.append("model", "whisper-large-v3-turbo");
          f2.append("language", "fr");
          f2.append("response_format", "text");
          const r2 = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, ...f2.getHeaders() },
            body: f2,
          });
          const b2 = await r2.text();
          if (r2.ok && b2.trim()) return { ok: true, transcript: b2.trim() };
        }
        return { ok: false, error: "Audio format not supported. Please use MP3, M4A, or WAV." };
      }

      if (!res.ok) return { ok: false, error: `Transcription failed (${res.status}). Please try again.` };
      const transcript = body.trim();
      if (!transcript) return { ok: false, error: "No speech detected in the audio file." };
      return { ok: true, transcript };

    } catch (e) {
      console.error(`[TRANSCRIBE] Attempt ${attempt} error: ${e.message}`);
      if (attempt === retries) return { ok: false, error: "Connection error. Please check your internet and try again." };
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { ok: false, error: "Transcription failed after multiple attempts. Please try again." };
}

// ── Analytics ─────────────────────────────────────────────────────────────────
const liveUsers = new Set();
const transcriptionLog = [];
const MAX_LOG_SIZE = 50;

app.use((req, res, next) => {
  const userKey = req.headers["x-session-token"] || getIP(req);
  liveUsers.add(userKey);
  console.log(`[ACTIVITY] ${userKey.slice(0,12)} → ${req.method} ${req.path}`);
  setTimeout(() => liveUsers.delete(userKey), 5 * 60 * 1000);
  next();
});

function logTranscription(token, ip, filename, transcript) {
  const entry = {
    timestamp: new Date().toISOString(),
    userToken: token ? token.slice(0, 8) + "..." : null,
    userIP: ip,
    filename,
    transcriptPreview: transcript.slice(0, 100) + (transcript.length > 100 ? "..." : ""),
    transcriptLength: transcript.length,
  };
  transcriptionLog.unshift(entry);
  if (transcriptionLog.length > MAX_LOG_SIZE) transcriptionLog.pop();
  console.log(`[ANALYTICS] New transcription: ${filename} (${transcript.length} chars)`);
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const stats = { visits: 0 };
const limiter = rateLimit({ windowMs: 60000, max: 30, message: { error: "Too many requests. Please slow down." } });
app.use(limiter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  stats.visits++;
  res.json({ status: "French Oral Master API 🇫🇷" });
});

// ── Session ───────────────────────────────────────────────────────────────────
app.get("/session", async (req, res) => {
  const existing = req.headers["x-session-token"];
  if (existing && existing.length === 32) {
    const used = await getUsageByToken(existing);
    const extra = await getExtraTranscriptions(existing);
    console.log(`[SESSION] Existing ${existing.slice(0,8)}... used=${used} extra=${extra}`);
    return res.json({
      token: existing,
      used,
      limit: FREE_DAILY_LIMIT,
      remaining: Math.max(0, FREE_DAILY_LIMIT - used),
      extra_transcriptions: extra,
    });
  }
  const token = generateToken();
  console.log(`[SESSION] New token: ${token.slice(0,8)}...`);
  res.json({ token, used: 0, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT, extra_transcriptions: 0 });
});

// ── Usage ─────────────────────────────────────────────────────────────────────
app.get("/usage", async (req, res) => {
  const token = req.headers["x-session-token"];
  const ip = getIP(req);
  let used = 0;
  if (token && token.length === 32) {
    used = await getUsageByToken(token);
  } else {
    used = await getUsageByIP(ip);
  }
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

// ── Create Payment ────────────────────────────────────────────────────────────
// FIXED: accepts 'pkg' (not 'package' — reserved word), passes callback_url to Paystack
app.post("/create-payment", async (req, res) => {
  const { email, pkg, callback_url } = req.body;
  const token = req.headers["x-session-token"];

  console.log(`[PAYMENT] create-payment: email=${email} pkg=${pkg} token=${token ? token.slice(0,8)+'...' : 'none'} callback=${callback_url}`);

  if (!email || !pkg || !token) {
    console.error("[PAYMENT] Missing required fields:", { email: !!email, pkg: !!pkg, token: !!token });
    return res.status(400).json({ error: "Missing email, pkg, or session token" });
  }

  const packages = {
    small:  { price: 5,  transcriptions: 10, name: "10 Extra Transcriptions" },
    medium: { price: 12, transcriptions: 20, name: "20 Extra Transcriptions" },
    large:  { price: 20, transcriptions: 30, name: "30 Extra Transcriptions" },
  };

  const selectedPkg = packages[pkg];
  if (!selectedPkg) {
    console.error("[PAYMENT] Invalid package:", pkg);
    return res.status(400).json({ error: "Invalid package. Choose: small, medium, or large" });
  }

  const payment = await createPayment(
    email,
    selectedPkg.price,
    { token, pkg, transcriptions: selectedPkg.transcriptions },
    callback_url || null
  );

  if (payment.status && payment.data && payment.data.authorization_url) {
    console.log(`[PAYMENT] ✅ Created for ${email}: ${selectedPkg.name} — GHS ${selectedPkg.price}`);
    console.log(`[PAYMENT] Auth URL: ${payment.data.authorization_url}`);
    res.json({
      status: true,
      payment_url: payment.data.authorization_url,
      reference: payment.data.reference,
    });
  } else {
    const errMsg = payment.message || payment.data?.message || "Payment creation failed";
    console.error("[PAYMENT] ❌ Failed:", errMsg, payment);
    res.status(500).json({ error: errMsg });
  }
});

// ── Verify Payment ────────────────────────────────────────────────────────────
app.post("/verify-payment", async (req, res) => {
  const { reference } = req.body;
  console.log(`[PAYMENT] verify-payment: reference=${reference}`);

  if (!reference) {
    return res.status(400).json({ error: "Payment reference is required" });
  }

  const verification = await verifyPaystackPayment(reference);

  if (verification.status && verification.data && verification.data.status === "success") {
    const metadata = verification.data.metadata;
    console.log("[PAYMENT] Metadata:", metadata);

    // FIXED: fall back to header token if metadata.token is missing
    const userToken = (metadata && metadata.token) || req.headers["x-session-token"];
    const transcriptions = parseInt((metadata && metadata.transcriptions) || 10);

    if (!userToken) {
      console.error("[PAYMENT] No token found in metadata or header");
      return res.status(400).json({ error: "Cannot identify user session to credit transcriptions. Please contact support." });
    }

    const newTotal = await addExtraTranscriptions(userToken, transcriptions);
    console.log(`[PAYMENT] ✅ Verified ${reference} — added ${transcriptions} to ${userToken.slice(0,8)}... total=${newTotal}`);

    res.json({
      status: true,
      message: "Payment successful!",
      extra_transcriptions: newTotal,
    });
  } else {
    const paystackStatus = verification.data?.status || "unknown";
    console.error(`[PAYMENT] ❌ Verification failed for ${reference}. Paystack status: ${paystackStatus}`);
    res.status(400).json({
      error: `Payment verification failed. Paystack status: ${paystackStatus}. If you were charged, contact support with reference: ${reference}`
    });
  }
});

// ── Analytics Dashboard ───────────────────────────────────────────────────────
app.get("/analytics", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const total = await redis("GET", "fom:stats:total") || 0;
  const today = await redis("GET", `fom:stats:day:${todayStr()}`) || 0;
  res.json({
    "🇫🇷 French Oral Master Analytics": "━━━━━━━━━━━━━━━━━━",
    live_users_now: liveUsers.size,
    total_transcriptions_ever: parseInt(total),
    today_transcriptions: parseInt(today),
    session_visits: stats.visits,
    free_limit_per_user: FREE_DAILY_LIMIT,
    server_time: new Date().toISOString(),
    recent_transcriptions: transcriptionLog.slice(0, 20),
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const total = await redis("GET", "fom:stats:total") || 0;
  const today = await redis("GET", `fom:stats:day:${todayStr()}`) || 0;
  res.json({
    "🇫🇷 French Oral Master Stats": "━━━━━━━━━━━━━━━━━━",
    total_transcriptions_ever: parseInt(total),
    today_transcriptions: parseInt(today),
    session_visits: stats.visits,
    free_limit_per_user: FREE_DAILY_LIMIT,
    server_time: new Date().toISOString(),
  });
});

// ── Transcribe ────────────────────────────────────────────────────────────────
app.post("/transcribe", upload.single("file"), async (req, res) => {
  const ip = getIP(req);
  const token = req.headers["x-session-token"];
  const isOwner = OWNER_SECRET && (req.headers["x-owner-secret"] || "") === OWNER_SECRET;

  console.log(`[TRANSCRIBE] IP:${ip} token:${token ? token.slice(0,8)+"..." : "none"} owner:${isOwner}`);

  try {
    if (isOwner) console.log(`[TRANSCRIBE] 👑 Owner mode`);

    const useToken = !!(token && token.length === 32);
    let currentUsage = useToken ? await getUsageByToken(token) : await getUsageByIP(ip);

    let extraTranscriptions = 0;
    if (useToken) {
      extraTranscriptions = await getExtraTranscriptions(token);
    }

    console.log(`[TRANSCRIBE] Usage: ${currentUsage}/${FREE_DAILY_LIMIT} by ${useToken ? "token" : "IP"}, extra: ${extraTranscriptions}`);

    if (!isOwner && currentUsage >= FREE_DAILY_LIMIT && extraTranscriptions === 0) {
      console.log(`[TRANSCRIBE] ⛔ Daily limit reached, no extras`);
      return res.status(429).json({
        error: "daily_limit",
        message: `You've used all ${FREE_DAILY_LIMIT} free transcriptions for today. Buy extra transcriptions or come back tomorrow! ☀️`,
      });
    }

    if (!req.file) return res.status(400).json({ error: "No audio file received." });
    if (req.file.size < 1000) return res.status(400).json({ error: "Audio file is too small." });

    console.log(`[TRANSCRIBE] File: ${req.file.originalname}, ${req.file.size} bytes`);

    const result = await transcribeWithRetry(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!result.ok) return res.status(502).json({ error: result.error });

    let used = currentUsage;
    let usedExtra = false;

    if (!isOwner) {
      if (currentUsage >= FREE_DAILY_LIMIT) {
        // Use an extra transcription
        const success = await useExtraTranscription(token);
        if (success) {
          usedExtra = true;
          console.log(`[TRANSCRIBE] Used 1 extra transcription`);
        }
      } else {
        used = useToken
          ? await incrementUsageByToken(token)
          : await incrementUsageByIP(ip);
      }
    }

    // Update global stats
    redis("INCR", "fom:stats:total");
    const dayKey = `fom:stats:day:${todayStr()}`;
    redis("INCR", dayKey).then(v => { if (v === 1) redis("EXPIRE", dayKey, 60 * 60 * 24 * 7); });

    logTranscription(token, ip, req.file.originalname, result.transcript);

    console.log(`[TRANSCRIBE] ✅ Done. Usage=${used}/${FREE_DAILY_LIMIT}${usedExtra ? " (used extra)" : ""}`);

    const finalExtra = useToken ? await getExtraTranscriptions(token) : 0;

    res.json({
      transcript: result.transcript,
      usage: {
        used,
        limit: FREE_DAILY_LIMIT,
        remaining: Math.max(0, FREE_DAILY_LIMIT - used),
        extra_transcriptions: finalExtra,
      },
    });

  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── Study guide ───────────────────────────────────────────────────────────────
// FIXED: prompt explicitly instructs model to use **BOLD** headers only
app.post("/study-guide", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: "No transcript provided." });

    // FIXED: very explicit about format — bold asterisks ONLY, no ## headers
    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:

"${transcript}"

Write a complete study guide using EXACTLY these 5 section headers, formatted with double asterisks (**) like shown:

**WORD-FOR-WORD TRANSLATION**
Translate the entire French transcript into English word-for-word, keeping the same sentence structure.

**KEY VOCABULARY**
List 8-10 important French words/phrases from the audio with their English meanings. Format: French word - English meaning

**GRAMMAR POINTS**
Explain 3-4 grammar structures that appear in the audio and are useful for the exam.

**SAMPLE QUESTIONS & MODEL ANSWERS**
Write 3 exam questions about the audio topic, each with a model French answer and English translation.

**TIPS TO ACE THIS TOPIC**
Give 3-4 practical tips for performing well on this topic in the oral exam.

CRITICAL FORMATTING RULES:
- Use EXACTLY **WORD-FOR-WORD TRANSLATION**, **KEY VOCABULARY**, **GRAMMAR POINTS**, **SAMPLE QUESTIONS & MODEL ANSWERS**, **TIPS TO ACE THIS TOPIC** as headers
- Each header must start with ** and end with ** on its own line
- Do NOT use ## or ### markdown headings
- Do NOT use any other heading format`;

    let guide = "";
    let lastError = "";

    // Try Gemini first
    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"]) {
      if (guide) break;
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
            }),
          }
        );
        const data = await r.json();
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini ${model} — ${guide.length} chars`);
          // Debug: log first 300 chars to verify header format
          console.log(`[STUDY-GUIDE] Preview: ${guide.slice(0, 300)}`);
        } else {
          lastError = JSON.stringify(data).slice(0, 200);
          console.warn(`[STUDY-GUIDE] Gemini ${model} failed: ${lastError}`);
        }
      } catch (e) {
        lastError = e.message;
        console.warn(`[STUDY-GUIDE] Gemini ${model} error: ${e.message}`);
      }
    }

    // Fall back to Groq
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
            console.log(`[STUDY-GUIDE] ✅ Groq ${model} — ${guide.length} chars`);
          } else {
            if (r.status === 429) {
              console.log(`[STUDY-GUIDE] Groq rate limit, waiting 10s...`);
              await new Promise(r => setTimeout(r, 10000));
              const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
              });
              const d2 = await r2.json();
              if (r2.ok && d2?.choices?.[0]?.message?.content) {
                guide = d2.choices[0].message.content;
                console.log(`[STUDY-GUIDE] ✅ Groq ${model} (retry) — ${guide.length} chars`);
              }
            }
            lastError = JSON.stringify(data).slice(0, 200);
          }
        } catch (e) {
          lastError = e.message;
          console.warn(`[STUDY-GUIDE] Groq ${model} error: ${e.message}`);
        }
      }
    }

    if (!guide) {
      console.error(`[STUDY-GUIDE] ❌ All models failed. Last error: ${lastError}`);
      return res.status(502).json({ error: "Could not generate study guide. Please try again." });
    }

    res.json({ guide });

  } catch (e) {
    console.error(`[STUDY-GUIDE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ── Start + keep-alive ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const SELF = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try { await fetch(`${SELF}/`); console.log(`[KEEPALIVE] ✅ Awake`); }
    catch (e) { console.log(`[KEEPALIVE] ⚠️ ${e.message}`); }
  }, 14 * 60 * 1000);
});
