  // ----- The checklist: one checkpoint at a time. You can only check a day off by passing a 5-question benchmark
  // (90% or higher), and the unit ends with an open-response test you need 85% or higher on.
  let examOpen = false, afterRoute = null;   // the check screen (#check) is only open during a benchmark or the unit test
  const PASS_DAY = 0.9, PASS_TEST = 0.85, TEST_MC = 9, TEST_OPEN = 3;   // the unit test: 9 multiple choice + 3 open response
  const Path = (function () {
    let kit = null, key = "", title = "", days = [], prog = { day: 0, test: false }, tree = null, lastIdx = -1;
    let benchSeen = [], testSeen = [];
    const card = () => document.getElementById("checkpoint");
    const exam = () => document.getElementById("exam-body");
    // Benchmarks and the unit test happen on their own screen, so the study guide isn't right there to copy from.
    function enterExam(label) {
      document.getElementById("exam-label").textContent = label;
      examOpen = true;
      if (location.hash === "#check") window.scrollTo(0, 0); else location.hash = "#check";
    }
    function leaveExam(target) {
      examOpen = false;
      paint();
      afterRoute = () => { const t = document.getElementById(target || "plan"); if (t) t.scrollIntoView({ block: "start", behavior: "instant" }); };
      location.hash = "#study";
    }
    // Each checkpoint is studied in order: learn it, recall it, think deeper, and only then check it off.
    const STEPS = [
      { id: "learn", title: "Learn it", sub: "Read today's lesson: the big ideas explained, a worked example, and why it matters." },
      { id: "recall", title: "Recall it", sub: "Flashcards for today. Type your answer from memory before you flip." },
      { id: "think", title: "Think deeper", sub: "Answer 2 questions in your own words. Sprout AI gives you feedback." }
    ];
    const stepsDone = i => (prog.steps && prog.steps[i]) || {};
    const allStepsDone = i => STEPS.every(s => stepsDone(i)[s.id]);
    const toPlan = () => document.getElementById("plan").scrollIntoView({ block: "start" });
    function markStep(i, id) {
      prog.steps = Object.assign({}, prog.steps);
      prog.steps[i] = Object.assign({}, prog.steps[i], { [id]: true });
      save();
    }
    async function getLesson(i) {
      const k = "sprout:lesson:" + key + ":" + i;
      try { const saved = JSON.parse(store.get(k)); if (saved && saved.lesson) return saved; } catch (e) {}
      const d = days[i];
      const L = params.has("demo") ? JSON.parse(JSON.stringify(DEMO.lesson))   // ?demo=1: a sample lesson, no AI needed
        : await coach({ mode: "lesson", topic: title, goal: d.goal || "", focus: (d.focus || []).join(", "), guide: guideText(kit.g) });
      if (!L || !Array.isArray(L.lesson) || !L.lesson.length) throw new Error("The lesson didn't come through.");
      L.flashcards = (L.flashcards || []).filter(c => c && c.front && c.back);
      L.think = (L.think || []).filter(q => q && q.question);
      store.set(k, JSON.stringify(L));
      return L;
    }
    async function openStep(id) {
      const i = prog.day, d = days[i], step = STEPS.find(s => s.id === id), c = card();
      const panel = el("div", "", "today-panel"), after = el("div", "", "nav-row");
      const backBtn = btn("← Today's steps", "btn-sm secondary back-steps", () => { paint(); toPlan(); });
      c.replaceChildren(backBtn, el("p", "Checkpoint " + (i + 1) + " · Step " + (STEPS.indexOf(step) + 1) + " of 4 · " + step.title, "cp-label"),
        el("h3", d.goal || "Today's checkpoint", "cp-goal"), panel, after);
      toPlan();
      let L;
      if (!store.get("sprout:lesson:" + key + ":" + i)) panel.append(loading("Sprout is preparing today's lesson..."));
      try { L = await getLesson(i); }
      catch (err) {
        panel.replaceChildren(el("p", "Couldn't load today's lesson. " + (err.message || ""), "cp-error"), btn("Try again", "btn-sm", () => openStep(id)));
        return;
      }
      if (prog.day !== i) return;
      const finished = () => {
        if (!stepsDone(i)[id]) {
          markStep(i, id);
          Sprouts.studyOnce("step:" + key + ":" + i + ":" + id, 20, step.title + " done");
          Streak.mark();
        }
        paintTree();
        const next = STEPS.find(s => !stepsDone(i)[s.id]);
        after.replaceChildren(next ? btn("Next: " + next.title + " →", "btn-sm", () => openStep(next.id))
          : btn("All steps done! Take today's check →", "btn-sm", startBench), btn("Back to today's steps", "btn-sm secondary", () => { paint(); toPlan(); }));
      };
      if (id === "learn") runLesson(panel, L, finished);
      else if (id === "recall") runCards(panel, L.flashcards.length ? L.flashcards : (kit.g.flashcards || []), finished);
      else runThink(panel, L.think, title, finished);
    }
    const total = () => days.length + 1;                      // every day, plus the unit test
    const doneCount = () => prog.day + (prog.test ? 1 : 0);
    const treeName = () => tree.id === "tree" ? "tree" : tree.name + " tree";

    function open(req, g) {
      kit = { req, g };
      key = planKey(req);
      title = g.title || req.topic;
      days = Array.isArray(g.plan) && g.plan.length ? g.plan : [{ when: "Day 1", goal: "Learn the key ideas" }];
      tree = Shop.equipped();
      lastIdx = -1;
      benchSeen = []; testSeen = [];
      try { prog = JSON.parse(store.get("sprout:prog:" + key)); } catch (e) { prog = null; }
      if (!prog || typeof prog.day !== "number") {           // plans from before checkpoints: keep finished days
        let old = null;
        try { old = JSON.parse(store.get(key)); } catch (e) {}
        const steps = Array.isArray(old) ? old : (old && old.steps) || [];
        let n = 0;
        while (n < days.length && steps[n]) n++;
        prog = { day: n, test: false };
      }
      save();
      paint();
    }
    function save() {
      store.set("sprout:prog:" + key, JSON.stringify(prog));
      seedsDB.put(key, { title, steps: total(), done: doneCount(), tree: tree.id });
    }
    function paintTree() {
      const idx = Math.round((doneCount() / total()) * 5);   // 0 = seed ... 5 = full tree
      const plant = document.getElementById("plant");
      plant.replaceChildren(Shop.stageSVG(tree, idx), el("div", Shop.stageName(tree, idx), "plant-name"));
      if (tree.boost) plant.append(el("div", "+" + tree.boost + "% sprouts", "plant-boost"));
      document.getElementById("plant-msg").textContent = document.querySelectorAll(".stg")[idx].querySelector(".bubble").textContent;
      if (lastIdx !== -1 && idx !== lastIdx) { plant.classList.remove("pop"); void plant.offsetWidth; plant.classList.add("pop"); }
      lastIdx = idx;
      document.getElementById("plan-count").textContent = prog.test ? "Unit complete!"
        : prog.day < days.length ? "Checkpoint " + (prog.day + 1) + " of " + days.length + ", then the unit test" : "Every checkpoint passed. Unit test next!";
      document.getElementById("plan-bar").style.width = (doneCount() / total()) * 100 + "%";
      document.getElementById("path-dots").replaceChildren(
        ...days.map((d, i) => el("span", i < prog.day ? "✓" : String(i + 1), "pdot" + (i < prog.day ? " done" : i === prog.day ? " now" : ""))),
        el("span", prog.test ? "✓ Test" : "Test", "pdot test" + (prog.test ? " done" : prog.day >= days.length ? " now" : "")));
    }
    function paint() {
      paintTree();
      const c = card();
      if (prog.test) {
        const go = el("a", "See it in your garden", "cta");
        go.href = "#garden";
        c.replaceChildren(el("p", "Unit complete", "cp-label"), el("h3", "You passed the unit test and grew your " + treeName() + "!", "cp-goal"),
          el("p", "Every checkpoint is done. Make a new plan whenever you're ready for your next topic.", "cp-tip"), go);
        return;
      }
      if (prog.day >= days.length) {
        c.replaceChildren(el("p", "Final step · Unit test", "cp-label"), el("h3", "Show what you've learned", "cp-goal"),
          el("p", (TEST_MC + TEST_OPEN) + " questions on the whole study guide: " + TEST_MC + " multiple choice and " + TEST_OPEN + " open response, graded by Sprout AI. You need 85% or higher to finish the unit. If you score lower, keep studying and take a new test.", "cp-tip"),
          btn("Start the unit test", "btn-sm", startTest));
        return;
      }
      const d = days[prog.day], i = prog.day, ready = allStepsDone(i);
      const box = btn("", "cp-check" + (ready ? "" : " locked"), () => {
        if (allStepsDone(i)) return startBench();
        Sfx.play("wrong");
        box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
      });
      box.append(el("span", "", "cp-box"), el("span", ready ? "Check it off" : "Check it off (finish the 3 steps first)", "cp-check-text"));
      const list = el("ol", "", "day-steps");
      STEPS.forEach((s, n) => {
        const done = !!stepsDone(i)[s.id], isNext = !done && STEPS.slice(0, n).every(x => stepsDone(i)[x.id]);
        const row = btn("", "day-step" + (done ? " done" : "") + (isNext ? " next" : ""), () => openStep(s.id));
        const txt = el("span", "", "ds-text");
        txt.append(el("b", s.title), el("small", s.sub));
        row.append(el("span", done ? "✓" : String(n + 1), "ds-num"), txt, el("span", done ? "Done" : isNext ? "Start" : "Open", "ds-go"));
        const li = el("li");
        li.append(row);
        list.append(li);
      });
      const parts = [el("p", "Checkpoint " + (prog.day + 1) + " of " + days.length + " · " + (d.when || "Day " + (prog.day + 1)), "cp-label"),
        el("h3", d.goal || "Keep studying", "cp-goal")];
      const focus = (Array.isArray(d.focus) ? d.focus : []).filter(Boolean);
      if (focus.length) parts.push(el("p", "Focus on: " + focus.join(", "), "cp-focus"));
      const tip = d.tip || (Array.isArray(d.tasks) ? d.tasks.map(t => typeof t === "string" ? t : t.label).filter(Boolean).join(" · ") : "");
      if (tip) parts.push(el("p", tip, "cp-tip"));
      parts.push(el("p", "Today's study steps", "ds-head"), list, box,
        el("p", "Step 4: once steps 1 to 3 are done, check it off to take a 5-question check on its own screen (no study guide). You need 90% (all 5 right) to pass.", "cp-note"));
      c.replaceChildren(...parts);
    }
    function errorCard(msg, retry) {
      const row = el("div", "", "nav-row");
      row.append(btn("Try again", "btn-sm", retry), btn("Back to my plan", "btn-sm secondary", () => leaveExam("plan")));
      exam().replaceChildren(el("p", msg, "cp-error"), row);
    }
    function endSession() {
      const row = el("div", "", "nav-row");
      row.append(btn("See my seeds", "btn-sm", () => { Modal.close(); location.hash = "#seeds"; }), btn("Stay here", "btn-sm secondary", () => Modal.close()));
      const next = prog.day < days.length ? (days[prog.day].when || "your next checkpoint") : "the unit test";
      Modal.open([el("h2", "Nice work today!"), el("p", "Your progress is saved. Come back next time for " + next + ". Every day you study keeps your streak going."), row]);
    }

    async function startBench() {
      const i = prog.day, d = days[i], c = exam();
      enterExam("Checkpoint " + (i + 1) + " of " + days.length + " · " + (d.when || "Day " + (i + 1)));
      Sfx.play("start");
      c.replaceChildren(el("p", "Checkpoint " + (i + 1) + " benchmark", "cp-label"), el("h3", "Alright, let's test your understanding!", "cp-goal"),
        loading("Sprout is writing 5 questions about " + (d.goal || "this checkpoint") + "..."));
      let qs;
      try {
        const r = await coach({ mode: "benchmark", topic: title, goal: d.goal || "", focus: (d.focus || []).join(", "), guide: guideText(kit.g), avoid: benchSeen });
        qs = (r.questions || []).filter(q => q && q.question && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer < q.options.length).slice(0, 5);
        if (qs.length < 5) throw new Error("The questions didn't come through.");
      } catch (err) { return errorCard("Couldn't make your benchmark. " + (err.message || ""), startBench); }
      benchSeen.push(...qs.map(q => q.question));
      const panel = el("div", "", "bench");
      c.replaceChildren(el("p", "Checkpoint " + (i + 1) + " benchmark", "cp-label"), el("h3", "Alright, let's test your understanding!", "cp-goal"), panel);
      runBench(panel, qs, (score, missed) => {
        const pct = score / qs.length, row = el("div", "", "nav-row");
        if (pct >= PASS_DAY) {
          prog.day = i + 1;
          save();
          Sprouts.studyOnce("bench:" + key + ":" + i, 50, "Checkpoint passed");
          Streak.mark();
          chime();
          paintTree();
          const more = prog.day < days.length;
          row.append(btn(more ? "Start " + (days[prog.day].when || "the next day") : "Go to the unit test", "btn-sm", () => leaveExam("plan")),
            btn("End session", "btn-sm secondary", () => { leaveExam("plan"); endSession(); }));
          c.replaceChildren(el("p", "Checkpoint passed", "cp-label"), el("h3", "You got " + score + " of " + qs.length + " (" + Math.round(pct * 100) + "%). Checkpoint passed!", "cp-goal"),
            el("p", more ? "Your tree grew! You can end your session here, or start the next day if you have time." : "That was the last checkpoint. Your tree grew! When you're ready, take the unit test to finish.", "cp-tip"), row);
        } else {
          Sfx.play("fail");
          row.append(btn("Try again with new questions", "btn-sm", startBench),
            btn("Keep studying", "btn-sm secondary", () => leaveExam("guide-card")));
          const topics = [...new Set(missed)];
          c.replaceChildren(el("p", "Not passed yet", "cp-label fail"), el("h3", "You got " + score + " of " + qs.length + " (" + Math.round(pct * 100) + "%). You need 90% to pass.", "cp-goal"),
            el("p", "Keep studying, then try again." + (topics.length ? " Look back at: " + topics.join(", ") + "." : "") + " The worksheet and flashcards on your plan page can help.", "cp-tip"), row);
        }
      });
    }

    async function startTest() {
      const c = exam();
      enterExam("Final step · Unit test");
      Sfx.play("start");
      c.replaceChildren(el("p", "Unit test", "cp-label"), el("h3", "Unit test: " + title, "cp-goal"), loading("Sprout is writing your test..."));
      let mc, open;
      try {
        const r = await coach({ mode: "test", topic: title, guide: guideText(kit.g), mc: TEST_MC, open: TEST_OPEN, avoid: testSeen });
        const qs = (r.questions || []).filter(q => q && q.question);
        const isMc = q => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
        mc = qs.filter(q => q.type !== "open" && isMc(q)).slice(0, 17);
        open = qs.filter(q => q.type === "open").slice(0, 3);
        if (mc.length < 3 || !open.length) throw new Error("The test didn't come through.");
      } catch (err) { return errorCard("Couldn't make your unit test. " + (err.message || ""), startTest); }
      testSeen.push(...mc.concat(open).map(q => q.question));
      const stamp = Date.now(), total = mc.length + open.length;

      const mcList = el("ol", "", "test-list");
      const mcRows = mc.map((q, i) => {
        const opts = el("div", "", "test-opts");
        const inputs = q.options.map((o, j) => {
          const lab = el("label", "", "test-opt"), inp = document.createElement("input");
          inp.type = "radio";
          inp.name = "tq-" + stamp + "-" + i;
          inp.value = j;
          lab.append(inp, el("span", String(o)));
          opts.append(lab);
          return inp;
        });
        const out = el("div", "", "test-fb"), li = el("li", "", "test-item");
        li.append(el("p", q.question, "test-q"), opts, out);
        mcList.append(li);
        return { q, inputs, out, li };
      });
      const openList = el("ol", "", "test-list");
      openList.start = mc.length + 1;
      const openRows = open.map((q, i) => {
        const ta = document.createElement("textarea");
        ta.className = "test-answer";
        ta.rows = 3;
        ta.maxLength = 1000;
        ta.setAttribute("aria-label", "Your answer to question " + (mc.length + i + 1));
        const out = el("div", "", "test-fb"), li = el("li", "", "test-item");
        li.append(el("p", q.question, "test-q"), ta, out);
        openList.append(li);
        return { q, ta, out, li };
      });
      const lockAll = on => { mcRows.forEach(r => r.inputs.forEach(x => { x.disabled = on; })); openRows.forEach(r => { r.ta.disabled = on; }); };

      const note = el("p", "", "cp-note"), after = el("div", "", "nav-row");
      const submit = btn("Turn in my test", "btn-sm", async () => {
        const blank = mcRows.filter(r => !r.inputs.some(x => x.checked)).length + openRows.filter(r => !r.ta.value.trim()).length;
        if (blank && !submit.dataset.sure) { submit.dataset.sure = "1"; note.textContent = "You left " + blank + " unanswered. Press “Turn in my test” again to submit anyway."; return; }
        submit.disabled = true;
        lockAll(true);
        Sfx.play("whoosh");
        note.replaceChildren(loading("Sprout is grading your test..."));
        let results;
        try {
          const r = await coach({ mode: "grade", topic: title, items: openRows.map(o => ({ question: o.q.question, answer: o.q.answer || "", points: o.q.points || [], response: o.ta.value.trim() })) });
          results = r.results || [];
          if (results.length !== openRows.length) throw new Error("Some answers weren't graded.");
        } catch (err) {
          submit.disabled = false;
          lockAll(false);
          note.textContent = "Couldn't grade your test. " + (err.message || "") + " Try turning it in again.";
          return;
        }
        let mcRight = 0, openPts = 0;
        mcRows.forEach(r => {
          const pick = r.inputs.findIndex(x => x.checked), ok = pick === r.q.answer;
          if (ok) mcRight++;
          r.li.classList.add(ok ? "full" : "miss");
          r.inputs.forEach((x, j) => {
            const lab = x.closest(".test-opt");
            lab.classList.toggle("right", j === r.q.answer);
            lab.classList.toggle("wrong", j === pick && !ok);
          });
          r.out.replaceChildren(el("b", ok ? "✓ Correct. " : pick < 0 ? "✗ No answer. " : "✗ Not quite. "), String(r.q.explanation || ""));
        });
        results.forEach((res, i) => {
          const sc = Math.max(0, Math.min(1, Number(res.score) || 0)), r = openRows[i];
          openPts += sc;
          r.li.classList.add(sc >= 1 ? "full" : sc > 0 ? "part" : "miss");
          r.out.replaceChildren(el("b", sc >= 1 ? "✓ Full credit. " : sc > 0 ? "½ Partial credit. " : "✗ No credit. "), String(res.feedback || ""));
          if (sc < 1 && r.q.answer) r.out.append(el("span", "A strong answer: " + r.q.answer, "test-model"));
        });
        const pct = (mcRight + openPts) / total;
        const breakdown = " (multiple choice: " + mcRight + " of " + mc.length + ", open response: " + openPts + " of " + open.length + ")";
        submit.remove();
        if (pct >= PASS_TEST) {
          prog.test = true;
          save();
          Sprouts.studyOnce("test:" + key, 200, "Unit test passed");
          Streak.mark();
          paintTree();
          note.replaceChildren(el("strong", "You scored " + Math.round(pct * 100) + "%. You passed the unit!"), breakdown);
          after.append(btn("Back to my plan", "btn-sm", () => leaveExam("plan")));
          celebrate(tree, title);
        } else {
          note.replaceChildren(el("strong", "You scored " + Math.round(pct * 100) + "%. You need 85% to finish the unit."),
            breakdown + ". Keep studying what you missed (the feedback above shows where), then take a new test.");
          Sfx.play("fail");
          after.append(btn("Take a new test", "btn-sm", startTest), btn("Keep studying", "btn-sm secondary", () => leaveExam("guide-card")));
        }
      });
      c.replaceChildren(el("p", "Unit test", "cp-label"), el("h3", "Unit test: " + title, "cp-goal"),
        el("p", "Answer every question. For the open responses, write two to four sentences in your own words. You need 85% or higher to finish the unit.", "cp-tip"),
        el("h4", "Part 1 · Multiple choice (" + mc.length + ")", "test-part"), mcList,
        el("h4", "Part 2 · Open response (" + open.length + ")", "test-part"), openList,
        note, submit, after);
    }
    return { open };
  })();

  const DEMO = {
    title: "Sample guide: Cellular respiration",
    overview: "Cellular respiration is how cells turn glucose and oxygen into usable energy (ATP), with carbon dioxide and water as by-products.",
    keyConcepts: [
      { term: "Glycolysis", explanation: "Glucose is split into two pyruvate in the cytoplasm, giving a net gain of 2 ATP." },
      { term: "Krebs cycle", explanation: "Pyruvate is broken down in the mitochondrial matrix, releasing CO2 and loading up electron carriers." },
      { term: "Electron transport chain", explanation: "On the inner mitochondrial membrane, electrons drive the production of most of the cell's ATP." }
    ],
    keyFacts: ["C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + ATP", "Oxygen is the final electron acceptor."],
    commonMistakes: ["Mixing up where each stage happens.", "Thinking glycolysis needs oxygen (it doesn't)."],
    quickCheck: ["Where does glycolysis occur?", "Why do cells need oxygen for the last stage?"],
    plan: [
      { when: "Day 1", goal: "The big picture and glycolysis", focus: ["Glycolysis"], tip: "Reread the overview and Glycolysis in your study guide, then try the worksheet." },
      { when: "Day 2", goal: "The Krebs cycle", focus: ["Krebs cycle"], tip: "Reread the Krebs cycle and flip through your flashcards." },
      { when: "Day 3", goal: "The electron transport chain", focus: ["Electron transport chain"], tip: "Reread the last key concept and the common mistakes." }
    ],
    flashcards: [
      { front: "What does ATP stand for?", back: "Adenosine triphosphate, the cell's energy currency." },
      { front: "Where does glycolysis occur?", back: "In the cytoplasm." },
      { front: "Where does the Krebs cycle occur?", back: "In the mitochondrial matrix." },
      { front: "Final electron acceptor in the electron transport chain?", back: "Oxygen." },
      { front: "Net ATP from glycolysis?", back: "2 ATP." }
    ],
    worksheet: [
      { heading: "The big picture", text: "Cellular respiration is how cells turn {{glucose|It's the sugar cells use for fuel.}} and oxygen into usable energy called {{ATP|It's a three-letter name for the cell's energy currency.}}, giving off carbon dioxide and water.", deeper: "Why can't cells just use the energy in glucose directly?", deeperAnswer: "Glucose holds too much energy in one package, so cells move it into small ATP molecules they can spend on any job.", deeperPoints: ["ATP"] },
      { heading: "Glycolysis", text: "Glycolysis splits glucose into two {{pyruvate|It starts with the letters p-y-r.}} in the {{cytoplasm|It's the jelly-like fluid that fills the cell.}}, for a net gain of {{2/two|It's a small number.}} ATP." },
      { heading: "The Krebs cycle", text: "In the mitochondrial {{matrix|It's the innermost space of the mitochondria.}}, pyruvate is broken down and {{carbon dioxide/CO2|It's the gas you breathe out.}} is released." },
      { heading: "The electron transport chain", text: "On the inner mitochondrial membrane, electrons drive the making of most of the cell's ATP. {{oxygen/O2|It's the gas you breathe in.}} is the final electron acceptor." }
    ],
    quiz: [
      { question: "Where does the Krebs cycle take place?", options: ["Cytoplasm", "Mitochondrial matrix", "Cell membrane", "Nucleus"], answer: 1, explanation: "It happens in the mitochondrial matrix.", topic: "Krebs cycle" },
      { question: "Which stage produces the most ATP?", options: ["Glycolysis", "Krebs cycle", "Electron transport chain", "Fermentation"], answer: 2, explanation: "The electron transport chain makes the majority of ATP.", topic: "Electron transport chain" },
      { question: "Glycolysis needs oxygen.", options: ["True", "False"], answer: 1, explanation: "Glycolysis works without oxygen.", topic: "Glycolysis" },
      { question: "What is split in glycolysis?", options: ["Pyruvate", "Glucose", "Water", "ATP"], answer: 1, explanation: "Glucose is split into two pyruvate.", topic: "Glycolysis" },
      { question: "Which gas is released during the Krebs cycle?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], answer: 1, explanation: "Carbon leaves as carbon dioxide.", topic: "Krebs cycle" },
      { question: "What is ATP?", options: ["The cell's energy currency", "A type of sugar", "A gas", "A cell organelle"], answer: 0, explanation: "ATP carries energy the cell can use.", topic: "ATP" }
    ],
    lesson: {
      lesson: [
        { heading: "Where the energy comes from", text: "Food like glucose stores energy in its chemical bonds. Cells can't use that energy directly, so they move it, step by step, into a small molecule called ATP. Think of glucose as a $100 bill and ATP as quarters: the cell needs small change it can spend anywhere." },
        { heading: "Breaking glucose in half", text: "Glycolysis happens in the cytoplasm and splits one glucose (6 carbons) into two pyruvate (3 carbons each). It costs 2 ATP to start but makes 4, so the cell gains 2. Because it doesn't need oxygen, it is the oldest and most universal energy pathway." },
        { heading: "Why this step matters", text: "Glycolysis is only the beginning. Most of glucose's energy is still locked in the pyruvate, which is why the next stages in the mitochondria matter so much." }
      ],
      example: { title: "Counting the ATP", problem: "A cell runs glycolysis on 3 glucose molecules. How much ATP does it gain overall?", steps: ["Each glucose uses 2 ATP to get started.", "Each glucose then makes 4 ATP.", "So each glucose gives a net gain of 4 - 2 = 2 ATP.", "Three glucose molecules give 3 x 2 ATP."], answer: "6 ATP" },
      connection: "When you sprint, your muscles lean on glycolysis because it is fast and doesn't wait for oxygen.",
      takeaways: ["Glycolysis splits glucose into two pyruvate.", "It happens in the cytoplasm and doesn't need oxygen.", "The net gain is 2 ATP per glucose."],
      flashcards: [
        { front: "What does glycolysis split glucose into?", back: "Two pyruvate molecules." },
        { front: "Why can glycolysis happen without oxygen?", back: "None of its steps use oxygen; that only happens later, in the electron transport chain." },
        { front: "A cell runs glycolysis on 5 glucose. Net ATP?", back: "10 ATP (2 per glucose)." }
      ],
      think: [
        { question: "Why does a cell spend 2 ATP to start glycolysis if it is trying to make energy?", answer: "It is an investment: spending 2 ATP makes glucose reactive enough to split, and the cell gets 4 ATP back, a net gain of 2.", points: ["invest", "net gain"] },
        { question: "What would happen to a cell that could only do glycolysis?", answer: "It could still make some ATP, but only 2 per glucose, so it would need much more glucose to get the same energy.", points: ["less ATP"] }
      ]
    },
    test: [
      { question: "Where does glycolysis happen, and what does it make?", answer: "In the cytoplasm; it splits glucose into two pyruvate and nets 2 ATP.", points: ["cytoplasm", "pyruvate"] },
      { question: "Why do cells need oxygen during cellular respiration?", answer: "Oxygen is the final electron acceptor in the electron transport chain.", points: ["electron"] },
      { question: "Which stage makes the most ATP?", answer: "The electron transport chain.", points: ["electron transport"] }
    ]
  };

