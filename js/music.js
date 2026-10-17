  // ----- Soft lofi music, made live in the browser with the Web Audio API (no audio files, nothing to license).
  const Lofi = (function () {
    const BPM = 70, beat = 60 / BPM;
    const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];   // Fmaj7, Em7, Dm7, Cmaj7
    const PENTA = [72, 74, 76, 79, 81, 84];                                                   // C major pentatonic (fits all four chords)
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    let ctx, master, bus, wobOut, noiseBuf, timer, bar = 0, nextBar = 0, playing = false, level = 0.5;

    function init() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      bus = ctx.createGain();
      const lp = ctx.createBiquadFilter();                       // warm, muffled tone
      lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.4;
      bus.connect(lp); lp.connect(master);
      const rev = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 1.8), imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      rev.buffer = imp;
      const wet = ctx.createGain(); wet.gain.value = 0.3;
      lp.connect(rev); rev.connect(wet); wet.connect(master);
      const wob = ctx.createOscillator(); wob.frequency.value = 0.35;   // slow tape wobble
      wobOut = ctx.createGain(); wobOut.gain.value = 14;                // in cents
      wob.connect(wobOut); wob.start();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const cl = ctx.sampleRate * 4, cb = ctx.createBuffer(1, cl, ctx.sampleRate), cd = cb.getChannelData(0);   // vinyl crackle
      for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * 0.008 + (Math.random() < 0.00007 ? (Math.random() * 2 - 1) * 0.35 : 0);
      const cs = ctx.createBufferSource(); cs.buffer = cb; cs.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
      const cg = ctx.createGain(); cg.gain.value = 0.5;
      cs.connect(hp); hp.connect(cg); cg.connect(master); cs.start();
    }

    function env(g, t, v, atk, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function note(freq, t, dur, type, v, atk) {
      if (window.lightKey) window.lightKey(69 + 12 * Math.log2(freq / 440), (t - ctx.currentTime) * 1000, dur, v);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      wobOut.connect(o.detune);
      env(g, t, v, atk || 0.04, dur);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + dur + 0.1);
    }
    function hit(t, dur, v, hpFreq) {
      const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hpFreq;
      env(g, t, v, 0.005, dur);
      s.connect(f); f.connect(g); g.connect(bus);
      s.start(t); s.stop(t + dur + 0.05);
    }
    function kick(t, v) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      env(g, t, v, 0.005, 0.3);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.35);
    }

    function scheduleBar(t, n) {
      const chord = CHORDS[n % 4], swing = i => (i % 2 ? beat * 0.09 : 0);
      chord.forEach((m, i) => {                                     // soft electric-piano chords
        note(mtof(m + 12), t + i * 0.025, beat * 3.4, "triangle", 0.05, 0.05);
        note(mtof(m + 12), t + beat * 2.5 + i * 0.02, beat * 1.4, "triangle", 0.03, 0.05);
      });
      note(mtof(chord[0] - 12), t, beat * 1.8, "sine", 0.16, 0.03);   // bass
      note(mtof(chord[0] - 12), t + beat * 2.5, beat * 1.0, "sine", 0.1, 0.03);
      kick(t, 0.22); kick(t + beat * 2.5, 0.15);                      // very soft drums
      hit(t + beat, 0.18, 0.06, 900); hit(t + beat * 3, 0.18, 0.06, 900);
      for (let i = 0; i < 8; i++) hit(t + i * beat / 2 + swing(i), 0.05, i % 2 ? 0.015 : 0.025, 3000);
      for (let i = 0; i < 8; i++) {                                   // a few sparse melody notes
        if (Math.random() < 0.3) note(mtof(PENTA[Math.floor(Math.random() * PENTA.length)]), t + i * beat / 2 + swing(i), beat * 1.3, "sine", 0.035, 0.02);
      }
    }
    function tick() { while (nextBar < ctx.currentTime + 1.5) { scheduleBar(nextBar, bar++); nextBar += beat * 4; } }

    return {
      playing: () => playing,
      audible: () => playing && !!ctx && ctx.state === "running",   // false while the browser is still blocking sound
      resume() { if (ctx) return ctx.resume(); },
      start() {
        if (!ctx) init();
        ctx.resume();
        playing = true;
        nextBar = ctx.currentTime + 0.15;
        tick();
        clearInterval(timer);
        timer = setInterval(tick, 250);
        master.gain.setTargetAtTime(level * 0.6, ctx.currentTime, 0.6);   // fade in
      },
      stop() {
        playing = false;
        if (!ctx) return;                                                  // music never started, nothing to stop
        clearInterval(timer);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);              // fade out
        const old = ctx;
        setTimeout(() => { if (!playing && ctx === old) { old.close(); ctx = null; } }, 1800);
      },
      setVolume(v) { level = v; if (playing) master.gain.setTargetAtTime(level * 0.6, ctx.currentTime, 0.1); },
      pause(p) { if (ctx && playing) { p ? ctx.suspend() : ctx.resume(); } }
    };
  })();

  // Light up a pair of stripes like a piano key. Stripes sit every 22px, so a pair is one 44px slot.
  (function pianoKeys() {
    const box = document.getElementById("keys");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const LOW = 36, HIGH = 88;                                  // lowest and highest note the music plays
    const COLORS = [[61, 220, 151], [56, 166, 255], [167, 139, 250]];   // green, blue, purple (same as the stripes)
    function colorAt(f) {
      const x = f * (COLORS.length - 1), i = Math.min(Math.floor(x), COLORS.length - 2), k = x - i;
      return "rgb(" + COLORS[i].map((c, j) => Math.round(c + (COLORS[i + 1][j] - c) * k)).join(",") + ")";
    }
    window.lightKey = (midi, delayMs, dur, vol) => {
      if (reduce.matches || document.hidden) return;
      setTimeout(() => {
        if (!Lofi.audible()) return;
        const pairs = Math.max(1, Math.floor(window.innerWidth / 44));
        const f = Math.min(Math.max((midi - LOW) / (HIGH - LOW), 0), 1);
        const slot = Math.min(pairs - 1, Math.round(f * (pairs - 1)));
        const k = document.createElement("span");
        k.className = "key";
        k.style.left = slot * 44 + "px";
        k.style.setProperty("--c", colorAt(f));
        k.style.setProperty("--d", Math.min(Math.max(dur, 0.6), 2.2).toFixed(2) + "s");
        k.style.setProperty("--o", Math.min(0.35 + vol * 4, 0.95).toFixed(2));   // louder notes glow brighter
        k.addEventListener("animationend", () => k.remove());
        box.append(k);
      }, Math.max(0, delayMs));
    };
  })();

  (function musicControls() {
    const btn = document.getElementById("music-btn"), volEl = document.getElementById("music-vol");
    let muted = false;   // music always starts on when the page opens

    const syncVol = () => { volEl.style.setProperty("--fill", volEl.value + "%"); Lofi.setVolume(volEl.value / 100); };
    const ui = () => {
      const waiting = !muted && !Lofi.audible();   // on, but the browser hasn't allowed sound yet
      btn.classList.toggle("muted", muted);
      btn.classList.toggle("waiting", waiting);
      btn.setAttribute("aria-pressed", String(!muted));
      const label = muted ? "Play music" : waiting ? "Click to start the music" : "Mute music";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      volEl.hidden = muted;
    };
    const saved = parseInt(store.get("sprout:vol"));
    if (saved >= 0 && saved <= 100) volEl.value = saved;
    syncVol();

    // Try to start right away. Browsers only let a site play sound after the visitor clicks, taps or
    // presses a key, so most of the time this waits silently and the button pulses until then.
    Lofi.start();
    ui();
    setTimeout(ui, 300);

    volEl.addEventListener("input", () => { syncVol(); store.set("sprout:vol", volEl.value); });
    btn.addEventListener("click", () => {
      if (!muted && !Lofi.audible()) {           // first click on the button: start the music, don't mute it
        Promise.resolve(Lofi.resume()).then(ui);
        return;
      }
      muted = !muted;
      store.set("sprout:music", muted ? "0" : "1");
      if (muted) {
        Lofi.stop();
      } else {
        volEl.value = 100;                       // unmuting plays at full volume; the slider can turn it down
        store.set("sprout:vol", "100");
        syncVol();
        Lofi.start();
      }
      ui();
      setTimeout(ui, 300);
    });
    document.addEventListener("visibilitychange", () => Lofi.pause(document.hidden));

    // The first click, tap or key press anywhere on the page unlocks the sound.
    const UNLOCK = ["pointerdown", "pointerup", "click", "touchend", "keydown"];
    const unlock = e => {
      if (muted || (e.target.closest && e.target.closest(".music"))) return;   // the music button handles its own clicks
      if (!Lofi.playing()) Lofi.start();
      Promise.resolve(Lofi.resume()).then(() => {
        ui();
        if (Lofi.audible()) UNLOCK.forEach(ev => window.removeEventListener(ev, unlock, true));
      });
    };
    UNLOCK.forEach(ev => window.addEventListener(ev, unlock, true));
  })();

