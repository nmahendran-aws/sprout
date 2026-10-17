// Sprout AI: the study-helper chat. Uses the same GEMINI_API_KEY as api/guide.js.
// Replies are streamed: words are sent to the browser as soon as Gemini writes them, so students don't wait for the whole answer.
export const config = { maxDuration: 60 };

// Gemini sometimes says it's busy (503) or rate-limited (429). When that happens, wait a moment and retry,
// then fall back to the next model in this list, so students rarely see an error.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RETRY = [429, 500, 503, 504];
function modelList() {
  const list = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"].filter(Boolean);
  return [...new Set(list)];
}

// Chat answers don't need long "thinking" before the reply, so ask for as little as the model allows.
// If a model doesn't accept a setting (400), try the next one, and finally no setting at all.
const THINKING = [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null];

async function openStream(key, body) {
  let status = 0, msg = "";
  for (const model of modelList()) {
    let t = 0;
    for (let attempt = 0; attempt < 2; ) {
      const gen = Object.assign({}, body.generationConfig);
      if (THINKING[t]) gen.thinkingConfig = THINKING[t];
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(Object.assign({}, body, { generationConfig: gen }))
      });
      if (r.ok) return { ok: true, res: r };
      status = r.status;
      msg = "";
      try { msg = (await r.json()).error.message; } catch (e) {}
      if (r.status === 400 && t < THINKING.length - 1) { t++; continue; }   // setting not supported: try a simpler one
      if (r.status === 404) break;                                          // this model isn't available: try the next one
      if (!RETRY.includes(r.status)) return { ok: false, status, msg };    // a real problem, like a bad key
      attempt++;
      if (attempt === 1) await sleep(700);
    }
  }
  return { ok: false, status, msg, busy: RETRY.includes(status) };
}

const SYSTEM = `You are Sprout AI, the friendly study helper inside Sprout, a study-planning website made by Aarath, a 7th grader.
Many people using Sprout are middle and high school students, so:
- Be warm, encouraging, and clear. Use simple words, short paragraphs, and examples. Get to the point: keep most answers under about 150 words unless the student asks for more.
- Help students learn. For homework or test questions, explain the idea and walk through the steps or give hints, and check their understanding, instead of only handing over a final answer to copy.
- Students may send screenshots or photos of homework, notes, slides, or problems. Read them carefully and help with what's shown, following the same rule: teach and guide, don't just give answers to copy. If an image is blurry or unrelated to studying, say so kindly.
- You can explain topics, quiz the student, make memory tricks, give study tips, help plan study time, and give encouragement when they're stressed about school.
- Stay on studying, school, and learning. If asked for something unrelated, politely steer back to studying. Never produce anything inappropriate for kids.
- Never ask for personal information such as full name, address, school name, phone number, or passwords.
- If a student seems really upset or unsafe, be kind and encourage them to talk to a parent, teacher, school counselor, or another trusted adult.
- If you aren't sure about a fact, say so.
- Use plain text with simple formatting only: **bold**, short "- " bullet lists, or numbered lists. No tables or headings.`;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE = 2000000;   // base64 characters per image (about 1.5 MB)
const MAX_IMAGES = 4;        // across the whole request

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: "Missing messages" });

  // Keep only the last few turns, trimmed, so requests stay small and fast.
  // Screenshots are only kept for the newest messages, newest first, up to MAX_IMAGES.
  let imagesLeft = MAX_IMAGES;
  const recent = messages.slice(-12).filter(m => m && (m.role === "user" || m.role === "model"));
  const contents = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i], parts = [];
    if (m.role === "user" && Array.isArray(m.images)) {
      for (const im of m.images.slice(0, 3)) {
        if (imagesLeft > 0 && im && IMAGE_TYPES.includes(im.mimeType) && typeof im.data === "string" && im.data.length < MAX_IMAGE) {
          parts.push({ inline_data: { mime_type: im.mimeType, data: im.data } });
          imagesLeft--;
        }
      }
    }
    const text = typeof m.text === "string" ? m.text.slice(0, 2000) : "";
    if (text.trim()) parts.push({ text });
    else if (parts.length) parts.push({ text: "Can you help me with this?" });
    if (parts.length) contents.unshift({ role: m.role, parts });
  }
  while (contents.length && contents[0].role !== "user") contents.shift();
  if (!contents.length || contents[contents.length - 1].role !== "user") return res.status(400).json({ error: "Missing question" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY isn't set in Vercel." });

  const system = SYSTEM + (typeof context === "string" && context.trim()
    ? "\n\nThe student currently has this study plan open in Sprout:\n" + context.slice(0, 1500)
    : "");

  let started = false, wrote = false;
  try {
    const r = await openStream(key, {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    });
    if (!r.ok) {
      const error = r.busy ? "Sprout AI is really busy right now. Please try again in a minute." : ("Gemini API error " + r.status + ". " + r.msg).trim();
      return res.status(502).json({ error });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    started = true;

    // Gemini sends Server-Sent Events: lines like "data: {json}". Pass along just the answer text.
    const reader = r.res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    const handle = line => {
      if (!line.startsWith("data:")) return;
      let j;
      try { j = JSON.parse(line.slice(5)); } catch (e) { return; }
      const parts = ((j.candidates || [])[0]?.content?.parts) || [];
      const text = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (text) { res.write(text); wrote = true; }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
    }
    if (buf.trim()) handle(buf.trim());
    if (!wrote) res.write("I can't help with that one. Let's get back to studying! What are you working on?");
    res.end();
  } catch (e) {
    if (!started) return res.status(500).json({ error: "Sprout AI couldn't answer right now." });
    if (!wrote) res.write("Sorry, Sprout AI couldn't finish that answer. Please try again.");
    res.end();
  }
}
