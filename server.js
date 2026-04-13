<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="description" content="Transcribe and master your French oral exam audios instantly. Free AI-powered transcription, vocabulary, grammar, and study guides."/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="theme-color" content="#0a0e1a"/>
<title>French Oral Master — AI Transcription & Study Guide</title>

<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7076616078598631" crossorigin="anonymous"></script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0e1a;
  --card: #111827;
  --border: #1e2d45;
  --accent: #3b82f6;
  --accent-light: #60a5fa;
  --gold: #f59e0b;
  --green: #10b981;
  --red: #ef4444;
  --text: #e2e8f0;
  --muted: #64748b;
  --highlight: #1e3a5f;
}
body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; min-height: 100vh; }

.header { background: linear-gradient(135deg, #0f172a 0%, #1e2d45 100%); border-bottom: 1px solid var(--border); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.header-left { display: flex; align-items: center; gap: 12px; }
.header-flag { font-size: 26px; }
.header-title { font-size: 17px; font-weight: 800; color: var(--accent-light); }
.header-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.header-badge { background: var(--highlight); border: 1px solid var(--accent); border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: var(--accent-light); }

.hero { background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%); padding: 40px 20px 32px; text-align: center; }
.hero h1 { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 10px; line-height: 1.3; }
.hero h1 span { color: var(--accent-light); }
.hero p { font-size: 14px; color: var(--muted); max-width: 400px; margin: 0 auto 20px; line-height: 1.6; }
.hero-features { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 24px; }
.feature-pill { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); border-radius: 20px; padding: 5px 12px; font-size: 12px; color: var(--accent-light); font-weight: 600; }
.hero-free { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 10px; padding: 10px 16px; display: inline-block; font-size: 13px; color: var(--green); font-weight: 700; }

.ad-slot { background: var(--card); border: 1px dashed var(--border); border-radius: 10px; padding: 12px; text-align: center; color: var(--muted); font-size: 11px; margin: 0 16px 16px; min-height: 70px; display: flex; align-items: center; justify-content: center; }

.main { padding: 16px; max-width: 700px; margin: 0 auto; }

