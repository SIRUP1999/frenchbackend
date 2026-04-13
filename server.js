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

if (!GROQ_KEY) {
  console.error("ERROR: GROQ_API_KEY environment variable is not set.");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("ERROR: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

console.log("✅ Server starting... GROQ_KEY present:", !!GROQ_KEY, "| GEMINI_KEY present:", !!GEMINI_KEY);

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Usage tracking ────────────────────────────────────────────────────────────
const usageMap = {};

const stats = {
  totalVisits: 0,
  totalTranscriptions: 0,
  dailyVisits: {},
  dailyTranscriptions: {},
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recordVisit() {
  stats.totalVisits++;
  const d = todayStr();
  stats.dailyVisits[d] = (stats.dailyVisits[d] || 0) + 1;
}

function recordTranscription() {
  stats.totalTranscriptions++;
  const d = todayStr();
  stats.dailyTranscriptions[d] = (stats.dailyTranscriptions[d] || 0) + 1;
}

function getKey(ip) {
  return `${ip}::${todayStr()}`;
}

function getUsage(ip) {
  return usageMap[getKey(ip)] || 0;
}

function incrementUsage(ip) {
  const k = getKey(ip);
  usageMap[k] = (usageMap[k] || 0) + 1;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many requests. Please slow down." },
});
app.use(limiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  recordVisit();
  res.json({ status: "French Oral Master API running 🇫🇷" });
});

// ── Usage status ──────────────────────────────────────────────────────────────
app.get("/usage", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  const used = getUsage(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

// ── Stats endpoint ────────────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  const { password } = req.query;
  if (password !== STATS_PASSWORD) {
    return res.status(403).json({ error: "Access denied." });
  }
  const today = todayStr();
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({
      date: key,
      visits: stats.dailyVisits[key] || 0,
      transcriptions: stats.dailyTranscriptions[key] || 0,
    });
  }
  res.json({
    "🇫🇷 French Oral Master — Your Stats": "━━━━━━━━━━━━━━━━━━━━━━━━",
    total_visits_ever: stats.totalVisits,
    total_transcriptions_ever: stats.totalTranscriptions,
    today_visits: stats.dailyVisits[today] || 0,
    today_transcriptions: stats.dailyTranscriptions[today] || 0,
    last_7_days: last7,
    free_limit_per_user: FREE_DAILY_LIMIT,
    server_time: new Date().toISOString(),
  });
});

// ── Transcribe endpoint ───────────────────────────────────────────────────────
app.post("/transcribe", upload.single("file"), async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  console.log(`[TRANSCRIBE] Request from ${ip}`);

  try {
    // ── Owner bypass — unlimited access for you ──
    const ownerSecret = req.headers["x-owner-secret"] || "";
    const isOwner = OWNER_SECRET && ownerSecret === OWNER_SECRET;
    if (isOwner) console.log(`[TRANSCRIBE] 👑 Owner mode — limit bypassed`);

    // Check daily limit (skipped for owner)
    if (!isOwner && getUsage(ip) >= FREE_DAILY_LIMIT) {
      console.log(`[TRANSCRIBE] Daily limit reached for ${ip}`);
      return res.status(429).json({
        error: "daily_limit",
        message: `You have used your ${FREE_DAILY_LIMIT} free transcriptions for today. Come back tomorrow!`,
      });
    }

    if (!req.file) {
      console.log(`[TRANSCRIBE] No file received`);
      return res.status(400).json({ error: "No audio file provided." });
    }

    console.log(`[TRANSCRIBE] File: ${req.file.originalname}, size: ${req.file.size} bytes, type: ${req.file.mimetype}`);

    // Forward to Groq Whisper
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "audio.mp3",
      contentType: req.file.mimetype || "audio/mpeg",
    });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "text");

    console.log(`[TRANSCRIBE] Sending to Groq Whisper...`);
    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
      body: form,
    });

    const rawBody = await groqRes.text();
    console.log(`[TRANSCRIBE] Groq status: ${groqRes.status}`);
    console.log(`[TRANSCRIBE] Groq body: ${rawBody.slice(0, 300)}`);

    if (!groqRes.ok) {
      return res.status(502).json({ error: `Transcription failed: ${rawBody.slice(0, 300)}` });
    }

    const transcript = rawBody.trim();
    if (!transcript) {
      return res.status(502).json({ error: "Groq returned empty transcription." });
    }

    // Only count usage after confirmed success (owner not counted)
    if (!isOwner) {
      incrementUsage(ip);
    }
    recordTranscription();

    const used = getUsage(ip);
    console.log(`[TRANSCRIBE] ✅ Success! Length: ${transcript.length}, usage: ${used}/${FREE_DAILY_LIMIT}`);

    res.json({
      transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) },
    });

  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ Error: ${e.message}`);
    res.status(500).json({ error: `Server error: ${e.message}` });
  }
});

// ── Study guide endpoint — powered by Google Gemini ──────────────────────────
app.post("/study-guide", async (req, res) => {
  console.log(`[STUDY-GUIDE] Request received`);

  try {
    const { transcript } = req.body;

    if (!transcript || transcript.trim().length === 0) {
      console.log(`[STUDY-GUIDE] No transcript in request body`);
      return res.status(400).json({ error: "No transcript provided." });
    }

    console.log(`[STUDY-GUIDE] Transcript length: ${transcript.length}`);

    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:\n\n"${transcript}"\n\nWrite a study guide using EXACTLY these headers:\n\n**SUMMARY**\n[2-3 sentence summary in English]\n\n**KEY VOCABULARY**\n[8-10 important words/phrases, format: French word - English meaning]\n\n**GRAMMAR POINTS**\n[3-4 grammar structures used in the audio]\n\n**SAMPLE QUESTIONS & MODEL ANSWERS**\n[3 exam questions with model French answers + English translation]\n\n**TIPS TO ACE THIS TOPIC**\n[3-4 practical tips for the oral exam]`;

    console.log(`[STUDY-GUIDE] Calling Google Gemini...`);

    const geminiRes = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    console.log(`[STUDY-GUIDE] Gemini status: ${geminiRes.status}`);

    if (!geminiRes.ok) {
      const errMsg = JSON.stringify(geminiData).slice(0, 300);
      console.error(`[STUDY-GUIDE] ❌ Gemini failed: ${errMsg}`);
      return res.status(502).json({ error: `Study guide failed: ${errMsg}` });
    }

    const guide = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!guide) {
      console.error(`[STUDY-GUIDE] ❌ Gemini returned empty response`);
      return res.status(502).json({ error: "Gemini returned an empty response." });
    }

    console.log(`[STUDY-GUIDE] ✅ Gemini success! Guide length: ${guide.length}`);
    res.json({ guide });

  } catch (e) {
    console.error(`[STUDY-GUIDE] ❌ Unexpected error: ${e.message}`);
    res.status(500).json({ error: `Server error: ${e.message}` });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
