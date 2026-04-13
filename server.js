const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const rateLimit = require("express-rate-limit");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Environment ──────────────────────────────────────────────────────────────
const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OWNER_SECRET = process.env.OWNER_SECRET || "";
const PORT = process.env.PORT || 3000;
const FREE_DAILY_LIMIT = 7;
const STATS_PASSWORD = process.env.STATS_PASSWORD || "nana2026";
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!GROQ_KEY) { console.error("ERROR: GROQ_API_KEY not set."); process.exit(1); }
if (!GEMINI_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
if (!UPSTASH_URL || !UPSTASH_TOKEN) { console.error("ERROR: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set."); process.exit(1); }

console.log("✅ Server starting... GROQ_KEY:", !!GROQ_KEY, "| GEMINI_KEY:", !!GEMINI_KEY, "| UPSTASH:", !!UPSTASH_URL);

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Upstash Redis helpers ─────────────────────────────────────────────────────
async function redisGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function redisSet(key, value, exSeconds) {
  const url = exSeconds
    ? `${UPSTASH_URL}/set/${key}/${value}/ex/${exSeconds}`
    : `${UPSTASH_URL}/set/${key}/${value}`;
  await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
}

async function redisIncr(key, exSeconds) {
  // Increment and set expiry atomically
  const res = await fetch(`${UPSTASH_URL}/incr/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  const newVal = data.result;
  // Set expiry only when first created (newVal === 1)
  if (newVal === 1 && exSeconds) {
    await fetch(`${UPSTASH_URL}/expire/${key}/${exSeconds}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
  }
  return newVal;
}

// ── Stats tracking (still in-memory for visits, Redis for transcriptions) ─────
const stats = { totalVisits: 0, dailyVisits: {} };

function todayStr() { return new Date().toISOString().slice(0, 10); }
function recordVisit() { stats.totalVisits++; const d = todayStr(); stats.dailyVisits[d] = (stats.dailyVisits[d] || 0) + 1; }

function getUsageKey(ip) { return `usage:${ip}:${todayStr()}`; }

// Seconds until end of today (so Redis key expires at midnight)
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}

async function getUsage(ip) {
  const val = await redisGet(getUsageKey(ip));
  return val ? parseInt(val) : 0;
}

async function incrementUsage(ip) {
  return await redisIncr(getUsageKey(ip), secondsUntilMidnight());
}

const limiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: "Too many requests. Please slow down." } });
app.use(limiter);

app.get("/", (req, res) => { recordVisit(); res.json({ status: "French Oral Master API running 🇫🇷" }); });

app.get("/usage", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  const used = await getUsage(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const today = todayStr();
  const totalTranscriptions = await redisGet("stats:total_transcriptions") || 0;
  const todayTranscriptions = await redisGet(`stats:transcriptions:${today}`) || 0;
  res.json({
    "🇫🇷 French Oral Master — Your Stats": "━━━━━━━━━━━━━━━━━━━━━━━━",
    total_visits_ever: stats.totalVisits,
    total_transcriptions_ever: parseInt(totalTranscriptions),
    today_visits: stats.dailyVisits[today] || 0,
    today_transcriptions: parseInt(todayTranscriptions),
    free_limit_per_user: FREE_DAILY_LIMIT,
    server_time: new Date().toISOString(),
  });
});