.wakeup-card { background: #1c1a08; border: 1px solid var(--gold); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; display: none; }
.wakeup-card p { color: #fcd34d; font-size: 13px; line-height: 1.6; }
.wakeup-bar-bg { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 8px; }
.wakeup-bar { height: 100%; background: linear-gradient(90deg, var(--gold), var(--green)); border-radius: 3px; animation: wakeup 25s linear forwards; }
@keyframes wakeup { from { width: 5%; } to { width: 100%; } }

.usage-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.usage-info { flex: 1; }
.usage-title { font-size: 12px; font-weight: 700; color: var(--gold); margin-bottom: 4px; }
.usage-bar-bg { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.usage-bar { height: 100%; background: linear-gradient(90deg, var(--green), var(--accent)); border-radius: 3px; transition: width 0.5s; }
.usage-count { font-size: 12px; color: var(--muted); margin-top: 4px; }

.upload-zone { background: var(--card); border: 2px dashed var(--border); border-radius: 14px; padding: 28px 20px; text-align: center; margin-bottom: 16px; position: relative; overflow: hidden; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
.upload-zone.drag-over { border-color: var(--accent); background: var(--highlight); }
.upload-icon { font-size: 36px; margin-bottom: 8px; }
.upload-title { font-size: 15px; font-weight: 700; margin-bottom: 5px; }
.upload-sub { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
.upload-btn { display: inline-block; background: var(--accent); color: #fff; border-radius: 8px; padding: 9px 22px; font-size: 14px; font-weight: 700; pointer-events: none; }
.upload-zone input[type=file] { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }

.file-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.file-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-icon { font-size: 18px; flex-shrink: 0; }
.file-name { font-size: 13px; font-weight: 600; flex: 1; min-width: 80px; word-break: break-all; }
.badge { font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 700; white-space: nowrap; }
.badge-pending { background: #1f2937; color: var(--muted); }
.badge-loading { background: var(--highlight); color: var(--accent-light); }
.badge-done { background: #064e3b; color: var(--green); }
.badge-error { background: #450a0a; color: var(--red); }
.btn-view { background: var(--highlight); color: var(--accent-light); border: 1px solid var(--accent); border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }

.progress-wrap { margin-bottom: 12px; }
.progress-info { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
.progress-bg { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
.progress-bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--green)); border-radius: 3px; transition: width 0.5s; }

.process-btn { width: 100%; background: #78350f; color: var(--gold); border: 1px solid var(--gold); border-radius: 10px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 18px; }
.process-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.limit-card { background: #1c1408; border: 1px solid var(--gold); border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center; }
.limit-card h3 { color: var(--gold); font-size: 15px; margin-bottom: 6px; }
.limit-card p { color: #fcd34d; font-size: 13px; line-height: 1.6; }

.tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 14px; }
.tabs::-webkit-scrollbar { display: none; }
.tab { padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 700; border: 1px solid var(--border); background: transparent; color: var(--muted); white-space: nowrap; flex-shrink: 0; transition: all 0.15s; }
.tab.active { background: var(--highlight); color: var(--accent-light); border-color: var(--accent); }

.study-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
.study-card-title { font-size: 15px; font-weight: 700; color: var(--accent-light); margin-bottom: 12px; }
.text-box { background: #0f172a; border-radius: 10px; padding: 14px; font-size: 14px; line-height: 1.8; color: var(--text); white-space: pre-wrap; border: 1px solid var(--border); }
.sec-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--gold); margin: 16px 0 8px; }

.spin { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent-light); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 4px; }
@keyframes spin { to { transform: rotate(360deg); } }

.howto { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
.howto-title { font-size: 14px; font-weight: 700; color: var(--gold); margin-bottom: 14px; }
.step { background: #0f172a; border-radius: 10px; padding: 13px; border-left: 3px solid var(--accent); margin-bottom: 10px; }
.step-title { font-size: 13px; font-weight: 700; color: var(--accent-light); margin-bottom: 4px; }
.step-body { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
.step.green { border-left-color: var(--green); }
.step.green .step-title { color: var(--green); }

/* ── CONTENT ARTICLES (for AdSense approval) ── */
.content-section { max-width: 700px; margin: 0 auto; padding: 0 16px; }
.content-section h2 { font-size: 20px; font-weight: 800; color: #fff; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.article-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.article-card h3 { font-size: 16px; font-weight: 700; color: var(--accent-light); margin-bottom: 10px; }
.article-card p { font-size: 14px; color: #cbd5e1; line-height: 1.8; margin-bottom: 10px; }
.article-card p:last-child { margin-bottom: 0; }
.article-card ul { padding-left: 18px; }
.article-card ul li { font-size: 14px; color: #cbd5e1; line-height: 1.8; margin-bottom: 6px; }
.tip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@media (max-width: 500px) { .tip-grid { grid-template-columns: 1fr; } }
.tip-box { background: #0f172a; border-radius: 10px; padding: 14px; border: 1px solid var(--border); }
.tip-box-icon { font-size: 22px; margin-bottom: 6px; }
.tip-box-title { font-size: 13px; font-weight: 700; color: var(--accent-light); margin-bottom: 4px; }
.tip-box-body { font-size: 12px; color: var(--muted); line-height: 1.6; }
.vocab-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.vocab-table th { background: var(--highlight); color: var(--accent-light); font-size: 12px; padding: 8px 12px; text-align: left; }
.vocab-table td { font-size: 13px; color: #cbd5e1; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.vocab-table tr:last-child td { border-bottom: none; }

.footer { text-align: center; padding: 24px 20px 40px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); margin-top: 20px; }
.footer a { color: var(--accent-light); text-decoration: none; }

.empty { text-align: center; color: var(--muted); padding: 32px 0; font-size: 14px; }
.empty-icon { font-size: 44px; margin-bottom: 10px; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <span class="header-flag">🇫🇷</span>
    <div>
      <div class="header-title">French Oral Master</div>
      <div class="header-sub">AI-Powered Exam Prep</div>
    </div>
  </div>
  <span class="header-badge">✨ Free</span>
</div>

<div class="hero">
  <h1>Master Your <span>French Oral</span> Exam with AI</h1>
  <p>Upload your audio files and instantly get transcriptions, vocabulary, grammar notes, and study guides — all for free.</p>
  <div class="hero-features">
    <span class="feature-pill">🎤 Auto Transcription</span>
    <span class="feature-pill">📚 Vocabulary</span>
    <span class="feature-pill">🔤 Grammar Notes</span>
    <span class="feature-pill">❓ Sample Q&A</span>
    <span class="feature-pill">🏆 Exam Tips</span>
  </div>
  <div class="hero-free">✅ No account needed &nbsp;·&nbsp; 7 free audios per day &nbsp;·&nbsp; No credit card</div>
</div>

<div class="ad-slot" style="margin-top:16px;">
  <ins class="adsbygoogle" style="display:block;width:100%;min-height:60px;"
    data-ad-client="ca-pub-7076616078598631"
    data-ad-slot="1924514855"
    data-ad-format="auto"
    data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>

<div class="main">

  <div class="usage-card" id="usageCard">
    <div class="usage-info">
      <div class="usage-title">📊 Today's Free Usage</div>
      <div class="usage-bar-bg"><div class="usage-bar" id="usageBar" style="width:0%"></div></div>
      <div class="usage-count" id="usageCount">Loading...</div>
    </div>
  </div>

  <div class="wakeup-card" id="wakeupCard">
    <p>⏳ <strong>Waking up the server…</strong> This takes up to 30 seconds on first use. Please wait — do not close the app!</p>
    <div class="wakeup-bar-bg"><div class="wakeup-bar" id="wakeupBar"></div></div>
  </div>

  <div class="upload-zone" id="uploadZone">
    <div class="upload-icon">🎧</div>
    <div class="upload-title">Tap to upload your French audio files</div>
    <div class="upload-sub">MP3, M4A, OGG, WAV supported · Select all at once</div>
    <span class="upload-btn">Browse Files</span>
    <input type="file" id="fileInput" multiple accept="audio/*" onchange="addFiles(this.files)"/>
  </div>

  <div class="file-list" id="fileList"></div>

  <div class="progress-wrap" id="progressWrap" style="display:none">
    <div class="progress-info"><span>Processing your audios…</span><span id="progressTxt">0/0</span></div>
    <div class="progress-bg"><div class="progress-bar" id="progressBar" style="width:0%"></div></div>
  </div>

  <div class="limit-card" id="limitCard" style="display:none">
    <h3>🎯 Daily Limit Reached</h3>
    <p>You've used your 7 free transcriptions for today.<br/>Come back tomorrow for 7 more — completely free! ☀️</p>
  </div>

  <button class="process-btn" id="processBtn" style="display:none" onclick="processAll()">
    🚀 Transcribe &amp; Study All Files
  </button>

  <div id="midAdSlot" style="display:none; margin-bottom:16px;">
    <ins class="adsbygoogle" style="display:block;width:100%;min-height:60px;"
      data-ad-client="ca-pub-7076616078598631"
      data-ad-slot="1924514855"
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
  </div>

  <div class="tabs" id="tabs" style="display:none"></div>
  <div id="studyArea"></div>

  <div class="empty" id="emptyState">
    <div class="empty-icon">🎓</div>
    Upload your French oral audio files above<br/>to get your instant study guide.
  </div>

  <div class="howto">
    <div class="howto-title">📖 How to Upload Your Audio Files</div>
    <div class="step"><div class="step-title">Step 1 — Tap the upload box</div><div class="step-body">Tap anywhere on the 🎧 upload area. Your phone's file picker will open.</div></div>
    <div class="step"><div class="step-title">Step 2 — It shows images? Switch to files</div><div class="step-body"><strong>Android:</strong> Tap the ☰ menu → select "Files" or "Browse"<br/><strong>iPhone:</strong> Tap "Browse" at the bottom → go to Downloads or WhatsApp folder</div></div>
    <div class="step"><div class="step-title">Step 3 — Find your audio files</div><div class="step-body">From <strong>WhatsApp</strong>: Internal Storage → WhatsApp → Media → WhatsApp Audio<br/>From <strong>Downloads</strong>: Internal Storage → Downloads</div></div>
    <div class="step"><div class="step-title">Step 4 — Select all files at once</div><div class="step-body"><strong>Long press</strong> the first file → tap each remaining file → tap Open / Done</div></div>
    <div class="step green"><div class="step-title">✅ Then tap "Transcribe & Study All"</div><div class="step-body">Each audio will be transcribed and a full study guide built automatically. Tap each tab to switch between audios.</div></div>
  </div>

</div>

<!-- AD SLOT MID PAGE -->
<div class="ad-slot" style="margin: 0 16px 16px;">
  <ins class="adsbygoogle" style="display:block;width:100%;min-height:60px;"
    data-ad-client="ca-pub-7076616078598631"
    data-ad-slot="1924514855"
    data-ad-format="auto"
    data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>

<!-- ══ CONTENT ARTICLES — required for AdSense approval ══ -->
<div class="content-section">

  <h2>🇫🇷 Your Complete Guide to Passing the French Oral Exam</h2>

  <div class="article-card">
    <h3>What is a French Oral Exam?</h3>
    <p>A French oral exam (also called an <em>épreuve orale</em>) is a spoken language assessment where students demonstrate their ability to understand and communicate in French. It typically involves listening to audio passages, answering questions, describing images, or having a conversation with an examiner in French.</p>
    <p>The exam tests several key skills: listening comprehension, spoken fluency, vocabulary range, grammar accuracy, and the ability to express opinions and ideas clearly in French. Most oral exams at the secondary and university level in West Africa, including Ghana, follow the WAEC or GCE format, which requires students to respond to audio-based prompts.</p>
  </div>

  <div class="article-card">
    <h3>How French Oral Master Helps You Prepare</h3>
    <p>French Oral Master uses advanced AI technology (powered by Groq Whisper) to automatically transcribe your French audio files into text. Once transcribed, our AI (powered by Llama) generates a complete study guide for each audio that includes:</p>
    <ul>
      <li><strong>A full transcription</strong> — so you can read exactly what was said</li>
      <li><strong>Key vocabulary</strong> — important French words with English translations</li>
      <li><strong>Grammar points</strong> — structures used in the audio that you should know</li>
      <li><strong>Sample questions and model answers</strong> — to practice responding to the audio topic</li>
      <li><strong>Tips to ace the topic</strong> — practical advice for performing well in your oral exam</li>
    </ul>
    <p>This means you no longer have to struggle alone with audio files you don't fully understand. Our tool breaks everything down for you step by step, completely free.</p>
  </div>

  <div class="article-card">
    <h3>Top Tips for Passing Your French Oral Exam</h3>
    <div class="tip-grid">
      <div class="tip-box">
        <div class="tip-box-icon">🎧</div>
        <div class="tip-box-title">Listen Repeatedly</div>
        <div class="tip-box-body">Play each audio at least 3 times. First for general meaning, second for details, third while reading the transcription.</div>
      </div>
      <div class="tip-box">
        <div class="tip-box-icon">📝</div>
        <div class="tip-box-title">Learn Key Phrases</div>
        <div class="tip-box-body">Memorise transition phrases like "À mon avis" (In my opinion), "Par exemple" (For example), and "En conclusion" (In conclusion).</div>
      </div>
      <div class="tip-box">
        <div class="tip-box-icon">🗣️</div>
        <div class="tip-box-title">Speak Out Loud</div>
        <div class="tip-box-body">Practice answering the sample questions out loud. Speaking French daily, even for 5 minutes, significantly improves your fluency.</div>
      </div>
      <div class="tip-box">
        <div class="tip-box-icon">📖</div>
        <div class="tip-box-title">Study Vocabulary</div>
        <div class="tip-box-body">Focus on the key vocabulary from each audio. Use flashcards or write each word in a sentence to help you remember it.</div>
      </div>
      <div class="tip-box">
        <div class="tip-box-icon">⏱️</div>
        <div class="tip-box-title">Time Yourself</div>
        <div class="tip-box-body">In the actual exam, you have limited time. Practice answering questions within 1–2 minutes to build the habit of being concise.</div>
      </div>
      <div class="tip-box">
        <div class="tip-box-icon">🤝</div>
        <div class="tip-box-title">Study in Groups</div>
        <div class="tip-box-body">Share this tool with your classmates. Quiz each other using the sample questions. Group study makes French oral prep more effective and fun.</div>
      </div>
    </div>
  </div>

  <div class="article-card">
    <h3>Common French Vocabulary for Oral Exams</h3>
    <p>These are some of the most frequently tested French words and phrases in West African oral exams. Make sure you know them before your exam day.</p>
    <table class="vocab-table">
      <tr><th>French</th><th>English</th><th>Example Use</th></tr>
      <tr><td>Bonjour / Bonsoir</td><td>Good morning / Good evening</td><td>Greeting the examiner</td></tr>
      <tr><td>Je pense que…</td><td>I think that…</td><td>Expressing an opinion</td></tr>
      <tr><td>À mon avis</td><td>In my opinion</td><td>Starting a personal view</td></tr>
      <tr><td>C'est-à-dire</td><td>That is to say / Meaning</td><td>Clarifying a point</td></tr>
      <tr><td>Par exemple</td><td>For example</td><td>Giving an example</td></tr>
      <tr><td>Cependant</td><td>However</td><td>Introducing contrast</td></tr>
      <tr><td>En revanche</td><td>On the other hand</td><td>Comparing two ideas</td></tr>
      <tr><td>Il faut</td><td>It is necessary / One must</td><td>Giving advice or stating a need</td></tr>
      <tr><td>Je suis d'accord</td><td>I agree</td><td>Agreeing with a statement</td></tr>
      <tr><td>Je ne suis pas d'accord</td><td>I disagree</td><td>Politely disagreeing</td></tr>
      <tr><td>En conclusion</td><td>In conclusion</td><td>Ending a response</td></tr>
      <tr><td>Pouvez-vous répéter?</td><td>Can you repeat?</td><td>Asking the examiner to repeat</td></tr>
    </table>
  </div>

  <div class="article-card">
    <h3>Common French Oral Exam Topics</h3>
    <p>French oral exams in West Africa typically cover a range of everyday and social topics. Being familiar with the vocabulary for each topic gives you a major advantage. Here are the most common topics you should prepare for:</p>
    <ul>
      <li><strong>La famille</strong> (Family) — describing family members, relationships, and home life</li>
      <li><strong>L'école et l'éducation</strong> (School and Education) — subjects, teachers, school life, and future plans</li>
      <li><strong>La santé</strong> (Health) — illness, visiting the doctor, healthy habits, and hospitals</li>
      <li><strong>L'environnement</strong> (The Environment) — climate change, pollution, nature, and conservation</li>
      <li><strong>La nourriture</strong> (Food) — local and French cuisine, cooking, restaurants, and shopping</li>
      <li><strong>Les transports</strong> (Transport) — types of transport, travel, directions, and road safety</li>
      <li><strong>Le travail</strong> (Work) — jobs, careers, workplace situations, and ambitions</li>
      <li><strong>La technologie</strong> (Technology) — the internet, social media, mobile phones, and modern life</li>
      <li><strong>Les loisirs</strong> (Hobbies and Leisure) — sports, music, reading, and free time activities</li>
      <li><strong>La ville et la campagne</strong> (City and Countryside) — comparing urban and rural life</li>
    </ul>
    <p>Upload any audio on these topics to French Oral Master and get an instant study guide tailored to that specific topic.</p>
  </div>

  <div class="article-card">
    <h3>How to Improve Your French Pronunciation</h3>
    <p>Pronunciation is one of the most challenging aspects of French for English speakers, but it is also one of the most rewarding skills to develop. Here are practical steps to improve your French pronunciation before your oral exam:</p>
    <p><strong>1. Shadow the audio:</strong> After transcribing your audio with French Oral Master, play it back and try to speak along with the recording at the same time. This technique, called shadowing, is one of the fastest ways to improve pronunciation and natural rhythm in French.</p>
    <p><strong>2. Pay attention to nasal sounds:</strong> French has nasal vowels that don't exist in English — sounds like "an", "en", "in", "on", and "un". Practice these sounds separately until they feel natural.</p>
    <p><strong>3. Learn liaison rules:</strong> In French, the final consonant of a word is often linked to the next word when it starts with a vowel. For example, "vous avez" is pronounced "voo-za-vay". Knowing liaison rules makes you sound much more natural.</p>
    <p><strong>4. Record yourself:</strong> Use your phone to record yourself speaking French, then compare it to the original audio. This helps you identify where your pronunciation differs and what to improve.</p>
  </div>

</div>

<!-- AD SLOT BOTTOM -->
<div class="ad-slot" style="margin: 16px 16px;">
  <ins class="adsbygoogle" style="display:block;width:100%;min-height:60px;"
    data-ad-client="ca-pub-7076616078598631"
    data-ad-slot="1924514855"
    data-ad-format="auto"
    data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>

<div class="footer">
  French Oral Master &copy; 2026 &nbsp;·&nbsp; Free AI-powered French exam prep<br/>
  <small style="color:#334155;">Powered by Groq Whisper &amp; Llama AI</small><br/>
  <small style="color:#334155;">made with ❤️ by Nana</small><br/>
  <a href="privacy-policy.html" style="color:#60a5fa; font-size:12px;">Privacy Policy</a>
</div>

<script>
const API_BASE = "https://french-backend-9bz8.onrender.com";

const files = [];
const results = {};
let activeTab = null;
let busy = false;

async function wakeServer() {
  try {
    await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(35000) });
  } catch(e) {}
}
wakeServer();

async function loadUsage() {
  try {
    const res = await fetch(`${API_BASE}/usage`, { signal: AbortSignal.timeout(35000) });
    const data = await res.json();
    updateUsageUI(data.used, data.limit);
  } catch(e) {
    document.getElementById('usageCount').textContent = 'Could not load usage info.';
  }
}
loadUsage();

function updateUsageUI(used, limit) {
  used = used ?? 0;
  limit = limit ?? 7;
  const pct = Math.min((used / limit) * 100, 100);
  document.getElementById('usageBar').style.width = pct + '%';
  document.getElementById('usageCount').textContent = `${used} of ${limit} free transcriptions used today`;
  if (used >= limit) {
    document.getElementById('limitCard').style.display = 'block';
    document.getElementById('processBtn').style.display = 'none';
  }
}

const zone = document.getElementById('uploadZone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); });

function addFiles(list) {
  const arr = Array.from(list).filter(f => {
    // Accept if extension matches audio, OR mime type is audio, OR no extension info (dragged file)
    const hasAudioExt = /\.(mp3|m4a|ogg|wav|aac|webm|m4b|opus|mpeg|mpga)$/i.test(f.name);
    const hasAudioMime = f.type.startsWith('audio');
    const noTypeInfo = !f.type; // dragged files sometimes have no type
    return hasAudioExt || hasAudioMime || noTypeInfo;
  });
  if (!arr.length) return alert('Please select audio files (MP3, M4A, OGG, WAV, etc)');
  const existing = new Set(files.map(f => f.name));
  arr.forEach(f => { if (!existing.has(f.name)) files.push(f); });
  if (!activeTab && files.length) activeTab = files[0].name;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('processBtn').style.display = 'block';
  document.getElementById('midAdSlot').style.display = 'block';
  renderAll();
}

function renderAll() { renderFileList(); renderTabs(); renderStudy(); }

function renderFileList() {
  document.getElementById('fileList').innerHTML = files.map(f => {
    const r = results[f.name];
    let cls = 'badge-pending', lbl = 'Ready';
    let errorTip = '';
    if (r) {
      if (r.status === 'transcribing') { cls = 'badge-loading'; lbl = 'Transcribing…'; }
      else if (r.status === 'studying')  { cls = 'badge-loading'; lbl = 'Building guide…'; }
      else if (r.status === 'done')      { cls = 'badge-done';    lbl = '✓ Done'; }
      else if (r.status === 'error')     { cls = 'badge-error';   lbl = '✗ Error'; errorTip = ` title="${esc(r.error || 'Unknown error')}"` }
    }
    const spin = (r?.status === 'transcribing' || r?.status === 'studying') ? '<span class="spin"></span>' : '';
    const viewBtn = r?.status === 'done' ? `<button class="btn-view" onclick="setTab('${esc(f.name)}')">Study →</button>` : '';
    const errMsg = r?.status === 'error' ? `<div style="width:100%;font-size:11px;color:#f87171;margin-top:4px;">⚠️ ${esc(r.error||'Unknown error')}</div>` : '';
    return `<div class="file-card"><span class="file-icon">🎵</span><span class="file-name">${esc(f.name)}</span><span class="badge ${cls}"${errorTip}>${spin}${lbl}</span>${viewBtn}${errMsg}</div>`;
  }).join('');
}

function renderTabs() {
  const done = files.filter(f => results[f.name]?.status === 'done');
  const el = document.getElementById('tabs');
  if (!done.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = done.map(f => {
    const short = f.name.replace(/AUD-\d+-WA\d+/i, '').replace(/\.\w+$/, '') || f.name.replace(/\.\w+$/, '');
    const label = short || f.name.replace(/\.\w+$/, '');
    return `<button class="tab${activeTab === f.name ? ' active' : ''}" onclick="setTab('${esc(f.name)}')">🎙 ${esc(label)}</button>`;
  }).join('');
}

function setTab(name) { activeTab = name; renderTabs(); renderStudy(); }

function renderStudy() {
  const area = document.getElementById('studyArea');
  const r = results[activeTab];
  if (!r || r.status !== 'done') { area.innerHTML = ''; return; }
  const icons = { 'SUMMARY':'📋','KEY VOCABULARY':'📚','GRAMMAR POINTS':'🔤','SAMPLE QUESTIONS & MODEL ANSWERS':'❓','TIPS TO ACE THIS TOPIC':'🏆' };
  let html = `<div class="study-card"><div class="study-card-title">🎤 Transcription</div><div class="text-box">${esc(r.transcript)}</div></div>`;
  if (r.parsed?.length) {
    html += `<div class="study-card"><div class="study-card-title">📖 Study Guide</div>`;
    r.parsed.forEach(s => { html += `<div class="sec-label">${icons[s.label]||'•'} ${s.label}</div><div class="text-box">${esc(s.content)}</div>`; });
    html += `</div>`;
  } else if (r.guideError) {
    html += `<div class="study-card"><div class="study-card-title">⚠️ Study Guide Unavailable</div><div class="text-box" style="color:#f87171;">Transcription worked ✅ but the study guide failed: ${esc(r.guideError)}.\n\nYou can still read and study from the transcription above.</div></div>`;
  }
  area.innerHTML = html;
}

async function fetchWithWakeup(url, options = {}, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const TIMEOUT = 90000; // 90 seconds to allow full cold start
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
    return res;
  } catch(e) {
    if (attempt < MAX_ATTEMPTS) {
      console.log(`Attempt ${attempt} failed, retrying... (${attempt}/${MAX_ATTEMPTS})`);
      // Show retry message to user
      document.getElementById('wakeupCard').style.display = 'block';
      document.getElementById('wakeupCard').querySelector('p').innerHTML =
        `⏳ <strong>Server is waking up… (Attempt ${attempt + 1} of ${MAX_ATTEMPTS})</strong><br/>Please wait — retrying automatically, do not close the app!`;
      // Wait 5 seconds then retry
      await new Promise(r => setTimeout(r, 5000));
      return fetchWithWakeup(url, options, attempt + 1);
    }
    throw new Error('Server is still waking up. Please wait 30 seconds and tap Transcribe again.');
  }
}

async function processAll() {
  if (busy) return;
  busy = true;
  document.getElementById('processBtn').disabled = true;
  document.getElementById('progressWrap').style.display = 'block';

  const wakeup = document.getElementById('wakeupCard');
  wakeup.style.display = 'block';
  setTimeout(() => { wakeup.style.display = 'none'; }, 35000);

  const todo = files.filter(f => !results[f.name]?.transcript);

  for (let i = 0; i < todo.length; i++) {
    const file = todo[i];
    results[file.name] = { status: 'transcribing' };
    renderAll();

    try {
      const form = new FormData();
      form.append('file', file, file.name);

      const tRes = await fetchWithWakeup(`${API_BASE}/transcribe`, { method: 'POST', body: form });
      const tData = await tRes.json();

      if (tRes.status === 429 && tData.error === 'daily_limit') {
        results[file.name] = { status: 'error', error: tData.message };
        document.getElementById('limitCard').style.display = 'block';
        renderAll();
        break;
      }
      if (!tRes.ok) throw new Error(tData.error || tData.message || 'Transcription failed');

      const transcript = tData.transcript;
      updateUsageUI(tData.usage.used, tData.usage.limit);

      results[file.name] = { status: 'studying', transcript };
      if (!activeTab || results[activeTab]?.status !== 'done') activeTab = file.name;
      renderAll();

      try {
        const gRes = await fetchWithWakeup(`${API_BASE}/study-guide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript })
        });
        const gData = await gRes.json();
        if (!gRes.ok) throw new Error(gData.error || gData.message || 'Study guide failed');
        results[file.name] = { status: 'done', transcript, parsed: parseGuide(gData.guide) };
      } catch(guideErr) {
        results[file.name] = { status: 'done', transcript, parsed: [], guideError: guideErr.message };
      }

      if (!activeTab || results[activeTab]?.status !== 'done') activeTab = file.name;
      wakeup.style.display = 'none';

    } catch(e) {
      results[file.name] = { status: 'error', error: e.message };
    }

    const done = files.filter(f => results[f.name]?.status === 'done').length;
    document.getElementById('progressTxt').textContent = `${done}/${files.length}`;
    document.getElementById('progressBar').style.width = `${(done / files.length) * 100}%`;
    renderAll();
  }

  busy = false;
  document.getElementById('processBtn').disabled = false;
  document.getElementById('wakeupCard').style.display = 'none';
  const left = files.filter(f => !results[f.name]?.transcript).length;
  document.getElementById('processBtn').textContent = left ? `🚀 Transcribe Remaining (${left})` : '✓ All Done!';
}

function parseGuide(text) {
  const names = ['SUMMARY','KEY VOCABULARY','GRAMMAR POINTS','SAMPLE QUESTIONS & MODEL ANSWERS','TIPS TO ACE THIS TOPIC'];
  return names.map((name, i) => {
    const start = text.indexOf(`**${name}**`);
    if (start === -1) return null;
    const next = names[i+1] ? text.indexOf(`**${names[i+1]}**`) : text.length;
    return { label: name, content: text.slice(start + name.length + 4, next !== -1 ? next : text.length).trim() };
  }).filter(Boolean);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
</script>
</body>
</html>
