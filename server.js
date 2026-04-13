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

if (!GROQ_KEY) { console.error("❌ GROQ_API_KEY not set."); process.exit(1); }
if (!GEMINI_KEY) { console.error("❌ GEMINI_API_KEY not set."); process.exit(1); }
if (!UPSTASH_URL) { console.error("❌ UPSTASH_REDIS_REST_URL not set."); process.exit(1); }
if (!UPSTASH_TOKEN) { console.error("❌ UPSTASH_REDIS_REST_TOKEN not set."); process.exit(1); }

console.log("✅ All env vars present. Server starting...");

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Redis ─────────────────────────────────────────────────────────────────────
async function redis(command, ...args) {
  try {
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command, ...args]),
    });
    const data = await res.json();
    return data.result;
  } catch (e) {
    console.error(`[REDIS] ❌ ${command} failed: ${e.message}`);
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

function safeKey(ip) { return ip.replace(/[^a-zA-Z0-9]/g, "_"); }
function usageKey(ip) { return `fom_usage_${safeKey(ip)}_${todayStr()}`; }

async function getUsage(ip) {
  const val = await redis("GET", usageKey(ip));
  return val ? parseInt(val) : 0;
}

async function incrementUsage(ip) {
  const key = usageKey(ip);
  const newVal = await redis("INCR", key);
  if (newVal === 1) await redis("EXPIRE", key, secondsUntilMidnight());
  return newVal || 1;
}

// ── FIX: Detect correct mime type for any phone/device ───────────────────────
function getAudioMimeType(originalname, mimetype) {
  // Some phones send wrong or empty mime types — use extension to determine real type
  const ext = (originalname || "").split(".").pop().toLowerCase();
  const extMap = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    aac: "audio/aac",
    webm: "audio/webm",
    opus: "audio/ogg",
    mpeg: "audio/mpeg",
    mpga: "audio/mpeg",
    flac: "audio/flac",
  };
  // Use extension-based type if available, fall back to provided mime
  return extMap[ext] || mimetype || "audio/mpeg";
}

// ── FIX: Retry Groq calls on rate limit (429) ────────────────────────────────
async function groqTranscribeWithRetry(fileBuffer, filename, mimetype, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      const safeMime = getAudioMimeType(filename, mimetype);
      console.log(`[TRANSCRIBE] Attempt ${attempt} — file: ${filename}, mime: ${safeMime}`);

      form.append("file", fileBuffer, { filename: filename || "audio.mp3", contentType: safeMime });
      form.append("model", "whisper-large-v3-turbo");
      form.append("language", "fr");
      form.append("response_format", "text");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form.getHeaders() },
        body: form,
      });

      const body = await res.text();
      console.log(`[TRANSCRIBE] Groq status: ${res.status} | ${body.slice(0, 200)}`);

      if (res.status === 429) {
        // Rate limited — wait and retry
        const waitSeconds = attempt * 10; // 10s, 20s, 30s
        console.log(`[TRANSCRIBE] ⏳ Rate limited. Waiting ${waitSeconds}s before retry...`);
        await new Promise(r => setTimeout(r, waitSeconds * 1000));
        continue;
      }

      if (res.status === 400) {
        // Bad file format — try renaming to .mp3 and retry
        if (attempt === 1) {
          console.log(`[TRANSCRIBE] Bad format on attempt 1 — retrying as audio/mpeg`);
          const form2 = new FormData();
          form2.append("file", fileBuffer, { filename: "audio.mp3", contentType: "audio/mpeg" });
          form2.append("model", "whisper-large-v3-turbo");
          form2.append("language", "fr");
          form2.append("response_format", "text");
          const res2 = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, ...form2.getHeaders() },
            body: form2,
          });
          const body2 = await res2.text();
          console.log(`[TRANSCRIBE] Retry as mp3: ${res2.status} | ${body2.slice(0, 200)}`);
          if (res2.ok && body2.trim()) return { ok: true, transcript: body2.trim() };
        }
        return { ok: false, error: "Audio format not supported. Please use MP3, M4A, or WAV." };
      }

      if (!res.ok) {
        return { ok: false, error: `Transcription service error (${res.status}). Please try again.` };
      }

      const transcript = body.trim();
      if (!transcript) return { ok: false, error: "No speech detected in the audio file." };

      return { ok: true, transcript };

    } catch (e) {
      console.error(`[TRANSCRIBE] Attempt ${attempt} threw: ${e.message}`);
      if (attempt === retries) return { ok: false, error: "Connection error. Please check your internet and try again." };
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { ok: false, error: "Transcription failed after multiple attempts. Please try again in a minute." };
}

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = { visits: 0 };

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please slow down and try again in a minute." },
});
app.use(limiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  stats.visits++;
  res.json({ status: "French Oral Master API running 🇫🇷" });
});