// ── Transcribe endpoint ───────────────────────────────────────────────────────
app.post("/transcribe", upload.single("file"), async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  console.log(`[TRANSCRIBE] Request from ${ip}`);
  try {
    const ownerSecret = req.headers["x-owner-secret"] || "";
    const isOwner = OWNER_SECRET && ownerSecret === OWNER_SECRET;
    if (isOwner) console.log(`[TRANSCRIBE] 👑 Owner mode — limit bypassed`);

    const currentUsage = await getUsage(ip);
    if (!isOwner && currentUsage >= FREE_DAILY_LIMIT) {
      return res.status(429).json({ error: "daily_limit", message: `You have used your ${FREE_DAILY_LIMIT} free transcriptions for today. Come back tomorrow!` });
    }
    if (!req.file) return res.status(400).json({ error: "No audio file provided." });

    console.log(`[TRANSCRIBE] File: ${req.file.originalname}, size: ${req.file.size} bytes`);

    const form = new FormData();
    form.append("file", req.file.buffer, { filename: req.file.originalname || "audio.mp3", contentType: req.file.mimetype || "audio/mpeg" });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "text");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
      body: form,
    });

    const rawBody = await groqRes.text();
    console.log(`[TRANSCRIBE] Groq status: ${groqRes.status} | body: ${rawBody.slice(0, 200)}`);

    if (!groqRes.ok) return res.status(502).json({ error: `Transcription failed: ${rawBody.slice(0, 300)}` });

    const transcript = rawBody.trim();
    if (!transcript) return res.status(502).json({ error: "Groq returned empty transcription." });

    if (!isOwner) await incrementUsage(ip);
    // Record transcription stats in Redis (persists across restarts)
    redisIncr("stats:total_transcriptions", null);
    redisIncr(`stats:transcriptions:${todayStr()}`, secondsUntilMidnight());

    const used = await getUsage(ip);
    console.log(`[TRANSCRIBE] ✅ Success! Length: ${transcript.length}, usage: ${used}/${FREE_DAILY_LIMIT}`);
    res.json({ transcript, usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) } });

  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ Error: ${e.message}`);
    res.status(500).json({ error: `Server error: ${e.message}` });
  }
});

// ── Study guide endpoint — Gemini first, Groq as fallback ────────────────────
app.post("/study-guide", async (req, res) => {
  console.log(`[STUDY-GUIDE] Request received`);
  try {
    const { transcript } = req.body;
    if (!transcript || transcript.trim().length === 0) return res.status(400).json({ error: "No transcript provided." });

    console.log(`[STUDY-GUIDE] Transcript length: ${transcript.length}`);

    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:\n\n"${transcript}"\n\nWrite a study guide using EXACTLY these headers:\n\n**SUMMARY**\n[2-3 sentence summary in English]\n\n**KEY VOCABULARY**\n[8-10 important words/phrases, format: French word - English meaning]\n\n**GRAMMAR POINTS**\n[3-4 grammar structures used in the audio]\n\n**SAMPLE QUESTIONS & MODEL ANSWERS**\n[3 exam questions with model French answers + English translation]\n\n**TIPS TO ACE THIS TOPIC**\n[3-4 practical tips for the oral exam]`;

    let guide = "";
    let lastError = "";

    // ── Try Gemini first ──────────────────────────────────────────────────────
    const geminiModels = ["gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash-latest", "gemini-1.5-flash"];
    for (const model of geminiModels) {
      if (guide) break;
      console.log(`[STUDY-GUIDE] Trying Gemini: ${model}`);
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
            }),
          }
        );
        const data = await r.json();
        console.log(`[STUDY-GUIDE] Gemini ${model} status: ${r.status}`);
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini success with ${model}!`);
        } else {
          lastError = JSON.stringify(data).slice(0, 200);
          console.log(`[STUDY-GUIDE] ❌ Gemini ${model} failed: ${lastError}`);
        }
      } catch (err) {
        lastError = err.message;
        console.log(`[STUDY-GUIDE] ❌ Gemini ${model} threw: ${err.message}`);
      }
    }

    // ── Fall back to Groq if Gemini failed ───────────────────────────────────
    if (!guide) {
      console.log(`[STUDY-GUIDE] Gemini unavailable — falling back to Groq...`);
      const groqModels = ["llama-3.3-70b-versatile", "llama3-8b-8192", "llama-3.1-8b-instant"];
      for (const model of groqModels) {
        if (guide) break;
        console.log(`[STUDY-GUIDE] Trying Groq: ${model}`);
        try {
          const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
          });
          const data = await r.json();
          console.log(`[STUDY-GUIDE] Groq ${model} status: ${r.status}`);
          if (r.ok && data?.choices?.[0]?.message?.content) {
            guide = data.choices[0].message.content;
            console.log(`[STUDY-GUIDE] ✅ Groq success with ${model}!`);
          } else {
            lastError = JSON.stringify(data).slice(0, 200);
            console.log(`[STUDY-GUIDE] ❌ Groq ${model} failed: ${lastError}`);
          }
        } catch (err) {
          lastError = err.message;
          console.log(`[STUDY-GUIDE] ❌ Groq ${model} threw: ${err.message}`);
        }
      }
    }

    if (!guide) {
      console.error(`[STUDY-GUIDE] ❌ All models failed. Last: ${lastError}`);
      return res.status(502).json({ error: `Study guide failed: ${lastError}` });
    }

    res.json({ guide });

  } catch (e) {
    console.error(`[STUDY-GUIDE] ❌ Unexpected: ${e.message}`);
    res.status(500).json({ error: `Server error: ${e.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // ── Keep-alive ping — prevents Render free tier from sleeping ──────────────
  // Pings itself every 14 minutes (Render sleeps after 15 min of inactivity)
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/`);
      console.log(`[KEEPALIVE] ✅ Pinged ${BACKEND_URL} — server staying awake`);
    } catch(e) {
      console.log(`[KEEPALIVE] ⚠️ Ping failed: ${e.message}`);
    }
  }, 14 * 60 * 1000); // every 14 minutes
});
