// Allow up to 60 seconds: the AI writes the whole study kit in one request.
export const config = { maxDuration: 60 };

// Gemini sometimes says it's busy (503) or rate-limited (429). When that happens, wait a moment and retry,
// then fall back to the next model in this list, so students rarely see an error.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RETRY = [429, 500, 503, 504];
function modelList() {
  const list = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"].filter(Boolean);
  return [...new Set(list)];
}
async function askGemini(key, body) {
  let status = 0, msg = "";
  for (const model of modelList()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body)
      });
      if (r.ok) return { ok: true, data: await r.json() };
      status = r.status;
      msg = "";
      try { msg = (await r.json()).error.message; } catch (e) {}
      if (r.status === 404) break;                               // this model isn't available: try the next one
      if (!RETRY.includes(r.status)) return { ok: false, status, msg };   // a real problem, like a bad key
      if (attempt === 0) await sleep(1000);
    }
  }
  return { ok: false, status, msg, busy: RETRY.includes(status) };
}

// Vercel serverless function: keeps your API key off the front end.
// Uses Google's Gemini API. Set GEMINI_API_KEY in your Vercel project's environment variables.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { topic, days, timeLabel, details, image } = req.body || {};
  if (!topic && !image) return res.status(400).json({ error: "Missing topic" });

  // Optional photo or PDF of the student's syllabus or notes.
  const okTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const upload = image && okTypes.includes(image.mimeType) && typeof image.data === "string" && image.data.length < 4500000 ? image : null;
  if (image && !upload) return res.status(400).json({ error: "That file couldn't be used. Try a JPG, PNG, or a PDF under 3 MB." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "GEMINI_API_KEY isn't set. In Vercel, open Settings > Environment Variables, add it for Production, then redeploy." });
  }

  const steps = Math.min(Math.max(parseInt(days) || 7, 1), 10);
  const aboutAarath = /aarath/i.test(String(topic || "") + " " + String(details || ""));

  const prompt = `Write a quick one-page study guide for a student.
Topic: ${topic}
Time they have to study: ${timeLabel || "not given"} (${days || "unknown"} days)
What they need to cover: ${details || "not given, so cover the most important core ideas"}
Before anything else, decide whether this is something a student could genuinely study. Refuse if the request is:
- nonsense, gibberish, a joke, or absurd (for example "how to turn into a toaster" or "asdfghjk"),
- harmful, dangerous, or not appropriate for kids (for example weapons, drugs, hacking, cheating, hurting people, or anything sexual),
- about a private person who is not famous, such as a classmate, friend, teacher, neighbor, or family member.
Famous and public figures are fine (for example Jeff Bezos, Abraham Lincoln, or Serena Williams), and so are school subjects, tests, skills, hobbies, sports, history, and anything else a student could really learn about. If you are unsure, do not refuse.
The one non-famous person a study guide is allowed about is Aarath Mahendran, the student who made Sprout.${aboutAarath ? ` Use only these facts about him: he is a 7th grader and a dedicated self-learner; he built Sprout to help people study; he loves programming, building things, and math, and is curious about how things work, like computers, machines, and the human body; he enjoys soccer, biking, and time with friends, and is a big FC Barcelona fan; he has taken part in MathCounts and National History Day and is preparing for bigger competitions; his dream is to become a neurosurgeon to help people, and he is curious about medical internships, math, science, and history. Do not invent anything else about him.` : ""}
If you refuse, reply with exactly {"refused": true} and nothing else.

${upload ? "The student attached a photo or PDF of their syllabus, notes, or study sheet. Read it carefully and base the guide, plan, and practice on exactly what it covers. If the topic above is vague, take the topic from the attachment." : ""}

Reply with JSON only, no other text, in exactly this shape:
{
  "title": "string",
  "overview": "2-3 sentences on what this topic is and why it matters",
  "keyConcepts": [{ "term": "string", "explanation": "1-2 clear sentences" }],
  "keyFacts": ["important formulas, dates, rules, or vocabulary"],
  "commonMistakes": ["string"],
  "quickCheck": ["a short question to test understanding"],
  "plan": [{ "when": "Day 1", "goal": "the part of the topic this checkpoint covers", "focus": ["1-3 key concept terms from keyConcepts"], "tip": "one sentence on how to study it in Sprout, like which part of the study guide to reread and whether to try the worksheet or flashcards" }],
  "flashcards": [{ "front": "term or question", "back": "short answer" }],
  "worksheet": [{ "heading": "section name", "text": "a paragraph that restates part of the study guide, with important words replaced by blanks written as {{answer|hint}}", "deeper": "a why, how, or what-if question about this section that makes the student think, answered in two or three sentences", "deeperAnswer": "a model answer in two or three sentences", "deeperPoints": ["the 1-2 key ideas a full answer must include"] }],
  "quiz": [{ "question": "string", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "one sentence", "topic": "short concept name" }]
}
Use 5-6 keyConcepts, 4 keyFacts, 3 commonMistakes, and 3 quickCheck questions. Split the study time into exactly ${steps} plan entries (checkpoints), each covering an equal share of the days; "when" is a label like "Day 1" or "Days 4-5". Each checkpoint covers a different part of the topic, in a sensible learning order, and together they cover every key concept. At each checkpoint the student will take a short quiz in Sprout on that part, so the tip must only mention things inside Sprout (the study guide, the worksheet, the flashcards, or asking Sprout AI), never outside activities like reading a textbook or watching videos.
The worksheet is the study guide rewritten with blanks: write 5-7 paragraphs that together cover the overview, every key concept, and the key facts, so it reads like the study guide itself. Use 12-16 blanks in total, on the most important words. Each answer is one to three words; if two answers are both correct, separate them with a slash, like {{CO2/carbon dioxide|It's the gas you breathe out}}. Each hint is a short clue that never contains the answer.
Write 10 flashcards for active recall: about a third are definitions, a third ask "why" or "how", and a third apply an idea to a new example or situation. Write 6 quiz questions with 4 options each (the correct option's index goes in "answer" and should vary between questions). Most quiz questions should test understanding and application (a new scenario, a cause and effect, a comparison, or a short problem to solve), not just recalling a definition, and the wrong options should be believable mistakes. Keep the study guide part to about one or two printed pages.`;

  try {
    const r = await askGemini(key, {
      contents: [{ role: "user", parts: upload
        ? [{ inline_data: { mime_type: upload.mimeType, data: upload.data } }, { text: prompt }]
        : [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 12000 }
    });
    if (!r.ok) {
      const why = /api key/i.test(r.msg) ? "The Gemini API key was rejected. Check that you copied the whole key." :
                  r.busy ? "Gemini is really busy right now. Please try again in a minute." : "";
      return res.status(502).json({ error: (why || "Gemini API error " + r.status + ". " + r.msg).trim() });
    }
    const data = r.data;
    const text = ((data.candidates || [])[0]?.content?.parts || []).map(p => p.text || "").join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);   // ignore any extra words around the JSON
    const out = JSON.parse(json);
    if (out.refused || !Array.isArray(out.keyConcepts)) return res.status(422).json({ error: "Sorry, I can't make a plan for that.", refused: true });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "Could not build the guide" });
  }
}
