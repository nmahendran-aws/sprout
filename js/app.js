  // ----- Sprout AI: a study-helper chat. Messages go to /api/chat (see api/chat.js), which uses your Gemini key.
  // Visitors get a daily message limit (owner mode is unlimited) so nobody can run up your Gemini usage.
  const SproutAI = (function () {
    const DAILY = 30, KEY = "sprout:ai";
    const log = document.getElementById("chat-log"), input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send"), chips = document.getElementById("chat-chips");
    const foot = document.getElementById("chat-foot"), ctxEl = document.getElementById("chat-context");
    let history = [], busy = false, started = false;

    const usage = () => { try { const u = JSON.parse(store.get(KEY)) || {}; return u.day === today() ? u.n : 0; } catch (e) { return 0; } };
    const left = () => isOwner() || UNLIMITED ? Infinity : Math.max(0, DAILY - usage());
    const countOne = () => { if (!isOwner()) store.set(KEY, JSON.stringify({ day: today(), n: usage() + 1 })); };

    // Turns the AI's simple formatting (**bold**, lists, `code`) into HTML. Text is escaped first, so it's safe.
    function format(text) {
      const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
      let html = "", listTag = null;
      const close = () => { if (listTag) { html += "</" + listTag + ">"; listTag = null; } };
      text.replace(/\r/g, "").split("\n").forEach(line => {
        const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/);
        if (ul || ol) {
          const tag = ul ? "ul" : "ol";
          if (listTag !== tag) { close(); html += "<" + tag + ">"; listTag = tag; }
          html += "<li>" + inline((ul || ol)[1]) + "</li>";
        } else if (!line.trim()) {
          close();
        } else {
          close();
          html += "<p>" + inline(line.replace(/^#+\s*/, "")) + "</p>";
        }
      });
      close();
      return html;
    }

    function bubble(role, text, extra, images) {
      const m = el("div", "", "msg " + (role === "user" ? "me" : "bot") + (extra ? " " + extra : ""));
      const t = el("div", "", "txt");
      if (role === "user") t.textContent = text; else if (text !== null) t.innerHTML = format(text);
      if (role !== "user") { const av = el("div", "", "av"); av.append(Shop.icon()); m.append(av); m.append(t); }
      else {
        const col = el("div", "", "col");
        if (images && images.length) {
          const row = el("div", "", "shots");
          images.forEach(im => {
            const img = document.createElement("img");
            img.src = im.url; img.alt = "Your screenshot";
            img.onclick = () => img.classList.toggle("big");
            row.append(img);
          });
          col.append(row);
        }
        col.append(t);
        m.append(col);
      }
      log.append(m);
      log.scrollTop = log.scrollHeight;
      return t;
    }

    // ----- Screenshots: pick, paste, or drop images. Each is shrunk in the browser first, so it uploads quickly.
    const MAX_SHOTS = 3;
    const shotsEl = document.getElementById("chat-shots"), fileEl = document.getElementById("chat-file");
    const chatBox = document.querySelector(".chat");
    let shots = [];   // { url, mimeType, data }

    function shrink(file) {
      return new Promise((resolve, reject) => {
        const src = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
          const MAX = 1600, s = Math.min(1, MAX / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          const g = c.getContext("2d");
          g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // transparent screenshots get a white background
          g.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(src);
          const url = c.toDataURL("image/jpeg", 0.85);
          resolve({ url, mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) });
        };
        img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("bad image")); };
        img.src = src;
      });
    }

    function note(msg) {
      let n = chatBox.querySelector(".chat-note");
      if (!msg) { if (n) n.remove(); return; }
      if (!n) { n = el("div", "", "chat-note"); chatBox.insertBefore(n, shotsEl); }
      n.textContent = msg;
      clearTimeout(note.t); note.t = setTimeout(() => n.remove(), 4000);
    }

    function drawShots() {
      shotsEl.replaceChildren(...shots.map((s, i) => {
        const box = el("div", "", "shot"), img = document.createElement("img"), x = el("button", "×");
        img.src = s.url; img.alt = "Screenshot " + (i + 1);
        x.type = "button"; x.setAttribute("aria-label", "Remove screenshot " + (i + 1));
        x.onclick = () => { shots.splice(i, 1); drawShots(); };
        box.append(img, x);
        return box;
      }));
      shotsEl.hidden = !shots.length;
    }

    async function addFiles(files) {
      const imgs = [...files].filter(f => f && /^image\//.test(f.type));
      if (!imgs.length) { if (files.length) note("That isn't an image. Try a screenshot or photo."); return; }
      if (left() <= 0) return;
      for (const f of imgs) {
        if (shots.length >= MAX_SHOTS) { note("You can add up to " + MAX_SHOTS + " screenshots per message."); break; }
        if (f.size > 20e6) { note("That image is too big. Try a smaller screenshot."); continue; }
        try { shots.push(await shrink(f)); Sfx.play("pop"); }
        catch (e) { note("Sprout couldn't read that image. Try a PNG or JPG."); }
      }
      drawShots();
      if (window.matchMedia("(pointer: fine)").matches) input.focus();
    }

    document.getElementById("chat-attach").addEventListener("click", () => fileEl.click());
    fileEl.addEventListener("change", () => { addFiles(fileEl.files); fileEl.value = ""; });
    input.addEventListener("paste", e => {
      const files = [...(e.clipboardData && e.clipboardData.files || [])];
      if (files.some(f => /^image\//.test(f.type))) { e.preventDefault(); addFiles(files); }
    });
    // Pasting a screenshot anywhere on the Sprout AI page works too, not just in the text box.
    document.addEventListener("paste", e => {
      if (e.target === input || document.getElementById("ai-view").hidden) return;
      const files = [...(e.clipboardData && e.clipboardData.files || [])];
      if (files.some(f => /^image\//.test(f.type))) { e.preventDefault(); addFiles(files); }
    });
    let dragDepth = 0;
    const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    chatBox.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; chatBox.classList.add("dragging"); });
    chatBox.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    chatBox.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) chatBox.classList.remove("dragging"); });
    chatBox.addEventListener("drop", e => {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation(); dragDepth = 0; chatBox.classList.remove("dragging");
      addFiles(e.dataTransfer.files);
    });
    // A screenshot dropped just outside the chat box still goes into the chat, instead of the browser opening it.
    const onAI = () => !document.getElementById("ai-view").hidden;
    window.addEventListener("dragover", e => { if (onAI() && hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", e => { if (onAI() && hasFiles(e)) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

    function topic() { return currentKit ? (currentKit.g.title || currentKit.req.topic) : ""; }
    function context() {
      if (!currentKit) return "";
      const { req, g } = currentKit;
      return [
        "Topic: " + topic(),
        "Time to study: " + (req.timeLabel || req.days + " days"),
        g.keyConcepts && g.keyConcepts.length ? "Key concepts: " + g.keyConcepts.map(c => c.term).join(", ") : "",
        g.plan && g.plan.length ? "Plan: " + g.plan.map(p => p.when + ": " + p.goal).join("; ") : ""
      ].filter(Boolean).join("\n").slice(0, 1500);
    }

    function drawChips() {
      const t = topic();
      const ideas = t
        ? ["Explain " + t + " like I'm new to it", "Quiz me with 3 questions", "Give me a memory trick", "What should I study first?"]
        : ["How do I study for a test?", "Explain photosynthesis simply", "Quiz me on fractions", "Help me make a study schedule"];
      chips.replaceChildren(...ideas.map(s => { const b = el("button", s, "chip"); b.type = "button"; b.onclick = () => send(s); return b; }));
      chips.hidden = history.length > 0;
    }

    function paintFoot() {
      const n = left();
      foot.textContent = n === Infinity ? (UNLIMITED ? "Unlimited messages." : "Owner mode: unlimited messages.") + " Sprout AI can make mistakes, so double-check important facts."
        : n + " of " + DAILY + " messages left today. Sprout AI can make mistakes, so double-check important facts.";
      const out = n <= 0;
      input.disabled = sendBtn.disabled = document.getElementById("chat-attach").disabled = out || busy;
      input.placeholder = out ? "You've used today's messages. Come back tomorrow!" : "Ask Sprout AI a question...";
    }

    function greet() {
      log.replaceChildren();
      const t = topic();
      bubble("model", t
        ? "Hi! I'm **Sprout AI**. I can see you're studying **" + t + "**. Ask me to explain anything, quiz you, or help when you're stuck."
        : "Hi! I'm **Sprout AI**, your study helper. Ask me to explain a topic, quiz you, or help you plan. Tip: open one of your plans first and I'll know what you're studying.");
    }

    function show() {
      ctxEl.replaceChildren();
      if (topic()) { ctxEl.append("Helping with: "); ctxEl.append(el("b", topic())); }
      else ctxEl.textContent = "Ask about anything you're studying.";
      if (!started) { greet(); started = true; }
      drawChips();
      paintFoot();
      if (window.matchMedia("(pointer: fine)").matches) setTimeout(() => input.focus(), 50);
    }

    // What gets sent to /api/chat: the last turns, with each screenshot's data but not its preview URL.
    function payload() {
      return history.slice(-12).map(m => m.images
        ? { role: m.role, text: m.text, images: m.images.map(im => ({ mimeType: im.mimeType, data: im.data })) }
        : { role: m.role, text: m.text });
    }

    async function send(text) {
      text = String(text || "").trim();
      if ((!text && !shots.length) || busy || left() <= 0) return;
      busy = true;
      const images = shots.length ? shots : null;
      history.push(images ? { role: "user", text, images } : { role: "user", text });
      bubble("user", text, "", images);
      shots = []; drawShots(); note("");
      Sfx.play("send");
      input.value = "";
      input.style.height = "";
      chips.hidden = true;
      paintFoot();
      const wait = bubble("model", null);
      wait.innerHTML = '<span class="typing" aria-label="Sprout AI is typing"><i></i><i></i><i></i></span>';

      // Show the reply as it streams in, redrawing at most once per animation frame.
      let reply = "", queued = false, finished = false;
      const paint = (final) => {
        queued = false;
        if (finished) return;
        if (final) finished = true;
        const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
        wait.innerHTML = format(reply) + (final ? "" : '<span class="cursor" aria-hidden="true"></span>');
        if (!final && wait.lastElementChild && wait.lastElementChild.previousElementSibling) {
          const c = wait.lastElementChild, last = c.previousElementSibling;   // keep the cursor at the end of the last line
          (last.tagName === "UL" || last.tagName === "OL" ? last.lastElementChild : last).append(c);
        }
        if (nearBottom) log.scrollTop = log.scrollHeight;
      };
      const grow = chunk => { reply += chunk; if (!queued) { queued = true; requestAnimationFrame(() => paint(false)); } };

      try {
        if (params.has("demo")) {
          await new Promise(r => setTimeout(r, 300));
          const demo = (images ? "Thanks for the **screenshot**! " : "") + "This is a **demo** reply. Here's how I'd help:\n- Break the idea into small steps\n- Give an example\n- Check your understanding with a question\n\nWhat part feels hardest?";
          for (const w of demo.match(/\S+\s*/g)) { grow(w); await new Promise(r => setTimeout(r, 25)); }
        } else {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: payload(), context: context() })
          });
          if (!res.ok) {
            let data = {};
            try { data = await res.json(); } catch (e) {}
            throw new Error(data.error || (res.status === 404 ? "The /api/chat function wasn't found." : res.status === 413 ? "That screenshot is too big. Try a smaller one." : "Request failed (" + res.status + ")"));
          }
          if (res.body && res.body.getReader) {
            const reader = res.body.getReader(), dec = new TextDecoder();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              grow(dec.decode(value, { stream: true }));
            }
            grow(dec.decode());
          } else {
            grow(await res.text());
          }
        }
        reply = reply.trim();
        if (!reply) throw new Error("No answer came back.");
        paint(true);
        Sfx.play("receive");
        history.push({ role: "model", text: reply });
        countOne();
      } catch (err) {
        if (reply.trim()) {   // part of the answer arrived: keep it
          paint(true);
          history.push({ role: "model", text: reply.trim() });
          countOne();
        } else {
          history.pop();   // let them try the same question again
          if (images && !shots.length) { shots = images; drawShots(); }   // put their screenshots back
          wait.closest(".msg").classList.add("err");
          wait.textContent = "Sorry, I couldn't answer that. " + (err.message || "");
        }
      } finally {
        busy = false;
        paintFoot();
        log.scrollTop = log.scrollHeight;
        if (window.matchMedia("(pointer: fine)").matches) input.focus();
      }
    }

    document.getElementById("chat-form").addEventListener("submit", e => { e.preventDefault(); send(input.value); });
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    input.addEventListener("input", () => { input.style.height = ""; input.style.height = Math.min(input.scrollHeight + 2, 160) + "px"; });
    document.getElementById("chat-new").addEventListener("click", () => { history = []; shots = []; drawShots(); greet(); drawChips(); paintFoot(); });
    document.getElementById("ask-ai-btn").addEventListener("click", () => {
      if (history.length) { history = []; started = false; }   // a fresh chat about this plan
      else started = false;
      location.hash = "#ai";
    });
    return { show };
  })();

  // ----- My seeds: every plan created, saved in this browser, plus the screen that lists them.
  function planKey(req) { return "sprout:" + req.topic.toLowerCase() + ":" + req.days; }
  const seedsDB = {
    all() { try { return JSON.parse(store.get("sprout:seeds")) || {}; } catch (e) { return {}; } },
    put(key, rec) {
      const all = seedsDB.all();
      all[key] = Object.assign(all[key] || {}, rec, { ts: Date.now() });
      store.set("sprout:seeds", JSON.stringify(all));
    }
  };
  function showKit(req, g) {
    renderGuide(req, g);
    store.set("sprout:kit:" + planKey(req), JSON.stringify({ req, g }));   // so "Continue" can reopen it later
  }
  function openSeed(key) {
    let kit = null;
    try { kit = JSON.parse(store.get("sprout:kit:" + key)); } catch (e) {}
    if (!kit) return;
    renderGuide(kit.req, kit.g);
    goStudy();
  }
  function renderSeeds() {
    const list = document.getElementById("seeds-list");
    const entries = Object.entries(seedsDB.all()).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    list.replaceChildren();
    document.getElementById("seeds-empty").hidden = entries.length > 0;
    entries.forEach(([key, sd]) => {
      const pct = sd.steps ? Math.round((sd.done / sd.steps) * 100) : 0;
      const bar = el("div", "", "prog"), fill = el("i");
      fill.style.width = pct + "%";
      bar.append(fill);
      const btn = el("button", pct >= 100 ? "Finished!" : pct > 0 ? "Continue" : "Start", "seed-btn" + (pct >= 100 ? " done" : ""));
      btn.type = "button";
      btn.onclick = () => openSeed(key);
      if (!store.get("sprout:kit:" + key)) btn.disabled = true;
      const row = el("div", "", "seed-row");
      row.append(el("span", pct + "%", "seed-pct"), bar, btn);
      const card = el("div", "", "seed-card");
      card.append(el("h3", sd.title || "Untitled plan"), row);
      list.append(card);
    });
  }

  // ----- Onboarding questions (answers are saved in this browser for now; an owner page can read them later).
  const QUESTIONS = [
    { id: "education", q: "What level of education are you in?", options: ["Elementary School", "Middle School", "High School", "College or University", "Graduate School", "Not in school", "Other"] },
    { id: "heard", q: "How did you hear about this site?", options: ["TikTok", "YouTube", "Instagram", "Internet search", "Friends and family", "School or teacher", "Other"] },
    { id: "goal", q: "What are you mainly studying for?", options: ["A test or exam", "Homework or class work", "A competition", "Learning something new", "A big goal, like college or a career"] },
    { id: "subjects", q: "Which subjects do you study the most?", multi: true, options: ["Math", "Science", "History", "English", "Languages", "Computer science", "Other"] },
    { id: "style", q: "How do you like to study?", multi: true, options: ["Flashcards", "Practice problems", "Quizzes", "Reading and notes", "Studying with others"] },
    { id: "weekly", q: "How much time do you study in a typical week?", options: ["Less than 2 hours", "2 to 5 hours", "5 to 10 hours", "More than 10 hours"] }
  ];
  const answers = {};
  let qi = 0;

  function startQuestions() {
    qi = 0;
    Object.keys(answers).forEach(k => delete answers[k]);
    drawQuestion();
  }

  function drawQuestion() {
    const card = document.getElementById("q-card");
    card.replaceChildren();
    if (qi >= QUESTIONS.length) return drawDone(card);
    const Q = QUESTIONS[qi];
    const sel = new Set([].concat(answers[Q.id] || []));
    const bar = el("div", "", "prog"), fill = el("i");
    fill.style.width = (qi / QUESTIONS.length) * 100 + "%";
    bar.append(fill);

    const cont = el("button", qi + 1 === QUESTIONS.length ? "Finish" : "Continue", "btn-sm");
    cont.type = "button";
    cont.disabled = !sel.size;
    const opts = el("div", "", "q-opts");
    Q.options.forEach(o => {
      const b = el("button", o, "q-opt");
      b.type = "button";
      b.setAttribute("aria-pressed", String(sel.has(o)));
      b.onclick = () => {
        Sfx.play("pop");
        if (Q.multi) { sel.has(o) ? sel.delete(o) : sel.add(o); } else { sel.clear(); sel.add(o); }
        opts.querySelectorAll(".q-opt").forEach(x => x.setAttribute("aria-pressed", String(sel.has(x.textContent))));
        cont.disabled = !sel.size;
      };
      opts.append(b);
    });
    cont.onclick = () => { answers[Q.id] = Q.multi ? [...sel] : [...sel][0]; qi++; drawQuestion(); };
    const back = el("button", "Back", "btn-sm secondary");
    back.type = "button";
    back.hidden = qi === 0;
    back.onclick = () => { qi--; drawQuestion(); };
    const row = el("div", "", "nav-row");
    row.append(back, cont);

    card.append(el("p", "Question " + (qi + 1) + " of " + QUESTIONS.length, "meta"), bar, el("h2", Q.q, "qq"));
    if (Q.multi) card.append(el("p", "Pick as many as you like.", "hint"));
    card.append(opts, row);
  }

  function drawDone(card) {
    Sfx.play("reward");
    store.set("sprout:profile", JSON.stringify(Object.assign({ ts: Date.now() }, answers)));
    store.set("sprout:onboarded", "1");
    const go = el("a", "Start Planting", "cta");
    go.href = "#start";
    card.append(el("h2", "You're all set. Thank you!", "qq"), el("p", "Now let's plant your first seed."), go);
  }

  // Three screens: home (which includes the planner at #start), the questions (#questions) and My Seeds (#seeds).
  // Any other link is just a scroll target on the home page.
  const views = {
    home: document.getElementById("home-view"),
    questions: document.getElementById("questions-view"),
    seeds: document.getElementById("seeds-view"),
    shop: document.getElementById("shop-view"),
    garden: document.getElementById("garden-view"),
    ai: document.getElementById("ai-view"),
    study: document.getElementById("study-view"),
    check: document.getElementById("check-view")
  };
  function route() {
    const h = location.hash;
    const name = h === "#seeds" ? "seeds" : h === "#questions" ? "questions" : h === "#shop" ? "shop" : h === "#garden" ? "garden" : h === "#ai" ? "ai" : h === "#study" ? "study" : h === "#check" ? "check" : "home";
    if ((name === "study" || name === "check") && !currentKit) { location.hash = "#start"; return; }   // nothing open yet
    if (name === "check" && !examOpen) { location.hash = "#study"; return; }   // the check screen only opens from a checkpoint
    if (name !== "check") examOpen = false;
    Object.keys(views).forEach(k => { views[k].hidden = k !== name; });
    if (name === "seeds") renderSeeds();
    if (name === "shop") renderShop();
    if (name === "garden") renderGarden();
    if (name === "ai") SproutAI.show();
    if (name === "questions") startQuestions();
    if (name !== "home") {
      views[name].classList.remove("view-in");
      void views[name].offsetWidth;
      views[name].classList.add("view-in");
    }
    if (name !== "home") {
      window.scrollTo(0, 0);
    } else if (h.length > 1) {
      try { const t = document.querySelector(h); if (t) t.scrollIntoView(); } catch (e) {}
    }
    if (afterRoute) { const f = afterRoute; afterRoute = null; setTimeout(f, 50); }
  }
  // A refresh always starts back on the home page ("Grow your knowledge...").
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  // Owner links (?owner=...&sprouts=...) are applied once, then removed from the address bar,
  // so the secret code doesn't stay visible and a refresh doesn't reset your sprouts.
  const cleanQ = new URLSearchParams(location.search);
  ["owner", "sprouts", "reset"].forEach(k => cleanQ.delete(k));
  const cleanSearch = cleanQ.toString() ? "?" + cleanQ : "";
  if (location.hash || cleanSearch !== location.search) history.replaceState(null, "", location.pathname + cleanSearch);
  window.scrollTo(0, 0);
  window.addEventListener("hashchange", route);
  route();
  Sprouts.paint();
  Streak.paint();
  Daily.paint();
  document.getElementById("gift-btn").addEventListener("click", Daily.open);
  if (!Daily.claimedToday()) setTimeout(Daily.open, 1200);

  // Scatter the chromatic bubbles across the screen, each with its own size, drift path and speed.
  (function makeBubbles() {
    const box = document.getElementById("bubbles");
    if (!box) return;
    const r = (a, b) => a + Math.random() * (b - a);
    const count = window.innerWidth < 560 ? 16 : 26;
    for (let i = 0; i < count; i++) {
      const b = document.createElement("span");
      b.className = "bub";
      const size = Math.round(Math.pow(Math.random(), 2) * 40 + 12);   // mostly tiny, a few bigger
      b.style.cssText =
        "width:" + size + "px;height:" + size + "px;" +
        "left:" + r(0, 96).toFixed(1) + "%;top:" + r(0, 96).toFixed(1) + "%;" +
        "--x1:" + r(-38, 38).toFixed(1) + "vw;--y1:" + r(-38, 38).toFixed(1) + "vh;" +
        "--x2:" + r(-38, 38).toFixed(1) + "vw;--y2:" + r(-38, 38).toFixed(1) + "vh;" +
        "--dur:" + r(80, 150).toFixed(0) + "s;--spin:" + r(30, 70).toFixed(0) + "s;--rot:" + r(0, 360).toFixed(0) + "deg;" +
        "animation-delay:-" + r(0, 120).toFixed(0) + "s;";
      box.append(b);
    }
  })();

