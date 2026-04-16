const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const GROQ_KEY     = process.env.GROQ_API_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const OWNER_SECRET = process.env.OWNER_SECRET || "";
const PORT         = process.env.PORT || 3000;
const FREE_DAILY_LIMIT = 7;
const STATS_PASSWORD   = process.env.STATS_PASSWORD || "nana2026";
const UPSTASH_URL      = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!GROQ_KEY)      { console.error("❌ GROQ_API_KEY not set.");          process.exit(1); }
if (!GEMINI_KEY)    { console.error("❌ GEMINI_API_KEY not set.");         process.exit(1); }
if (!UPSTASH_URL)   { console.error("❌ UPSTASH_REDIS_REST_URL not set."); process.exit(1); }
if (!UPSTASH_TOKEN) { console.error("❌ UPSTASH_REDIS_REST_TOKEN not set.");process.exit(1); }

console.log("✅ All env vars present. Server starting...");

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Upstash Redis helpers ─────────────────────────────────────────────────────
// BUG FIX: INCR and EXPIRE must use method POST — previously missing, causing
// usage to never be saved and limits to never work properly.

async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const d = await res.json();
    console.log(`[REDIS] GET ${key} = ${d.result}`);
    return d.result ?? null;
  } catch (e) {
    console.error(`[REDIS] GET error: ${e.message}`);
    return null;
  }
}

async function redisIncr(key) {
  try {
    // ✅ FIX: Must be POST not GET
    const res = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const d = await res.json();
    console.log(`[REDIS] INCR ${key} = ${d.result}`);
    return d.result ?? null;
  } catch (e) {
    console.error(`[REDIS] INCR error: ${e.message}`);
    return null;
  }
}

