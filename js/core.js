  // The slider is continuous. These anchors are the number of days at 0%, 25%, 50%, 75%, 100%;
  // positions in between are interpolated, so you can land on 5 days, 10 days, 21 days, and so on.
  const ANCHORS = [1, 3, 7, 14, 30];
  function daysAt(pos) {
    const t = (pos / 1000) * (ANCHORS.length - 1);
    const i = Math.min(Math.floor(t), ANCHORS.length - 2);
    return Math.round(ANCHORS[i] + (t - i) * (ANCHORS[i + 1] - ANCHORS[i]));
  }
  function labelFor(d) {
    if (d === 30) return "1 month";
    if (d === 14) return "2 weeks";
    if (d === 7) return "1 week";
    return d + (d === 1 ? " day" : " days");
  }

  const form = document.getElementById("plan-form");
  const slider = document.getElementById("time");
  const readout = document.getElementById("time-readout");
  const errorEl = document.getElementById("error");

  function updateSlider() {
    readout.textContent = labelFor(daysAt(+slider.value));
    slider.style.setProperty("--fill", (slider.value / 1000) * 100 + "%");
  }
  slider.addEventListener("input", updateSlider);
  updateSlider();

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function list(items, tag) {
    const l = el(tag);
    (items || []).forEach(i => l.append(el("li", i)));
    return l;
  }

  // ----- Sound effects, made live with the Web Audio API (no audio files). Sfx.play("chaching"), Sfx.play("correct"), ...
  const Sfx = (function () {
    let ctx = null, out = null;
    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 0.6;
        out.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function tone(f, t0, dur, o) {
      o = o || {};
      const osc = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + t0;
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol || 0.15, t + (o.atk || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
    function noise(t0, dur, o) {
      o = o || {};
      const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + t0;
      src.buffer = buf;
      fl.type = o.type || "bandpass";
      fl.frequency.setValueAtTime(o.f || 2000, t);
      if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      fl.Q.value = o.q || 1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol || 0.15, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl); fl.connect(g); g.connect(out);
      src.start(t); src.stop(t + dur + 0.02);
    }
    const SOUNDS = {
      chaching() {                                             // cash register: "cha" clack, "ching" bell, then coins
        noise(0, .08, { f: 3000, q: .8, vol: .3 }); noise(.06, .07, { f: 6500, q: 1.5, vol: .2 });
        tone(1568, .13, .45, { type: "triangle", vol: .16 }); tone(3136, .13, .3, { vol: .05 });
        tone(2093, .21, .9, { type: "triangle", vol: .2 }); tone(4186, .21, .5, { vol: .06 });
        [.36, .42, .49, .57].forEach((t, i) => tone(2500 + i * 350, t, .12, { vol: .05 }));
      },
      plant() {                                                // dig, pat the soil, then a little sprout pops up
        noise(0, .2, { type: "lowpass", f: 900, to: 250, vol: .35 }); tone(170, 0, .22, { vol: .3, to: 60 });
        noise(.26, .1, { type: "lowpass", f: 600, vol: .25 }); tone(130, .26, .14, { vol: .25, to: 70 });
        noise(.4, .1, { type: "lowpass", f: 600, vol: .22 }); tone(130, .4, .14, { vol: .22, to: 70 });
        tone(400, .6, .35, { type: "triangle", vol: .12, to: 900 });
        [1319, 1568, 2093].forEach((f, i) => tone(f, .85 + i * .08, .35, { vol: .07 }));
      },
      correct() { tone(659, 0, .15, { type: "triangle", vol: .17 }); tone(988, .09, .32, { type: "triangle", vol: .17 }); },
      wrong() { tone(330, 0, .18, { type: "triangle", vol: .13, to: 290 }); tone(247, .13, .32, { type: "triangle", vol: .13, to: 215 }); },
      flip() { noise(0, .16, { f: 900, to: 3500, q: .7, vol: .14 }); },
      gotit() { tone(784, 0, .12, { vol: .14 }); tone(1175, .07, .22, { vol: .12 }); },
      again() { tone(523, 0, .15, { type: "triangle", vol: .11 }); tone(587, .1, .22, { type: "triangle", vol: .1 }); },
      coin() { tone(1976, .1, .08, { type: "square", vol: .035 }); tone(2637, .16, .28, { type: "square", vol: .035 }); },
      equip() { noise(0, .04, { f: 4000, vol: .1 }); tone(600, 0, .07, { vol: .14, to: 900 }); tone(1200, .06, .14, { type: "triangle", vol: .1 }); },
      reward() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .07, .4, { type: "triangle", vol: .11 })); },
      pass() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .1, .55, { type: "triangle", vol: .12 })); },
      fail() { [392, 349, 330].forEach((f, i) => tone(f, i * .16, .38, { type: "triangle", vol: .1 })); },
      start() { tone(440, 0, .1, { vol: .11 }); tone(554, .1, .1, { vol: .11 }); tone(659, .2, .28, { vol: .13 }); },
      whoosh() { noise(0, .3, { f: 400, to: 3000, q: .6, vol: .12 }); },
      pop() { tone(500, 0, .08, { vol: .11, to: 1000 }); },
      send() { tone(700, 0, .09, { vol: .09, to: 1100 }); },
      receive() { tone(880, 0, .1, { vol: .09 }); tone(1320, .08, .16, { vol: .07 }); },
      hint() { tone(880, 0, .12, { vol: .08 }); tone(1047, .1, .2, { vol: .07 }); },
      streak() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, .25 + i * .06, .3, { vol: .08 })); }
    };
    // Browsers only allow sound after a click or tap, so get ready on the first one.
    window.addEventListener("pointerdown", () => { try { ac(); } catch (e) {} }, { once: true, capture: true });
    return {
      play(name) {
        try {
          if (window.__sfxLog) window.__sfxLog.push(name);   // used by tests
          if (!SOUNDS[name] || !ac()) return;
          SOUNDS[name]();
        } catch (e) {}
      }
    };
  })();

  // ----- Sprout's coach (api/coach.js): writes benchmarks and tests, grades open responses, and tutors the worksheet.
  async function coach(body) {
    if (params.has("demo")) return demoCoach(body);
    const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || (res.status === 404 ? "The /api/coach function wasn't found." : "Request failed (" + res.status + ")"));
    return data;
  }
  function demoCoach(b) {   // ?demo=1: canned answers so the site can be tried without the AI
    const out = b.mode === "benchmark" ? { questions: DEMO.quiz.slice(0, 5) }
      : b.mode === "test" ? { questions: DEMO.quiz.slice(0, 4).map(q => Object.assign({ type: "mc" }, q)).concat(DEMO.test.map(q => Object.assign({ type: "open" }, q))) }
      : b.mode === "grade" ? { results: b.items.map(it => {
          const hits = (it.points || []).filter(k => it.response.toLowerCase().includes(k.toLowerCase())).length;
          const score = hits && hits >= it.points.length ? 1 : hits ? 0.5 : 0;
          return { score, feedback: score === 1 ? "Great answer." : score ? "Good start, but part of it is missing." : "This one needs another look." };
        }) }
      : { message: b.tries >= 3 ? "It fits because of where this step happens in the cell." : "Think about where this happens in the cell." };
    return new Promise(r => setTimeout(() => r(out), 300));
  }
  const guideText = g => [g.overview, ...(g.keyConcepts || []).map(c => c.term + ": " + c.explanation), ...(g.keyFacts || []),
    ...(g.commonMistakes || []).map(m => "Common mistake: " + m)].filter(Boolean).join("\n").slice(0, 5000);
  function btn(text, cls, fn) { const b = el("button", text, cls); b.type = "button"; b.onclick = fn; return b; }
  function loading(text) {
    const p = el("p", "", "cp-loading");
    const dots = el("span", "", "typing");
    dots.append(el("i"), el("i"), el("i"));
    p.append(dots, text);
    return p;
  }

  // A short multiple-choice check, one question at a time. Calls onFinish(score, missedTopics) at the end.
  function runBench(panel, qs, onFinish) {
    let pos = 0, score = 0;
    const missed = [];
    function show() {
      if (pos >= qs.length) return onFinish(score, missed);
      const it = qs[pos];
      const bar = el("div", "", "prog"), fill = el("i");
      fill.style.width = (pos / qs.length) * 100 + "%";
      bar.append(fill);
      const opts = el("div", "", "opts"), fb = el("div", "", "feedback");
      const next = btn(pos + 1 === qs.length ? "See my score" : "Next question", "btn-sm", () => { pos++; show(); });
      next.hidden = true;
      it.options.forEach((o, i) => opts.append(btn(o, "opt-btn", e => {
        const ok = i === it.answer;
        opts.querySelectorAll("button").forEach((x, j) => { x.disabled = true; if (j === it.answer) x.classList.add("right"); });
        Sfx.play(ok ? "correct" : "wrong");
        if (ok) score++; else { e.currentTarget.classList.add("wrong"); missed.push(it.topic || it.question); }
        fb.textContent = (ok ? "Correct! " : "Not quite. ") + (it.explanation || "");
        fb.className = "feedback " + (ok ? "good" : "bad");
        next.hidden = false;
        next.focus();
      })));
      panel.replaceChildren(el("p", "Question " + (pos + 1) + " of " + qs.length, "meta"), bar, el("h3", it.question, "q"), opts, fb, next);
    }
    show();
  }

