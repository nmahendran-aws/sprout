  // ----- Study streak: any studying (a plan step, a right answer, a learned card, a new plan) counts for the day.
  const dayStr = d => d.toLocaleDateString("en-CA");                    // e.g. 2026-10-12, in local time
  const today = () => dayStr(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };
  const Streak = (function () {
    const KEY = "sprout:streak";
    const load = () => { try { return JSON.parse(store.get(KEY)) || { n: 0, last: "" }; } catch (e) { return { n: 0, last: "" }; } };
    const current = () => { const s = load(); return s.last === today() || s.last === yesterday() ? s.n : 0; };
    function paint() {
      const s = load(), n = current();
      document.getElementById("streak-n").textContent = n;
      document.getElementById("streak-pill").classList.toggle("cold", s.last !== today());
      document.getElementById("streak-pill").title = n ? (s.last === today() ? "You studied today. Come back tomorrow to keep it going!" : "Study today to keep your streak!") : "Study today to start a streak";
    }
    function mark() {
      const s = load();
      if (s.last === today()) return;
      s.n = s.last === yesterday() ? s.n + 1 : 1;
      s.last = today();
      store.set(KEY, JSON.stringify(s));
      paint();
      Sfx.play("streak");
      if (s.n % 7 === 0) Sprouts.earn(200, s.n + "-day streak!");
      else if (s.n === 3) Sprouts.earn(50, "3-day streak!");
    }
    return { mark, paint, current };
  })();

  // ----- Daily rewards: open Sprout on back-to-back days to climb a 7-day reward calendar.
  const Daily = (function () {
    const KEY = "sprout:daily", REWARDS = [25, 50, 75, 100, 150, 200, 500];
    const load = () => { try { return JSON.parse(store.get(KEY)) || { day: 0, last: "" }; } catch (e) { return { day: 0, last: "" }; } };
    const claimedToday = () => load().last === today();
    const nextDay = () => { const s = load(); return s.last === yesterday() ? (s.day % 7) + 1 : 1; };
    function paint() { document.getElementById("gift-btn").hidden = claimedToday(); }
    function open() {
      if (claimedToday()) return;
      const n = nextDay();
      const days = el("div", "", "days");
      REWARDS.forEach((amt, i) => {
        const d = el("div", "Day " + (i + 1), "day" + (i + 1 < n ? " got" : "") + (i + 1 === n ? " today" : "") + (i === 6 ? " big" : ""));
        d.append(el("b", "+" + amt));
        days.append(d);
      });
      const amt = el("div", "", "reward-amt");
      amt.append(Shop.icon(), document.createTextNode("+" + REWARDS[n - 1]));
      const claim = el("button", "Claim reward", "btn-sm");
      claim.type = "button";
      claim.onclick = () => {
        store.set(KEY, JSON.stringify({ day: n, last: today() }));
        Sfx.play("reward");
        Sprouts.earn(REWARDS[n - 1], "Day " + n + " reward");
        paint();
        Modal.close();
        if (n === 7) confetti();
      };
      const row = el("div", "", "nav-row");
      row.append(claim);
      Modal.open([
        el("h2", n === 7 ? "Day 7: big reward!" : "Daily reward"),
        el("p", n === 1 ? "Come back every day to climb the calendar. Miss a day and it starts over." : "Day " + n + " in a row. Keep it going!"),
        amt, days, row
      ], "modal-title");
    }
    return { open, paint, claimedToday };
  })();

  // ----- A simple dialog box.
  const Modal = (function () {
    const box = document.getElementById("modal"), card = document.getElementById("modal-card");
    let lastFocus = null;
    function open(children) {
      lastFocus = document.activeElement;
      card.replaceChildren(...children);
      const h = card.querySelector("h2");
      if (h) h.id = "modal-title";
      box.hidden = false;
      const btn = card.querySelector("button");
      if (btn) btn.focus();
    }
    function close() { box.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
    box.addEventListener("click", e => { if (e.target === box) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) close(); });
    return { open, close };
  })();

  // ----- Celebration when a plan's tree is fully grown: falling leaves, a little chime, and a pop-up.
  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = document.getElementById("confetti");
    const colors = ["#3ddc97", "#4fb39f", "#ffd166", "#ff7ac8", "#38a6ff", "#a78bfa", "#ff9f43"];
    for (let i = 0; i < 70; i++) {
      const b = document.createElement("span");
      b.className = "bit";
      b.style.cssText = "left:" + (Math.random() * 100) + "%;background:" + colors[i % colors.length] + ";" +
        "--t:" + (2.2 + Math.random() * 1.8).toFixed(2) + "s;--dx:" + (Math.random() * 160 - 80).toFixed(0) + "px;" +
        "--r:" + (Math.random() * 720 - 360).toFixed(0) + "deg;animation-delay:" + (Math.random() * .6).toFixed(2) + "s;" +
        "transform:scale(" + (0.6 + Math.random() * 0.8).toFixed(2) + ")";
      b.addEventListener("animationend", () => b.remove());
      layer.append(b);
    }
  }
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [72, 76, 79, 84].forEach((m, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.12;
        o.type = "triangle"; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 1);
      });
      setTimeout(() => ctx.close(), 1800);
    } catch (e) {}
  }
  function celebrate(tree, title) {
    confetti();
    chime();
    const big = Shop.stageSVG(tree, 5);
    big.classList.add("big-tree");
    const go = el("a", "See my garden", "cta");
    go.href = "#garden";
    go.style.padding = "12px 26px";
    go.style.fontSize = "1.05rem";
    go.onclick = () => Modal.close();
    const stay = el("button", "Keep studying", "btn-sm secondary");
    stay.type = "button";
    stay.onclick = () => Modal.close();
    const row = el("div", "", "nav-row");
    row.append(go, stay);
    Modal.open([big, el("h2", "Your " + (tree.id === "tree" ? "tree" : tree.name + " tree") + " is fully grown!"),
      el("p", "You finished every step of “" + title + "”. It’s been planted in your garden."), row]);
  }

  // ----- Garden: finished plans become full trees, plans in progress show how far they've grown.
  function renderGarden() {
    const plots = document.getElementById("garden-plots"), stats = document.getElementById("garden-stats");
    const entries = Object.entries(seedsDB.all()).filter(([, sd]) => sd.steps).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    const grown = entries.filter(([, sd]) => sd.done >= sd.steps);
    plots.replaceChildren();
    stats.replaceChildren();
    document.getElementById("garden-empty").hidden = entries.length > 0;
    document.getElementById("garden").hidden = entries.length === 0;
    document.getElementById("garden-sub").textContent = entries.length
      ? "You've grown " + grown.length + " tree" + (grown.length === 1 ? "" : "s") + (entries.length > grown.length ? ", with " + (entries.length - grown.length) + " more on the way." : ".")
      : "Every plan you finish plants its tree here.";
    entries.forEach(([, sd]) => {
      const tree = Shop.byId(sd.tree || "tree");
      const stage = Math.round((sd.done / sd.steps) * 5);
      const plot = el("div", "", "plot" + (stage < 5 ? " growing" : ""));
      plot.title = sd.title + " — " + Shop.stageName(tree, stage);
      plot.append(Shop.stageSVG(tree, stage), el("span", sd.title || "Untitled plan", "plot-name"));
      plots.append(plot);
    });
    const counts = {};
    grown.forEach(([, sd]) => { const r = Shop.byId(sd.tree || "tree").rarity; counts[r] = (counts[r] || 0) + 1; });
    ["common", "rare", "epic", "legendary", "mythical", "exotic"].forEach(r => {
      if (counts[r]) stats.append(el("span", counts[r] + " " + r, "rarity " + r));
    });
  }

  // ----- Upload a photo or PDF of a syllabus or notes. Photos are shrunk in the browser so they upload fast.
  let pendingUpload = null;
  function clearUpload() {
    pendingUpload = null;
    document.getElementById("upload").value = "";
    document.getElementById("upload-chosen").hidden = true;
    document.getElementById("upload-box").hidden = false;
  }
  (function uploads() {
    const input = document.getElementById("upload");
    const showChosen = (name, thumb) => {
      document.getElementById("upload-name").textContent = name;
      const img = document.getElementById("upload-thumb");
      img.hidden = !thumb;
      if (thumb) img.src = thumb;
      document.getElementById("upload-chosen").hidden = false;
      document.getElementById("upload-box").hidden = true;
      Sfx.play("pop");
    };
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      errorEl.textContent = "";
      if (!f) return;
      if (f.type === "application/pdf") {
        if (f.size > 3 * 1024 * 1024) { errorEl.textContent = "That PDF is too big. Please use one under 3 MB, or take a photo instead."; input.value = ""; return; }
        const r = new FileReader();
        r.onload = () => { pendingUpload = { mimeType: "application/pdf", data: String(r.result).split(",")[1] }; showChosen(f.name, null); };
        r.readAsDataURL(f);
        return;
      }
      if (!/^image\//.test(f.type)) { errorEl.textContent = "Please choose a photo or a PDF."; input.value = ""; return; }
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const dataUrl = cv.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(url);
        pendingUpload = { mimeType: "image/jpeg", data: dataUrl.split(",")[1] };
        showChosen(f.name, dataUrl);
      };
      img.onerror = () => { errorEl.textContent = "Couldn't read that photo. Try a JPG or PNG."; input.value = ""; };
      img.src = url;
    });
    document.getElementById("upload-clear").addEventListener("click", clearUpload);
  })();