// ── Usage ─────────────────────────────────────────────────────────────────────
app.get("/usage", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const used = await getUsage(ip);
  res.json({ used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", async (req, res) => {
  if (req.query.password !== STATS_PASSWORD) return res.status(403).json({ error: "Access denied." });
  const total = await redis("GET", "fom_total_transcriptions") || 0;
  const today = await redis("GET", `fom_transcriptions_${todayStr()}`) || 0;
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
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  console.log(`[TRANSCRIBE] Request from: ${ip}`);

  try {
    const isOwner = OWNER_SECRET && (req.headers["x-owner-secret"] || "") === OWNER_SECRET;
    if (isOwner) console.log(`[TRANSCRIBE] 👑 Owner mode`);

    // Check daily limit
    const currentUsage = await getUsage(ip);
    console.log(`[TRANSCRIBE] Usage: ${currentUsage}/${FREE_DAILY_LIMIT}`);

    if (!isOwner && currentUsage >= FREE_DAILY_LIMIT) {
      return res.status(429).json({
        error: "daily_limit",
        message: `You have used your ${FREE_DAILY_LIMIT} free transcriptions for today. Come back tomorrow! ☀️`,
      });
    }

    if (!req.file) return res.status(400).json({ error: "No audio file received. Please try uploading again." });
    console.log(`[TRANSCRIBE] File: ${req.file.originalname}, ${req.file.size} bytes, ${req.file.mimetype}`);

    // FIX: Check file is not empty
    if (req.file.size < 1000) {
      return res.status(400).json({ error: "Audio file is too small or empty. Please check the file and try again." });
    }

    // Transcribe with retry logic
    const result = await groqTranscribeWithRetry(req.file.buffer, req.file.originalname, req.file.mimetype);

    if (!result.ok) {
      return res.status(502).json({ error: result.error });
    }

    // Only count after confirmed success
    let used = currentUsage;
    if (!isOwner) used = await incrementUsage(ip);

    // Save stats
    redis("INCR", "fom_total_transcriptions");
    redis("INCR", `fom_transcriptions_${todayStr()}`);

    console.log(`[TRANSCRIBE] ✅ Success. Usage: ${used}/${FREE_DAILY_LIMIT}`);
    res.json({
      transcript: result.transcript,
      usage: { used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) },
    });

  } catch (e) {
    console.error(`[TRANSCRIBE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong on our end. Please try again in a moment." });
  }
});

// ── Study Guide ───────────────────────────────────────────────────────────────
app.post("/study-guide", async (req, res) => {
  console.log(`[STUDY-GUIDE] Request received`);
  try {
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ error: "No transcript provided." });

    const prompt = `You are a French oral exam coach. Here is a transcription of a French oral exam audio:\n\n"${transcript}"\n\nWrite a study guide using EXACTLY these headers:\n\n**SUMMARY**\n[2-3 sentence summary in English]\n\n**KEY VOCABULARY**\n[8-10 important words/phrases, format: French word - English meaning]\n\n**GRAMMAR POINTS**\n[3-4 grammar structures used in the audio]\n\n**SAMPLE QUESTIONS & MODEL ANSWERS**\n[3 exam questions with model French answers + English translation]\n\n**TIPS TO ACE THIS TOPIC**\n[3-4 practical tips for the oral exam]`;

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
              generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
            }),
          }
        );
        const data = await r.json();
        if (r.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          guide = data.candidates[0].content.parts[0].text;
          console.log(`[STUDY-GUIDE] ✅ Gemini ${model}`);
        } else {
          lastError = JSON.stringify(data).slice(0, 200);
          console.log(`[STUDY-GUIDE] ❌ Gemini ${model}: ${lastError}`);
        }
      } catch (e) { lastError = e.message; }
    }

    // Fall back to Groq
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
            // FIX: If rate limited on Groq, wait and retry once
            if (r.status === 429) {
              console.log(`[STUDY-GUIDE] Groq rate limited on ${model}, waiting 10s...`);
              await new Promise(r => setTimeout(r, 10000));
              const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
              });
              const data2 = await r2.json();
              if (r2.ok && data2?.choices?.[0]?.message?.content) {
                guide = data2.choices[0].message.content;
                console.log(`[STUDY-GUIDE] ✅ Groq ${model} on retry`);
              }
            }
            lastError = JSON.stringify(data).slice(0, 200);
          }
        } catch (e) { lastError = e.message; }
      }
    }

    if (!guide) {
      return res.status(502).json({ error: "Could not generate study guide right now. Your transcription is saved — please try again in a moment." });
    }

    res.json({ guide });

  } catch (e) {
    console.error(`[STUDY-GUIDE] ❌ ${e.message}`);
    res.status(500).json({ error: "Something went wrong generating the study guide. Please try again." });
  }
});

// ── Start + Keep-alive ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const SELF = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      await fetch(`${SELF}/`);
      console.log(`[KEEPALIVE] ✅ Awake`);
    } catch (e) {
      console.log(`[KEEPALIVE] ⚠️ ${e.message}`);
    }
  }, 14 * 60 * 1000);
});
