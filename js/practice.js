  function finishMsg(score, total) {
    const r = score / total;
    return r >= 0.8 ? "You're flourishing!" : r >= 0.5 ? "Keep growing!" : "Every tree starts as a seed. Give it another go!";
  }

  // A worksheet answer is right if it equals the model answer or contains at least half of the key words.
  function matches(text, it) {
    const norm = t => String(t).toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ").trim();
    const a = norm(text);
    if (a === norm(it.answer)) return true;
    const kw = (it.keywords || []).map(norm).filter(Boolean);
    if (!kw.length) return false;
    return kw.filter(k => a.includes(k)).length >= Math.ceil(kw.length / 2);
  }

  // Today's lesson: sections that build the idea, a worked example you reveal one step at a time
  // (try each step yourself first), why it matters, and the key takeaways.
  function runLesson(panel, L, onDone) {
    const parts = [];
    (L.lesson || []).forEach((sec, n) => {
      const box = el("div", "", "lesson-sec");
      box.append(el("h4", (n + 1) + ". " + (sec.heading || "Part " + (n + 1)), "lesson-h"), el("p", sec.text || ""));
      parts.push(box);
    });
    const done = btn("I've read and understood it ✓", "btn-sm", () => { Sfx.play("pass"); done.disabled = true; done.textContent = "Lesson done ✓"; onDone(); });
    const ex = L.example;
    if (ex && Array.isArray(ex.steps) && ex.steps.length) {
      const box = el("div", "", "worked");
      box.append(el("p", "Worked example", "worked-tag"), el("h4", ex.title || "Try it", "lesson-h"));
      if (ex.problem) box.append(el("p", ex.problem, "worked-problem"));
      const ol = el("ol", "", "worked-steps");
      let shown = 0;
      const answer = el("p", "", "worked-answer");
      answer.hidden = true;
      answer.append(el("b", "Answer: "), String(ex.answer || ""));
      const reveal = btn("", "btn-sm secondary", () => {
        if (shown < ex.steps.length) { ol.append(el("li", ex.steps[shown])); shown++; Sfx.play("pop"); }
        else { answer.hidden = false; reveal.remove(); done.disabled = false; const n = panel.querySelector(".cp-note"); if (n) n.textContent = ""; Sfx.play("gotit"); return; }
        reveal.textContent = shown < ex.steps.length ? "Show step " + (shown + 1) : "Show the answer";
      });
      reveal.textContent = "Show step 1";
      box.append(el("p", "Before each step, pause and try it yourself. Then reveal it to check your thinking.", "worked-how"), ol, answer, reveal);
      parts.push(box);
      done.disabled = true;
    }
    if (L.connection) {
      const box = el("div", "", "lesson-why");
      box.append(el("b", "Why it matters: "), L.connection);
      parts.push(box);
    }
    if (Array.isArray(L.takeaways) && L.takeaways.length) {
      const box = el("div", "", "takeaways");
      box.append(el("p", "Remember these 3 things", "worked-tag"), list(L.takeaways, "ol"));
      parts.push(box);
    }
    const note = el("p", ex && ex.steps && ex.steps.length ? "Work through the example to finish the lesson." : "", "cp-note");
    panel.replaceChildren(...parts, done, note);
    const old = done.onclick;
    done.onclick = e => { note.textContent = ""; old(e); };
  }

  // "Think deeper": open questions answered in your own words, then feedback from Sprout AI and a strong answer to compare.
  function runThink(panel, items, title, onDone) {
    if (!items.length) { panel.replaceChildren(el("p", "No questions today. Nice!", "cp-tip")); onDone(); return; }
    const rows = items.map((q, n) => {
      const ta = document.createElement("textarea");
      ta.className = "test-answer";
      ta.rows = 3;
      ta.maxLength = 1000;
      ta.placeholder = "Explain it in your own words (2 to 4 sentences)...";
      ta.setAttribute("aria-label", "Your answer to question " + (n + 1));
      const out = el("div", "", "test-fb"), li = el("li", "", "test-item");
      li.append(el("p", q.question, "test-q"), ta, out);
      return { q, ta, out, li };
    });
    const ol = el("ol", "", "test-list");
    rows.forEach(r => ol.append(r.li));
    const note = el("p", "", "cp-note");
    const go = btn("Check my answers", "btn-sm", async () => {
      if (rows.some(r => r.ta.value.trim().split(/\s+/).length < 4)) { note.textContent = "Write a real answer for each question first. Even a guess helps your brain learn!"; Sfx.play("wrong"); return; }
      go.disabled = true;
      rows.forEach(r => { r.ta.disabled = true; });
      note.replaceChildren(loading("Sprout AI is reading your answers..."));
      let results;
      try {
        const res = await coach({ mode: "grade", topic: title, items: rows.map(r => ({ question: r.q.question, answer: r.q.answer || "", points: r.q.points || [], response: r.ta.value.trim() })) });
        results = res.results || [];
        if (results.length !== rows.length) throw new Error("Some answers weren't checked.");
      } catch (err) {
        go.disabled = false;
        rows.forEach(r => { r.ta.disabled = false; });
        note.textContent = "Couldn't check your answers. " + (err.message || "") + " Try again.";
        return;
      }
      let full = 0;
      results.forEach((res, n) => {
        const sc = Math.max(0, Math.min(1, Number(res.score) || 0)), r = rows[n];
        if (sc >= 1) { full++; Sprouts.studyOnce("think:" + r.q.question, 15, "Great explanation"); }
        r.li.classList.add(sc >= 1 ? "full" : sc > 0 ? "part" : "miss");
        r.out.replaceChildren(el("b", sc >= 1 ? "✓ Strong answer. " : sc > 0 ? "½ Getting there. " : "✗ Not yet. "), String(res.feedback || ""));
        if (r.q.answer) r.out.append(el("span", "Compare with: " + r.q.answer, "test-model"));
      });
      Sfx.play(full === rows.length ? "pass" : "again");
      note.textContent = full === rows.length ? "Excellent thinking!" : "Read the feedback and compare your answer with the strong one. Noticing the difference is how you learn.";
      go.remove();
      onDone();
    });
    panel.replaceChildren(el("p", "These don't have one-word answers. Explain your thinking: why it happens, how it works, or what would change.", "cp-tip"), ol, note, go);
  }

  // One question at a time, for both the worksheet ("sheet") and the quiz ("quiz").
  function runSet(panel, items, kind, onDone) {
    let order = items.map((_, i) => i), pos = 0, score = 0, missed = [];

    function show() {
      panel.replaceChildren();
      if (pos >= order.length) return done();
      const it = items[order[pos]];
      const bar = el("div", "", "prog"), fill = el("i");
      fill.style.width = (pos / order.length) * 100 + "%";
      bar.append(fill);
      panel.append(el("p", (kind === "quiz" ? "Question " : "Problem ") + (pos + 1) + " of " + order.length, "meta"), bar, el("h3", it.question, "q"));

      const fb = el("div", "", "feedback");
      const next = el("button", pos + 1 === order.length ? "See results" : "Next", "btn-sm");
      next.type = "button";
      next.hidden = true;
      next.onclick = () => { pos++; show(); };
      const settle = (ok, msg) => {
        Sfx.play(ok ? "correct" : "wrong");
        if (ok) { score++; Sprouts.studyOnce(kind + ":" + it.question, 10, "Correct answer"); Streak.mark(); } else missed.push(order[pos]);
        fb.textContent = msg;
        fb.className = "feedback " + (ok ? "good" : "bad");
        next.hidden = false;
        next.focus();
      };

      if (kind === "quiz") {
        const opts = el("div", "", "opts");
        (it.options || []).forEach((o, i) => {
          const b = el("button", o, "opt-btn");
          b.type = "button";
          b.onclick = () => {
            opts.querySelectorAll("button").forEach((x, j) => { x.disabled = true; if (j === it.answer) x.classList.add("right"); });
            if (i !== it.answer) b.classList.add("wrong");
            settle(i === it.answer, (i === it.answer ? "Nice, that's growing! " : "Not quite. ") + (it.explanation || ""));
          };
          opts.append(b);
        });
        panel.append(opts);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Type your answer";
        input.setAttribute("aria-label", "Your answer");
        const check = el("button", "Check", "btn-sm");
        check.type = "button";
        const run = () => {
          if (!input.value.trim() || input.disabled) return;
          input.disabled = check.disabled = true;
          const ok = matches(input.value, it);
          settle(ok, ok ? "Correct. Keep growing!" : "Not quite. The answer is: " + it.answer);
        };
        check.onclick = run;
        input.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
        const row = el("div", "", "answer-row");
        row.append(input, check);
        panel.append(row);
      }
      panel.append(fb, next);
    }

    function done() {
      Sfx.play(score >= order.length * 0.8 ? "pass" : "again");
      if (onDone) onDone();
      panel.append(el("h3", score + " of " + order.length + " correct", "q"), el("p", finishMsg(score, order.length)));
      const row = el("div", "", "nav-row");
      if (missed.length) {
        const topics = [...new Set(missed.map(i => items[i].topic).filter(Boolean))];
        if (topics.length) panel.append(el("p", "Worth another look: " + topics.join(", ") + ".", "meta"));
        const again = el("button", "Practice what you missed", "btn-sm");
        again.type = "button";
        again.onclick = () => { order = missed.slice(); missed = []; pos = 0; score = 0; show(); };
        row.append(again);
      }
      const restart = el("button", "Start over", "btn-sm secondary");
      restart.type = "button";
      restart.onclick = () => { order = items.map((_, i) => i); missed = []; pos = 0; score = 0; show(); };
      row.append(restart);
      panel.append(row);
    }
    show();
  }

  // Flashcards with spaced repetition: cards you miss come back sooner, cards you know drift away.
  // Each card has a "box" from 0 to 4 that is remembered in this browser, so weak cards come first next time.
  function runCards(panel, cards, onDone) {
    const BOXES = "sprout:cardboxes";
    const loadBoxes = () => { try { return JSON.parse(store.get(BOXES)) || {}; } catch (e) { return {}; } };
    const boxOf = c => loadBoxes()[c.front] || 0;
    const setBox = (c, b) => { const all = loadBoxes(); all[c.front] = Math.max(0, Math.min(4, b)); store.set(BOXES, JSON.stringify(all)); };

    const wrap = el("div", "", "flip"), inner = el("div", "", "flip-in"), front = el("div", "", "face"), back = el("div", "", "face back");
    inner.append(front, back);
    wrap.append(inner);
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "button");
    wrap.setAttribute("aria-label", "Flip card");
    const count = el("p", "", "meta");
    count.style.textAlign = "center";
    const boxes = el("div", "", "srs-boxes");
    boxes.setAttribute("aria-hidden", "true");
    const again = el("button", "Still learning", "btn-sm again"), gotIt = el("button", "Got it", "btn-sm");
    again.type = gotIt.type = "button";
    const srs = el("div", "", "srs-row");
    srs.append(again, gotIt);
    const flipHint = el("p", "Type your answer from memory first, then flip to check.", "meta");
    flipHint.style.textAlign = "center";
    const guess = document.createElement("input");
    guess.type = "text";
    guess.className = "card-guess";
    guess.placeholder = "Your answer...";
    guess.setAttribute("aria-label", "Type your answer before flipping");
    const flipBtn = btn("Flip to check", "btn-sm", () => flip());
    const unsure = btn("I'm not sure, show me", "btn-sm secondary", () => { guess.value = ""; flip(true); });
    const guessRow = el("div", "", "guess-row");
    guessRow.append(guess, flipBtn, unsure);
    const yours = el("p", "", "card-yours");
    guess.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); flip(); } });

    let queue, learned, current;
    function start() {
      queue = cards.slice().sort((a, b) => boxOf(a) - boxOf(b));   // weakest cards first
      learned = 0;
      draw();
    }
    function draw() {
      if (!queue.length) return finish();
      current = queue[0];
      wrap.classList.remove("flipped");
      front.textContent = current.front;
      setTimeout(() => { back.textContent = current.back; }, 250);
      count.textContent = learned + " of " + cards.length + " learned · " + queue.length + " to go";
      boxes.replaceChildren(...[0, 1, 2, 3, 4].map(i => el("i", "", i < boxOf(current) + 1 ? "on" : "")));
      srs.hidden = true;
      flipHint.hidden = false;
      if (flipHint.dataset.base) flipHint.textContent = flipHint.dataset.base;
      guessRow.hidden = false;
      guess.value = "";
      yours.textContent = "";
      panel.replaceChildren(wrap, count, boxes, flipHint, guessRow, yours, srs);
      setTimeout(() => { if (window.matchMedia("(pointer: fine)").matches) guess.focus(); }, 50);
    }
    function flip(skip) {
      if (!wrap.classList.contains("flipped") && !skip && !guess.value.trim()) {   // think first: make a guess before seeing the answer
        flipHint.textContent = "Make a guess first! Trying to remember is what makes it stick. (Or press “I'm not sure”.)";
        guess.focus();
        return;
      }
      Sfx.play("flip");
      wrap.classList.toggle("flipped");
      if (wrap.classList.contains("flipped")) {
        srs.hidden = false; flipHint.hidden = true; guessRow.hidden = true;
        yours.textContent = guess.value.trim() ? "You wrote: “" + guess.value.trim() + "”. Was it right? Be honest with yourself:" : "Now you know it. Next time, try to remember it first.";
      }
    }
    again.onclick = () => {                      // comes back after two more cards
      Sfx.play("again");
      setBox(current, 0);
      queue.shift();
      queue.splice(Math.min(2, queue.length), 0, current);
      draw();
    };
    gotIt.onclick = () => {
      Sfx.play("gotit");
      setBox(current, boxOf(current) + 1);
      queue.shift();
      learned++;
      Streak.mark();
      draw();
    };
    function finish() {
      Sfx.play("pass");
      Sprouts.studyOnce("deck:" + cards.map(c => c.front).join("|").slice(0, 200), 30, "Deck learned");
      if (onDone) onDone();
      const restart = el("button", "Study again", "btn-sm");
      restart.type = "button";
      restart.onclick = start;
      const row = el("div", "", "nav-row");
      row.append(restart);
      panel.replaceChildren(el("h3", "All " + cards.length + " cards learned!", "q"), el("p", "Nice work. Cards you struggled with will show up first next time."), row);
    }
    wrap.addEventListener("click", () => flip());
    wrap.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    flipHint.dataset.base = flipHint.textContent;
    start();
  }

  // Guided worksheet: the study guide rewritten with blanks. Sprout AI tutors each wrong answer with a hint made for it,
  // and after three wrong tries it shows the answer and explains why.
  const BLANK = /\{\{([^}|]+)(?:\|([^}]*))?\}\}/g;
  function sectionsOf(g) {
    return (Array.isArray(g.worksheet) ? g.worksheet : []).map(x => {
      if (x && x.text) return { heading: String(x.heading || ""), text: String(x.text), deeper: String(x.deeper || ""), deeperAnswer: String(x.deeperAnswer || ""), deeperPoints: Array.isArray(x.deeperPoints) ? x.deeperPoints : [] };
      const t = String((x && (x.sentence || x.question)) || ""), a = String((x && x.answer) || "").replace(/[{}|]/g, "");   // older worksheets
      if (!a) return null;
      const blank = "{{" + a + "|" + String(((x.hints || [])[0]) || "").replace(/[{}|]/g, "") + "}}";
      return { heading: "", text: /_{2,}/.test(t) ? t.replace(/_{2,}/, blank) : t + " " + blank };
    }).filter(x => x && /\{\{[^}]+\}\}/.test(x.text));
  }
  const countBlanks = g => sectionsOf(g).reduce((n, x) => n + (x.text.match(BLANK) || []).length, 0);
  function blankOk(input, ans) {
    const n = t => String(t).toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ").trim().replace(/(.)s$/, "$1");
    return ans.split("/").some(a => n(a) !== "" && n(a) === n(input));
  }
  function runWorksheet(panel, g, title, onDone) {
    const secs = sectionsOf(g);
    const praise = ["Nice!", "Exactly right!", "You got it!", "Perfect!", "Great job!"];
    function say(tutor, kind, text) {
      const av = el("div", "", "av"), msg = el("div", "", "tmsg");
      av.append(Shop.icon());
      msg.append(el("span", "Sprout AI", "tname"));
      if (text === null) { const dots = el("span", "", "typing"); dots.append(el("i"), el("i"), el("i")); msg.append(dots); }
      else msg.append(text);
      tutor.className = "tutor " + kind;
      tutor.hidden = false;
      tutor.replaceChildren(av, msg);
    }
    function fallbackHint(b) {
      const a = b.ans.split("/")[0];
      if (b.tries === 1 && b.hint) return b.hint;
      return "It starts with “" + a.slice(0, b.tries === 1 ? 1 : 2) + "”" + (b.tries > 1 ? " and has " + a.replace(/\s/g, "").length + " letters." : ".");
    }
    // A "think deeper" question under each section: write an explanation, then Sprout AI gives feedback.
    function deeperBox(sec) {
      const box = el("div", "", "deeper"), ta = document.createElement("textarea"), out = el("div", "", "test-fb");
      ta.rows = 2;
      ta.maxLength = 800;
      ta.className = "test-answer";
      ta.placeholder = "Explain your thinking...";
      ta.setAttribute("aria-label", sec.deeper);
      const go = btn("Check my thinking", "btn-sm secondary", async () => {
        if (ta.value.trim().split(/\s+/).length < 4) { out.textContent = "Write a few words of explanation first."; return; }
        go.disabled = ta.disabled = true;
        out.replaceChildren(loading("Sprout AI is reading..."));
        try {
          const r = await coach({ mode: "grade", topic: title, items: [{ question: sec.deeper, answer: sec.deeperAnswer, points: sec.deeperPoints, response: ta.value.trim() }] });
          const res = (r.results || [])[0] || {}, sc = Number(res.score) || 0;
          box.classList.add(sc >= 1 ? "full" : sc > 0 ? "part" : "miss");
          out.replaceChildren(el("b", sc >= 1 ? "✓ Strong thinking. " : sc > 0 ? "½ Getting there. " : "✗ Not yet. "), String(res.feedback || ""));
          if (sec.deeperAnswer) out.append(el("span", "Compare with: " + sec.deeperAnswer, "test-model"));
          Sfx.play(sc >= 1 ? "correct" : "hint");
          if (sc >= 1) Sprouts.studyOnce("deeper:" + sec.deeper, 15, "Great explanation");
          go.remove();
        } catch (e) {
          go.disabled = ta.disabled = false;
          out.textContent = "Couldn't check that right now. Try again.";
        }
      });
      box.append(el("p", "Think deeper", "deeper-tag"), el("p", sec.deeper, "deeper-q"), ta, go, out);
      return box;
    }
    function start() {
      const sheet = el("div", "", "ws"), bar = el("div", "", "prog"), fill = el("i"), count = el("p", "", "meta ws-count");
      bar.append(fill);
      sheet.append(el("h3", "Worksheet: " + title, "ws-title"),
        el("p", "This is your study guide with blanks. Type each missing word and press Enter. If you get one wrong, Sprout AI will give you a hint, and after 3 tries it shows you the answer.", "ws-how"), bar, count);
      const blanks = [];
      secs.forEach(sec => {
        const block = el("div", "", "ws-sec"), par = el("p", "", "ws-par"), tutor = el("div", "", "tutor");
        tutor.hidden = true;
        if (sec.heading) block.append(el("h4", sec.heading, "ws-h"));
        let last = 0;
        for (const m of sec.text.matchAll(BLANK)) {
          par.append(sec.text.slice(last, m.index));
          const ans = m[1].trim(), input = document.createElement("input");
          input.type = "text";
          input.className = "ws-blank";
          input.autocomplete = "off";
          input.spellcheck = false;
          input.setAttribute("aria-label", "Blank " + (blanks.length + 1));
          input.style.width = Math.max(6, Math.min(18, Math.max(...ans.split("/").map(x => x.length)) + 3)) + "ch";
          const at = m.index;
          const ctx = sec.text.replace(BLANK, (mm, a2, h2, off) => off === at ? "___" : a2.split("/")[0]);
          const b = { input, ans, hint: (m[2] || "").trim(), ctx, tutor, tries: 0, status: "open", busy: false };
          input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(b); } });
          blanks.push(b);
          par.append(input);
          last = at + m[0].length;
        }
        par.append(sec.text.slice(last));
        block.append(par, tutor);
        if (sec.deeper) block.append(deeperBox(sec));
        sheet.append(block);
      });
      const end = el("div", "", "ws-end");
      sheet.append(end);
      panel.replaceChildren(sheet);

      function paint() {
        const done = blanks.filter(b => b.status !== "open").length;
        fill.style.width = (done / blanks.length) * 100 + "%";
        count.textContent = done + " of " + blanks.length + " blanks done";
      }
      function lock(b, cls) { b.input.disabled = true; b.input.classList.add(cls); }
      function next(b) {
        paint();
        const open = blanks.find(x => x.status === "open");
        if (open) { open.input.focus(); return; }
        const right = blanks.filter(x => x.status === "ok").length, row = el("div", "", "nav-row");
        row.append(btn("Start a fresh copy", "btn-sm secondary", start));
        Sfx.play("pass");
        end.replaceChildren(el("h3", right + " of " + blanks.length + " filled in without needing the answer", "q"), el("p", finishMsg(right, blanks.length)), row);
        if (onDone) onDone();
      }
      async function check(b) {
        const val = b.input.value.trim();
        if (b.status !== "open" || b.busy || !val) return;
        const first = b.ans.split("/")[0];
        if (blankOk(val, b.ans)) {
          b.status = "ok";
          lock(b, "ok");
          Sfx.play("correct");
          say(b.tutor, "good", "✓ " + praise[Math.floor(Math.random() * praise.length)] + " “" + val + "” is right.");
          Sprouts.studyOnce("ws:" + b.ctx.slice(0, 160), 10, "Correct answer");
          Streak.mark();
          return next(b);
        }
        b.tries++;
        const reveal = b.tries >= 3;
        Sfx.play("wrong");
        b.busy = true;
        b.input.disabled = true;
        say(b.tutor, "hint", null);
        let msg = "";
        try { msg = String((await coach({ mode: "tutor", topic: title, sentence: b.ctx, answer: first, attempt: val, tries: b.tries })).message || ""); } catch (e) {}
        if (!reveal && b.ans.split("/").some(a => a && msg.toLowerCase().includes(a.toLowerCase()))) msg = "";   // never give the answer away early
        b.busy = false;
        if (reveal) {
          b.status = "shown";
          b.input.value = first;
          lock(b, "shown");
          say(b.tutor, "shown", "The answer is “" + first + "”. " + msg);
          return next(b);
        }
        b.input.disabled = false;
        Sfx.play("hint");
        say(b.tutor, "hint", "Hint " + b.tries + " of 2: " + (msg || fallbackHint(b)));
        b.input.classList.remove("shake"); void b.input.offsetWidth; b.input.classList.add("shake");
        b.input.focus();
        b.input.select();
      }
      paint();
    }
    start();
  }

  // ----- The Study screen: the study guide first, then the checklist, then optional practice.
  let currentKit = null;   // the plan open right now, so Sprout AI knows what you're studying
  const Study = (function () {
    const choicesEl = document.getElementById("choices"), activity = document.getElementById("activity");
    const panel = document.getElementById("activity-panel"), card = document.getElementById("chooser-card");
    const TITLES = { cards: "Flashcards", sheet: "Guided worksheet", quiz: "Quiz" };
    let kit = null, done = new Set();
    const counts = g => ({ cards: (g.flashcards || []).length, sheet: countBlanks(g), quiz: (g.quiz || []).length });
    const LABEL = { cards: n => n + " cards", sheet: n => n + " blanks to fill", quiz: n => n + " questions" };

    function open(req, g) {
      kit = { req, g };
      done = new Set();
      const box = document.getElementById("guide-body");
      box.replaceChildren(el("h2", g.title || req.topic), el("p", "Quick study guide", "meta"), el("p", g.overview));
      const dl = el("dl");
      (g.keyConcepts || []).forEach(c => dl.append(el("dt", c.term), el("dd", c.explanation)));
      box.append(el("h3", "Key concepts"), dl);
      box.append(el("h3", "Facts and formulas to know"), list(g.keyFacts, "ul"));
      box.append(el("h3", "Common mistakes"), list(g.commonMistakes, "ul"));
      box.append(el("h3", "Test yourself"), list(g.quickCheck, "ol"));
      const n = counts(g);
      choicesEl.querySelectorAll(".choice").forEach(b => {
        b.hidden = !n[b.dataset.act];
        b.querySelector("small").textContent = n[b.dataset.act] ? LABEL[b.dataset.act](n[b.dataset.act]) : "";
      });
      card.hidden = !Object.values(n).some(Boolean);
      paintChoices();
      back();
      Path.open(req, g);
    }
    function back() { choicesEl.hidden = false; activity.hidden = true; panel.replaceChildren(); }
    function choose(type) {
      if (!counts(kit.g)[type]) return;
      choicesEl.hidden = true;
      activity.hidden = false;
      document.getElementById("activity-title").textContent = TITLES[type];
      const finished = () => { done.add(type); paintChoices(); };
      if (type === "cards") runCards(panel, kit.g.flashcards, finished);
      else if (type === "sheet") runWorksheet(panel, kit.g, kit.g.title || kit.req.topic, finished);
      else runSet(panel, kit.g.quiz, "quiz", finished);
      card.scrollIntoView({ block: "start" });
    }
    function paintChoices() { choicesEl.querySelectorAll(".choice").forEach(b => b.classList.toggle("is-done", done.has(b.dataset.act))); }

    choicesEl.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => choose(b.dataset.act)));
    document.getElementById("activity-back").addEventListener("click", () => { back(); card.scrollIntoView({ block: "start" }); });
    document.getElementById("read-btn").addEventListener("click", () => document.getElementById("plan").scrollIntoView({ block: "start" }));
    return { open, choose };
  })();
  function renderGuide(req, g) {
    currentKit = { req, g };
    Study.open(req, g);
  }
  function goStudy() { if (location.hash === "#study") route(); else location.hash = "#study"; }

