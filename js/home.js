  // Sends the form data to /api/guide (see api/guide.js) and shows the result.
  async function createPlan(data, upload) {
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Growing your plan... about 20 seconds";
    try {
      if (params.has("demo")) { showKit(data, DEMO); Sfx.play("plant"); goStudy(); return; }   // ?demo=1 shows a sample, no AI needed
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, data, upload ? { image: upload } : {}))
      });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch (e) {}
        if (body.refused) { errorEl.textContent = body.error || "Sorry, I can't make a plan for that."; Sfx.play("wrong"); return; }   // not something Sprout makes plans for
        const msg = body.error || (res.status === 404 ? "The /api/guide function wasn't found. Make sure guide.js is in a folder named api." : "");
        throw new Error(msg || "Request failed (" + res.status + ")");
      }
      showKit(data, await res.json());
      Sfx.play("plant");
      Sprouts.studyEarn(100, "New plan planted");
      goStudy();
      Streak.mark();
      clearUpload();
      if (!isOwner()) store.set(USED_KEY, String(used() + 1));   // only successful plans count
    } catch (err) {
      errorEl.textContent = "Couldn't build the guide. " + (err.message || "");
    } finally {
      updateUsage();
    }
  }

  document.getElementById("print-btn").addEventListener("click", () => window.print());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!isOwner() && !UNLIMITED && used() >= FREE_LIMIT) return;
    let topic = document.getElementById("topic").value.trim();
    const details = document.getElementById("details").value.trim();

    if (!topic && !pendingUpload) {
      errorEl.textContent = "Add a topic first, like \"Macroeconomics\" or \"Organic chemistry\", or upload a photo of your notes.";
      return;
    }
    if (!topic) topic = "My uploaded notes";
    errorEl.textContent = "";

    const days = daysAt(+slider.value);
    createPlan({ topic, days, timeLabel: labelFor(days), details }, pendingUpload);
  });


  // ----- "What Sprout does": every preview card is a tiny working demo.
  (function featureDemos() {
    const q = (sel, root) => root.querySelector(sel), qa = (sel, root) => [...root.querySelectorAll(sel)];
    const demo = name => document.querySelector('.preview[data-demo="' + name + '"]');

    const guide = demo("guide");
    if (guide) {
      const exp = q(".pv-exp", guide), rows = qa(".pv-row", guide);
      rows.forEach(r => r.addEventListener("click", () => {
        const open = !r.classList.contains("open");
        rows.forEach(x => { x.classList.remove("open"); x.setAttribute("aria-expanded", "false"); });
        r.classList.toggle("open", open);
        r.setAttribute("aria-expanded", String(open));
        exp.textContent = open ? r.dataset.exp : "Tap a concept to see what it means.";
        Sfx.play("pop");
      }));
    }

    const plan = demo("plan");
    if (plan) qa(".pv-btn", plan).forEach(b => b.addEventListener("click", () => {
      const li = b.closest("li"), done = li.classList.toggle("done");
      Sfx.play(done ? "gotit" : "pop");
      b.setAttribute("aria-pressed", String(done));
    }));

    const sheet = demo("sheet");
    if (sheet) {
      const input = q(".pv-input", sheet), fb = q(".pv-fb", sheet), ck = qa(".ck", sheet)[1];
      input.addEventListener("keydown", e => {
        if (e.key !== "Enter" || !input.value.trim()) return;
        const ok = /pyruv/i.test(input.value);
        Sfx.play(ok ? "correct" : "wrong");
        input.classList.toggle("good", ok); input.classList.toggle("bad", !ok);
        ck.classList.toggle("off", !ok);
        fb.className = "pv-fb " + (ok ? "good" : "bad");
        fb.textContent = ok ? "Correct! Glycolysis ends with pyruvate." : "Not quite. Hint: it starts with a P.";
      });
    }

    const quiz = demo("quiz");
    if (quiz) {
      const opts = qa(".opt", quiz), fb = q(".pv-fb", quiz);
      opts.forEach(o => o.addEventListener("click", () => {
        opts.forEach(x => x.classList.remove("right", "wrong"));
        const ok = !!o.dataset.right;
        Sfx.play(ok ? "correct" : "wrong");
        o.classList.add(ok ? "right" : "wrong");   // wrong picks stay hidden so they can try again
        fb.className = "pv-fb " + (ok ? "good" : "bad");
        fb.textContent = ok ? "Correct! Nice, that's growing." : "Not quite. Try another one!";
        q(".try", quiz).hidden = true;   // make room for the feedback line
      }));
    }

    const cards = demo("cards");
    if (cards) {
      const DECK = [["What does ATP stand for?", "Adenosine triphosphate"], ["Where does glycolysis happen?", "In the cytoplasm"], ["What gas do cells breathe out?", "Carbon dioxide"]];
      const card = q(".fc.front", cards), text = q(".fc-text", cards), hint = q(".fc-hint", cards), side = q(".fc-side", cards);
      let i = 0, back = false;
      card.addEventListener("click", () => {
        Sfx.play("flip");
        card.classList.remove("flipping"); void card.offsetWidth; card.classList.add("flipping");
        setTimeout(() => {
          if (back) { i = (i + 1) % DECK.length; back = false; } else { back = true; }
          text.textContent = DECK[i][back ? 1 : 0];
          side.textContent = back ? "Answer" : "Flashcard";
          hint.textContent = back ? "Tap for the next card" : "Tap to flip";
          card.classList.toggle("show-back", back);
        }, 200);
      });
    }

    const prog = demo("progress");
    if (prog) {
      const rows = qa(".pv-row", prog), bar = q(".prog i", prog), count = q(".pv-count", prog);
      const update = () => {
        const n = rows.filter(r => r.getAttribute("aria-pressed") === "true").length;
        bar.style.width = (n / rows.length) * 100 + "%";
        count.textContent = n === rows.length ? "All done! Fully grown." : n + " of " + rows.length + " complete";
      };
      rows.forEach(r => r.addEventListener("click", () => {
        const on = r.getAttribute("aria-pressed") !== "true";
        Sfx.play(on ? "gotit" : "pop");
        r.setAttribute("aria-pressed", String(on));
        q(".ck", r).classList.toggle("off", !on);
        update();
      }));
      update();
    }

    const grow = demo("grow");
    if (grow) {
      const stages = qa(".stg", grow), last = stages.length - 1;
      let cur = last;   // starts fully grown so visitors see every stage
      const water = () => {
        cur = cur >= last ? 0 : cur + 1;
        Sfx.play(cur === 0 ? "plant" : "pop");
        stages.forEach((st, i) => st.classList.toggle("dim", i > cur));
        const st = stages[cur];
        st.classList.remove("pop"); void st.offsetWidth; st.classList.add("pop");
        q(".try", grow).textContent = cur >= last ? "tap to start over" : "tap to water it";
      };
      grow.addEventListener("click", water);
      grow.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); water(); } });
    }
  })();

  const io = new IntersectionObserver((entries) => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  let cardIndex = 0;
  document.querySelectorAll(".reveal").forEach(n => {
    const d = n.dataset.d !== undefined ? n.dataset.d : (n.classList.contains("card") ? (cardIndex++ % 3) * 0.12 : 0);
    n.style.setProperty("--d", d + "s");
    io.observe(n);
  });