async function redisExpire(key, seconds) {
  try {
    // ✅ FIX: Must be POST not GET
    const res = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(key)}/${seconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const d = await res.json();
    console.log(`[REDIS] EXPIRE ${key} ${seconds}s = ${d.result}`);
    return d.result ?? null;
  } catch (e) {
    console.error(`[REDIS] EXPIRE error: ${e.message}`);
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

// ── Token-based usage ─────────────────────────────────────────────────────────
function tokenKey(token) { return `fom_v2_${token}_${todayStr()}`; }

async function getUsageByToken(token) {
  const val = await redisGet(tokenKey(token));
  return val ? parseInt(val) : 0;
}

async function incrementUsageByToken(token) {
  const key = tokenKey(token);
  const newVal = await redisIncr(key);
  if (newVal === 1) await redisExpire(key, secondsUntilMidnight());
  return newVal || 1;
}

// ── IP-based fallback ─────────────────────────────────────────────────────────
function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  return fwd ? fwd.split(",")[0].trim() : (req.ip || "unknown");
}

function ipKey(ip) { return `fom_ip_${ip.replace(/[^a-zA-Z0-9]/g,"_")}_${todayStr()}`; }

async function getUsageByIP(ip) {
  const val = await redisGet(ipKey(ip));
  return val ? parseInt(val) : 0;
}

async function incrementUsageByIP(ip) {
  const key = ipKey(ip);
  const newVal = await redisIncr(key);
  if (newVal === 1) await redisExpire(key, secondsUntilMidnight());
  return newVal || 1;
}

// ── Audio mime detection ──────────────────────────────────────────────────────
function getAudioMime(name, mime) {
  const ext = (name || "").split(".").pop().toLowerCase();
  const map = { mp3:"audio/mpeg",m4a:"audio/mp4",mp4:"audio/mp4",ogg:"audio/ogg",
    wav:"audio/wav",aac:"audio/aac",webm:"audio/webm",opus:"audio/ogg",
    mpeg:"audio/mpeg",mpga:"audio/mpeg",flac:"audio/flac" };
  return map[ext] || mime || "audio/mpeg";
}

// ── Groq transcription with retry ────────────────────────────────────────────
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
          const f2 = new FormData();
          f2.append("file", buf, { filename: "audio.mp3", contentType: "audio/mpeg" });
          f2.append("model", "whisper-large-v3-turbo");
          f2.append("language", "fr");
          f2.append("response_format", "text");
          const r2 = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}`, ...f2.getHeaders() }, body: f2,
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

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = { visits: 0 };

const limiter = rateLimit({ windowMs: 60000, max: 30, message: { error: "Too many requests. Please slow down." } });
app.use(limiter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => { stats.visits++; res.json({ status: "French Oral Master API 🇫🇷" }); });

// ── Session ───────────────────────────────────────────────────────────────────
app.get("/session", async (req, res) => {
  const existing = req.headers["x-session-token"];
  if (existing && existing.length === 32) {
    const used = await getUsageByToken(existing);
    return res.json({ token: existing, used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
  }
  const token = generateToken();
  console.log(`[SESSION] New token issued: ${token.slice(0,8)}...`);
  res.json({ token, used: 0, limit: FREE_DAILY_LIMIT, remaining: FREE_DAILY_LIMIT });
});

// ── Usage ─────────────────────────────────────────────────────────────────────
app.get("/usage", async (req, res) => {
  const token = req.headers["x-session-token"];
  const ip = getIP(req);
  let used = 0;
  if (token && token.length === 32) {
    used = await getUsageByToken(token);
    console.log(`[USAGE] token=${token.slice(0,8)}... used=${used}`);
  } else {
    used = await getUsageByIP(ip);
    console.log(`[USAGE] ip=${ip} used=${used}`);
  }
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

// ── Stats page ────────────────────────────────────────────────────────────────
app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const total = await redisGet("fom_total_transcriptions") || 0;
  const today = await redisGet(`fom_transcriptions_${todayStr()}`) || 0;
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
    if (isOwner) console.log(`[TRANSCRIBE] 👑 Owner — limit bypassed`);

    const useToken = !!(token && token.length === 32);
    let currentUsage = useToken ? await getUsageByToken(token) : await getUsageByIP(ip);
    console.log(`[TRANSCRIBE] Current usage: ${currentUsage}/${FREE_DAILY_LIMIT} (by ${useToken ? "token" : "IP"})`);

    if (!isOwner && currentUsage >= FREE_DAILY_LIMIT) {
      console.log(`[TRANSCRIBE] ⛔ Limit reached`);
      return res.status(429).json({
        error: "daily_limit",
        message: `You have used your ${FREE_DAILY_LIMIT} free transcriptions for today. Come back tomorrow! ☀️`,
      });
    }

    if (!req.file) return res.status(400).json({ error: "No audio file received. Please try uploading again." });
    if (req.file.size < 1000) return res.status(400).json({ error: "Audio file is too small. Please check the file." });
    console.log(`[TRANSCRIBE] File: ${req.file.originalname}, ${req.file.size} bytes`);

    const result = await transcribeWithRetry(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!result.ok) return res.status(502).json({ error: result.error });

    // ✅ Increment AFTER confirmed transcription success
    let used = currentUsage;
    if (!isOwner) {
      used = useToken ? await incrementUsageByToken(token) : await incrementUsageByIP(ip);
    }

    // Stats (fire and forget)
    redisIncr("fom_total_transcriptions");
    const dayKey = `fom_transcriptions_${todayStr()}`;
    redisIncr(dayKey).then(v => { if (v === 1) redisExpire(dayKey, 60 * 60 * 24 * 7); });

    console.log(`[TRANSCRIBE] ✅ Done. Usage now: ${used}/${FREE_DAILY_LIMIT}`);
    res.json({
      transcript: result.transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) },
    });
  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong. Please try again in a moment." });
  }
});

// ── Study guide ───────────────────────────────────────────────────────────────
app.post("/study-guide", async (req, res) => {
  console.log(`[STUDY-GUIDE] Request received`);
  try {
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: "No transcript provided." });

    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:\n\n"${transcript}"\n\nWrite a study guide using EXACTLY these headers:\n\n**SUMMARY**\n[2-3 sentence summary in English]\n\n**KEY VOCABULARY**\n[8-10 important words/phrases, format: French word - English meaning]\n\n**GRAMMAR POINTS**\n[3-4 grammar structures used in the audio]\n\n**SAMPLE QUESTIONS & MODEL ANSWERS**\n[3 exam questions with model French answers + English translation]\n\n**TIPS TO ACE THIS TOPIC**\n[3-4 practical tips for the oral exam]`;

    let guide = "", lastError = "";

    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"]) {
      if (guide) break;
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.7 } }) }
        );
        const data = await r.json();
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini ${model}`);
        } else { lastError = JSON.stringify(data).slice(0,200); console.log(`[STUDY-GUIDE] ❌ Gemini ${model}: ${lastError}`); }
      } catch (e) { lastError = e.message; }
    }

    if (!guide) {
      for (const model of ["llama-3.3-70b-versatile", "llama3-8b-8192", "llama-3.1-8b-instant"]) {
        if (guide) break;
        try {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
          });
          const data = await r.json();
          if (r.ok && data?.choices?.[0]?.message?.content) {
            guide = data.choices[0].message.content;
            console.log(`[STUDY-GUIDE] ✅ Groq ${model}`);
          } else {
            if (r.status === 429) {
              await new Promise(r => setTimeout(r, 10000));
              const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
              });
              const d2 = await r2.json();
              if (r2.ok && d2?.choices?.[0]?.message?.content) { guide = d2.choices[0].message.content; console.log(`[STUDY-GUIDE] ✅ Groq ${model} retry`); }
            }
            lastError = JSON.stringify(data).slice(0,200);
          }
        } catch (e) { lastError = e.message; }
      }
    }

    if (!guide) return res.status(502).json({ error: "Could not generate study guide right now. Please try again." });
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
