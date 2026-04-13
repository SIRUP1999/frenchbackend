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
const PORT = process.env.PORT || 3000;
const FREE_DAILY_LIMIT = 5; // free transcriptions per IP per day

if (!GROQ_KEY) {
  console.error("ERROR: GROQ_API_KEY environment variable is not set.");
  process.exit(1);
}

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Usage tracking (in-memory — resets on server restart) ───────────────────
// For production, swap this out for Redis or a database.
const usageMap = {}; // { "ip::date" : count }

function getKey(ip) {
  const today = new Date().toISOString().slice(0, 10);
  return `${ip}::${today}`;
}

function getUsage(ip) {
  return usageMap[getKey(ip)] || 0;
}

function incrementUsage(ip) {
  const k = getKey(ip);
  usageMap[k] = (usageMap[k] || 0) + 1;
}

// ── Rate limiting (abuse protection) ─────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many requests. Please slow down." },
});
app.use(limiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "French Oral Master API running 🇫🇷" }));

// ── Usage status ──────────────────────────────────────────────────────────────
app.get("/usage", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
  const used = getUsage(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

// ── Transcribe endpoint ───────────────────────────────────────────────────────
app.post("/transcribe", upload.single("file"), async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;

    // Check daily limit
    if (getUsage(ip) >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        error: "daily_limit",
        message: `You have used your ${FREE_DAILY_LIMIT} free transcriptions for today. Come back tomorrow!`,
      });
    }

    if (!req.file) return res.status(400).json({ error: "No audio file provided." });

    // Forward to Groq Whisper
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "audio.mp3",
      contentType: req.file.mimetype || "audio/mpeg",
    });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "text");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
      body: form,
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(502).json({ error: `Groq error: ${err.slice(0, 300)}` });
    }

    const transcript = await groqRes.text();
    incrementUsage(ip);

    const used = getUsage(ip);
    res.json({
      transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Study guide endpoint ──────────────────────────────────────────────────────
app.post("/study-guide", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: "No transcript provided." });

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a French oral exam coach. Here is a transcription of a French oral exam audio:\n\n"${transcript}"\n\nWrite a study guide using EXACTLY these headers:\n\n**SUMMARY**\n[2-3 sentence summary in English]\n\n**KEY VOCABULARY**\n[8-10 important words/phrases, format: French word - English meaning]\n\n**GRAMMAR POINTS**\n[3-4 grammar structures used in the audio]\n\n**SAMPLE QUESTIONS & MODEL ANSWERS**\n[3 exam questions with model French answers + English translation]\n\n**TIPS TO ACE THIS TOPIC**\n[3-4 practical tips for the oral exam]`,
        }],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return res.status(502).json({ error: `Groq error: ${err.slice(0, 300)}` });
    }

    const data = await groqRes.json();
    res.json({ guide: data.choices?.[0]?.message?.content || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
