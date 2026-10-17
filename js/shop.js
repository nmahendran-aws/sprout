  // ----- Free plans: 3 per visitor, then locked until a subscription exists.
  // Owner mode: open the site once with ?owner=YOUR_CODE to get unlimited plans on that device
  // (add &reset=1 to also reset the counter, or use ?owner=off to turn owner mode off for testing).
  // NOTE: this lives in the browser, so it's a soft limit. Real enforcement needs accounts and a server.
  const FREE_LIMIT = 3;
  const UNLIMITED = false;   // true = unlimited plans and Sprout AI messages for everyone. false = only owner mode is unlimited.
  const OWNER_CODE = "k7Qp-vN3x-Rm29";   // CHANGE THIS to your own secret code
  const USED_KEY = "sprout:used", OWNER_KEY = "sprout:owner";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const params = new URLSearchParams(location.search);
  if (params.get("owner") === OWNER_CODE) {
    store.set(OWNER_KEY, "1");
    if (params.get("reset")) store.set(USED_KEY, "0");
  } else if (params.get("owner") === "off") {
    store.set(OWNER_KEY, "0");
  }
  const isOwner = () => store.get(OWNER_KEY) === "1";
  const used = () => parseInt(store.get(USED_KEY)) || 0;

  function updateUsage() {
    const owner = isOwner() || UNLIMITED, n = used(), locked = !owner && n >= FREE_LIMIT;
    document.getElementById("usage-text").textContent =
      owner ? (UNLIMITED ? "Unlimited plans" : "Owner mode: unlimited plans") : locked ? "All 3 free plans used" : n + " of " + FREE_LIMIT + " free plans used";
    document.querySelectorAll(".pip").forEach((pip, i) => { pip.hidden = owner; pip.classList.toggle("on", i < n); });
    document.getElementById("lock-note").hidden = !locked;
    form.querySelectorAll("input, textarea, button[type=submit]").forEach(x => { x.disabled = locked; });
    form.querySelector("button[type=submit]").textContent = locked ? "Free plans used up" : "Create my plan";
  }
  updateUsage();

  // ----- Sprouts: the currency, saved in this browser (a soft system like the free-plan counter).
  // Owner testing: open the site with ?owner=YOUR_CODE&sprouts=10000 to set your balance.
  const Sprouts = (function () {
    const BAL = "sprout:balance", EARNED = "sprout:earned", START = 500;
    if (store.get(BAL) === null) store.set(BAL, String(START));   // a welcome gift for new visitors
    if (isOwner() && params.has("sprouts")) store.set(BAL, String(Math.max(0, parseInt(params.get("sprouts")) || 0)));
    let toastTimer;
    const api = {
      get: () => Math.max(0, parseInt(store.get(BAL)) || 0),
      set(n) { store.set(BAL, String(Math.max(0, Math.round(n)))); api.paint(); },
      earn(n, why) {
        api.set(api.get() + n);
        Sfx.play("coin");
        const t = document.getElementById("toast");
        t.textContent = "+" + n + " sprouts" + (why ? " · " + why : "");
        t.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
      },
      markOnce(id) {                               // each step or question only pays once
        let done = {};
        try { done = JSON.parse(store.get(EARNED)) || {}; } catch (e) {}
        if (done[id]) return false;
        done[id] = 1;
        store.set(EARNED, JSON.stringify(done));
        return true;
      },
      earnOnce(id, n, why) { if (api.markOnce(id)) api.earn(n, why); },
      studyEarn(n, why) {                          // sprouts from studying get your equipped tree's bonus
        const t = Shop.equipped(), b = t.boost || 0;
        api.earn(Math.round(n * (1 + b / 100)), why + (b ? " (" + t.name + " tree +" + b + "%)" : ""));
      },
      studyOnce(id, n, why) { if (api.markOnce(id)) api.studyEarn(n, why); },
      spend(n) { if (api.get() < n) return false; api.set(api.get() - n); return true; },
      paint() {
        const top = document.getElementById("bal-n");
        if (top) top.textContent = api.get().toLocaleString();
        const w = document.getElementById("wallet-amount");
        if (!w) return;
        w.textContent = api.get().toLocaleString();
        const pill = w.closest(".wallet");
        pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
      }
    };
    return api;
  })();

  // ----- Shop: pick the tree your study plans grow.
  const Shop = (function () {
    const OWNED = "sprout:owned", EQUIPPED = "sprout:equipped";
    const BLOSSOM = "#f7b6c8", WHITE_BLOSSOM = "#fbf3e4";
    // price in sprouts, rarity, fruit colour and how it hangs, leaf colours, trunk colour and canopy shape
    const TREES = [
      { id: "tree", name: "Tree", price: 0, rarity: "common", leaf: ["#4fb39f", "#2f8f7c"], shape: "round" },
      { id: "apple", name: "Apple", price: 300, rarity: "common", color: "#e5484d", hang: "round", leaf: ["#5cb85c", "#3d8b40"], shape: "round" },
      { id: "orange", name: "Orange", price: 400, rarity: "common", color: "#f59e1b", hang: "round", blossom: WHITE_BLOSSOM, leaf: ["#3f9a4a", "#2a7a37"], shape: "dense" },
      { id: "peach", name: "Peach", price: 500, rarity: "common", color: "#f9a27c", hang: "round", leaf: ["#7cc46a", "#559e48"], shape: "round" },
      { id: "pear", name: "Pear", price: 600, rarity: "rare", color: "#c3d651", hang: "drop", blossom: WHITE_BLOSSOM, leaf: ["#8bc34a", "#5f9a30"], shape: "tall" },
      { id: "plum", name: "Plum", price: 700, rarity: "rare", color: "#7b3fa0", hang: "oval", blossom: WHITE_BLOSSOM, leaf: ["#4f9e6d", "#2f7a50"], trunk: "#6e5040", shape: "round" },
      { id: "cherry", name: "Cherry", price: 800, rarity: "rare", color: "#d6303f", hang: "pair", leaf: ["#6fbf73", "#4a9a50"], trunk: "#6b3f3a", shape: "cloud" },
      { id: "lemon", name: "Lemon", price: 900, rarity: "epic", color: "#f7d84a", hang: "oval", blossom: WHITE_BLOSSOM, leaf: ["#4caf50", "#2e8b3e"], shape: "dense" },
      { id: "mango", name: "Mango", price: 1200, rarity: "epic", color: "#f6a93b", hang: "drop", blossom: "#f3e3a0", leaf: ["#2e7d4f", "#1f5e3a"], shape: "dome" },
      { id: "avocado", name: "Avocado", price: 1500, rarity: "epic", color: "#3f6d22", hang: "drop", blossom: "#e6eba0", leaf: ["#3b9d4a", "#285c28"], shape: "tall" },
      { id: "fig", name: "Fig", price: 1800, rarity: "legendary", color: "#6b3a6b", hang: "drop", blossom: "#c9e2a0", leaf: ["#6a9f3a", "#4b7a26"], trunk: "#9a8a78", shape: "dome" },
      { id: "pomegranate", name: "Pomegranate", price: 2200, rarity: "legendary", color: "#c2273a", hang: "round", blossom: "#ff7a59", leaf: ["#5a9e4b", "#3c7a33"], shape: "cloud" },
      { id: "persimmon", name: "Persimmon", price: 2700, rarity: "legendary", color: "#ff8a1f", hang: "round", blossom: "#f3edc4", leaf: ["#d9822b", "#a8561c"], trunk: "#5e4434", shape: "cloud" },
      { id: "papaya", name: "Papaya", price: 3300, rarity: "mythical", color: "#f4a23c", hang: "long", blossom: WHITE_BLOSSOM, leaf: ["#57b84a", "#3a8f33"], trunk: "#9c8a6a", shape: "palm", glow: "#ffd27a" },
      { id: "dragon", name: "Dragon Fruit", price: 5000, rarity: "mythical", color: "#ff3d8b", hang: "oval", blossom: "#fffbe8", leaf: ["#5fbf5a", "#3e9440"], shape: "cactus", glow: "#ff5fa2" },
      { id: "durian", name: "Durian", price: 8000, rarity: "exotic", color: "#b9cc3f", hang: "spiky", blossom: "#f4ead0", leaf: ["#2f8a4a", "#1d6635"], trunk: "#a0763c", shape: "giant", glow: "#ffe27a" }
    ];
    // The best part of a new tree: rarer trees grow more sprouts every time you study.
    const BOOST = { tree: 0, apple: 5, orange: 8, peach: 10, pear: 15, plum: 18, cherry: 20, lemon: 25, mango: 30, avocado: 35,
                    fig: 45, pomegranate: 50, persimmon: 60, papaya: 75, dragon: 100, durian: 150 };
    TREES.forEach(t => { t.boost = BOOST[t.id] || 0; });
    const RARITY = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythical: "Mythical", exotic: "Exotic" };
    const RANK = ["common", "rare", "epic", "legendary", "mythical", "exotic"];
    const atLeast = (t, r) => RANK.indexOf(t.rarity) >= RANK.indexOf(r);
    const byId = id => TREES.find(t => t.id === id) || TREES[0];
    const SPROUT_ICON = '<path d="M20 36V20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M20 22C20 13 13 8 5 9c0 9 6 14 15 13z" fill="currentColor"/><path d="M20 18c0-8 6-13 15-12 0 9-6 14-15 12z" fill="currentColor" fill-opacity=".7"/>';

    // Little illustrated fruits (48 x 48).
    const LEAF = '<path d="M25 9c3-5 9-6 13-4-2 5-8 7-13 4z" fill="#4fb39f"/>';
    const STEM = '<path d="M24 12c0-3 1-5 2-7" stroke="#7a5236" stroke-width="2.2" stroke-linecap="round" fill="none"/>';
    const ART = {
      tree: '<path d="M8 43h32" stroke="#2a3f45" stroke-width="2" stroke-linecap="round"/><rect x="21" y="26" width="6" height="17" rx="2" fill="#8a6a4a"/><circle cx="24" cy="17" r="12" fill="#4fb39f"/><circle cx="14" cy="25" r="7.5" fill="#2f8f7c"/><circle cx="34" cy="25" r="7.5" fill="#2f8f7c"/>',
      apple: STEM + LEAF + '<path d="M24 15c-4-3-14-3-15 8-1 9 6 19 11 19 2 0 3-1 4-1s2 1 4 1c5 0 12-10 11-19-1-11-11-11-15-8z" fill="#e5484d"/><path d="M15 21c1-3 3-4 5-4" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" fill="none"/>',
      orange: LEAF + '<circle cx="24" cy="27" r="15" fill="#f59e1b"/><circle cx="24" cy="13" r="1.6" fill="#7a5236"/><g fill="#ffd27a" opacity=".55"><circle cx="18" cy="22" r="1"/><circle cx="28" cy="20" r="1"/><circle cx="31" cy="30" r="1"/><circle cx="20" cy="33" r="1"/><circle cx="25" cy="27" r="1"/></g><path d="M14 23c1-3 3-5 6-6" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      peach: LEAF + '<circle cx="24" cy="27" r="15" fill="#f9a27c"/><circle cx="29" cy="31" r="9" fill="#f26b5b" opacity=".45"/><path d="M24 13c-4 6-4 20 0 29" stroke="#e0705a" stroke-width="1.6" fill="none"/><path d="M14 23c1-3 3-5 6-6" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      pear: STEM + LEAF + '<path d="M24 12c-4 0-6 4-6 9 0 3-7 6-7 13 0 6 6 9 13 9s13-3 13-9c0-7-7-10-7-13 0-5-2-9-6-9z" fill="#c3d651"/><path d="M16 31c0-3 2-5 4-6" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      plum: STEM + '<ellipse cx="24" cy="28" rx="13" ry="15" fill="#7b3fa0"/><path d="M24 13c-3 7-3 21 0 30" stroke="#5a2b77" stroke-width="1.6" fill="none"/><ellipse cx="17" cy="23" rx="2.5" ry="5" fill="#fff" opacity=".25"/>',
      cherry: '<path d="M16 30c2-10 6-17 14-22M32 32c-1-9-1-17-2-24" stroke="#5f7a2a" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M30 8c4-3 9-2 11 1-4 3-8 3-11-1z" fill="#4fb39f"/><circle cx="15" cy="34" r="8" fill="#d6303f"/><circle cx="32" cy="36" r="8" fill="#b81f30"/><circle cx="12" cy="31" r="1.8" fill="#fff" opacity=".5"/><circle cx="29" cy="33" r="1.8" fill="#fff" opacity=".5"/>',
      lemon: '<path d="M7 27c0-8 8-14 17-14s17 6 17 14-8 14-17 14S7 35 7 27z" fill="#f7d84a"/><path d="M5 27l3-2v4zM43 27l-3-2v4z" fill="#f7d84a"/><path d="M14 22c2-3 5-4 8-4" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M30 10c3-3 8-3 10 0-3 2-7 2-10 0z" fill="#4fb39f"/>',
      mango: '<path d="M30 9c8 3 12 12 10 21-2 8-9 12-16 12-8 0-15-5-15-12 0-6 5-9 10-10 5-1 7-4 7-8 0-2 2-4 4-3z" fill="#f6a93b"/><path d="M32 12c6 4 8 11 6 18-1 5-5 8-9 9 5-6 6-17 3-27z" fill="#e5484d" opacity=".55"/><path d="M28 9c1-3 4-5 7-5" stroke="#4fb39f" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M14 27c1-2 3-3 5-3" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" fill="none"/>',
      avocado: '<path d="M24 5c-5 0-7 6-8 11-1 4-6 8-6 15 0 7 6 12 14 12s14-5 14-12c0-7-5-11-6-15-1-5-3-11-8-11z" fill="#3f6d22"/><path d="M24 9c-3 0-5 5-6 9-1 4-5 7-5 13 0 5 5 9 11 9s11-4 11-9c0-6-4-9-5-13-1-4-3-9-6-9z" fill="#d7e98c"/><circle cx="24" cy="30" r="6.5" fill="#8a5a35"/><circle cx="22" cy="28" r="1.8" fill="#fff" opacity=".3"/>',
      fig: STEM + '<path d="M24 11c-3 0-4 4-6 7-3 5-9 8-9 15 0 6 7 10 15 10s15-4 15-10c0-7-6-10-9-15-2-3-3-7-6-7z" fill="#6b3a6b"/><path d="M18 26c1-3 2-5 4-7" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M20 41c3 1 5 1 8 0" stroke="#4a254a" stroke-width="1.4" fill="none"/>',
      pomegranate: '<path d="M19 13l1-6 4 4 4-4 1 6z" fill="#9e1c2e"/><circle cx="24" cy="28" r="15" fill="#c2273a"/><circle cx="29" cy="32" r="9" fill="#9e1c2e" opacity=".45"/><path d="M14 23c1-3 3-5 6-6" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      persimmon: '<ellipse cx="24" cy="29" rx="16" ry="13" fill="#f07c1f"/><path d="M24 15l-8 3 5 2-3 4 6-3 6 3-3-4 5-2z" fill="#4f7d2b"/><circle cx="24" cy="16" r="2" fill="#5f4a2a"/><path d="M13 27c1-3 3-4 5-5" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      papaya: '<path d="M18 8c-6 2-9 9-9 17 0 10 6 18 15 18s15-6 15-14c0-6-4-9-8-13-4-4-7-10-13-8z" fill="#f4a23c"/><path d="M18 8c-6 2-9 9-9 17 0 5 2 10 5 13-1-6 0-15 4-21 2-3 4-6 6-7-2-2-4-3-6-2z" fill="#7fae3a" opacity=".75"/><path d="M17 7c0-2 1-3 2-4" stroke="#7a5236" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M27 24c1-2 3-3 5-2" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" fill="none"/>',
      dragon: '<ellipse cx="24" cy="27" rx="13" ry="16" fill="#e8417f"/><g fill="#e8417f" stroke="#7fbf3f" stroke-width="2" stroke-linejoin="round"><path d="M11 22l-6-4 8-1z"/><path d="M37 22l6-4-8-1z"/><path d="M12 33l-7 1 7-6z"/><path d="M36 33l7 1-7-6z"/><path d="M20 12l-3-7 6 5z"/><path d="M28 12l3-7-6 5z"/><path d="M24 43l0 4"/></g><path d="M18 22c1-3 3-5 5-6" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>',
      durian: '<g fill="#7f8f2a"><path d="M24 9l2 4h-4z"/><path d="M11 17l4 2-3 3z"/><path d="M37 17l-4 2 3 3z"/><path d="M8 29l4-1-1 4z"/><path d="M40 29l-4-1 1 4z"/><path d="M13 40l3-3 1 4z"/><path d="M35 40l-3-3-1 4z"/><path d="M24 45l-2-4h4z"/></g><ellipse cx="24" cy="28" rx="14" ry="15" fill="#a6b83c"/><g fill="#7f8f2a"><path d="M18 20l2 3h-4z"/><path d="M28 19l2 3h-4z"/><path d="M23 27l2 3h-4z"/><path d="M15 31l2 3h-4z"/><path d="M31 30l2 3h-4z"/><path d="M22 36l2 3h-4z"/></g><path d="M23 10c0-3 1-5 3-6" stroke="#7a5236" stroke-width="2.2" stroke-linecap="round" fill="none"/>'
    };
    const svg = (inner, vb) => {
      const t = document.createElement("template");
      t.innerHTML = '<svg viewBox="' + vb + '" aria-hidden="true">' + inner + '</svg>';
      return t.content.firstChild;
    };

    // Growth stages: the first four reuse the home-page drawings (recoloured), then each tree has its own shape.
    let BASE = null;
    const base = () => BASE || (BASE = [...document.querySelectorAll(".stg svg")].map(x => x.innerHTML));
    const STAGE_NAMES = ["Seed", "Sprout", "Seedling", "Sapling", "Young tree", "Full tree"];
    const GROUND = '<path d="M6 73H54" stroke="#2a3f45" stroke-width="2" stroke-linecap="round"/>';
    const c = (x, y, r, f, extra) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (extra || "") + '/>';
    const e = (x, y, rx, ry, f) => '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"/>';
    const trunk = (t, x, y, w, h) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + (t.trunk || "#8a6a4a") + '"/>';
    const branches = t => '<path d="M30 48l-10-8M30 44l10-9" stroke="' + (t.trunk || "#8a6a4a") + '" stroke-width="3" stroke-linecap="round"/>';

    // Each shape returns the drawing plus where fruit and flowers go.
    const SHAPES = {
      round: (t, L, D) => ({ body: trunk(t, 25, 32, 10, 41) + branches(t) + c(30, 19, 17, L) + c(14, 31, 12, D) + c(46, 31, 12, D) + c(30, 32, 11, L),
        pts: [[21, 13], [37, 11], [30, 24], [12, 29], [47, 28], [20, 37], [40, 37]] }),
      dense: (t, L, D) => ({ body: trunk(t, 26, 38, 8, 35) + c(30, 25, 19, D) + c(27, 21, 15, L) + c(38, 29, 9, L) + c(20, 32, 8, L),
        pts: [[22, 16], [36, 14], [30, 26], [17, 30], [43, 27], [26, 37], [37, 36]] }),
      tall: (t, L, D) => ({ body: trunk(t, 27, 42, 6, 31) + e(22, 34, 8, 11, D) + e(38, 34, 8, 11, D) + e(30, 23, 14, 21, L),
        pts: [[26, 11], [35, 15], [30, 25], [21, 32], [39, 32], [27, 38], [34, 40]] }),
      dome: (t, L, D) => ({ body: trunk(t, 26, 36, 8, 37) + '<path d="M30 50l-12-10M30 46l12-9" stroke="' + (t.trunk || "#8a6a4a") + '" stroke-width="3" stroke-linecap="round"/>' + e(30, 34, 22, 8, D) + e(30, 26, 25, 14, L),
        pts: [[13, 29], [22, 20], [30, 30], [38, 20], [47, 29], [24, 36], [37, 36]] }),
      cloud: (t, L, D) => ({ body: trunk(t, 26, 36, 8, 37) + branches(t) + c(23, 36, 10, D) + c(37, 36, 10, D) + c(17, 25, 11, L) + c(43, 25, 11, L) + c(30, 27, 13, L) + c(30, 14, 11, L),
        pts: [[23, 12], [37, 15], [30, 26], [14, 25], [46, 26], [23, 38], [37, 38]] }),
      palm: (t, L, D) => ({ body:
          '<path d="M31 73C28 58 27 40 31 22" stroke="' + t.trunk + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
          '<path d="M27 64h5M27 56h5M27 48h5M28 40h5M29 32h4" stroke="#6f6048" stroke-width="1.2" stroke-linecap="round"/>' +
          ['M31 21Q18 12 5 22Q18 18 31 21', 'M31 21Q24 6 12 6Q24 12 31 21', 'M31 21Q34 4 46 4Q36 10 31 21', 'M31 21Q46 12 56 22Q44 18 31 21', 'M31 21Q22 24 14 36Q24 26 31 21', 'M31 21Q42 24 48 36Q38 26 31 21']
            .map((d, i) => '<path d="' + d + 'z" fill="' + (i % 2 ? D : L) + '"/>').join(""),
        pts: [[27, 25], [35, 25], [31, 29], [26, 31], [36, 31], [31, 35]] }),
      cactus: (t, L, D) => ({ body:
          '<rect x="25" y="22" width="10" height="51" rx="5" fill="' + L + '"/>' +
          '<rect x="12" y="36" width="7" height="20" rx="3.5" fill="' + L + '"/><rect x="12" y="49" width="16" height="7" rx="3.5" fill="' + L + '"/>' +
          '<rect x="41" y="28" width="7" height="22" rx="3.5" fill="' + L + '"/><rect x="32" y="43" width="16" height="7" rx="3.5" fill="' + L + '"/>' +
          '<path d="M30 25v46M15.5 39v14M44.5 31v16" stroke="' + D + '" stroke-width="1.4" stroke-linecap="round"/>' +
          '<g stroke="#e8f5d0" stroke-width=".8" stroke-linecap="round"><path d="M25 30l-2-1M35 34l2-1M25 44l-2-1M35 58l2-1M12 42l-2-1M48 34l2-1"/></g>',
        pts: [[30, 21], [15.5, 35], [44.5, 27], [22, 47], [38, 40], [30, 54]] }),
      giant: (t, L, D) => ({ body:
          '<path d="M22 73c3-3 5-6 6-12M38 73c-3-3-5-6-6-12" stroke="' + t.trunk + '" stroke-width="3" stroke-linecap="round" fill="none"/>' +
          trunk(t, 25, 34, 10, 39) + branches(t) + c(17, 35, 11, D) + c(43, 35, 11, D) + c(11, 25, 9, L) + c(49, 25, 9, L) + c(30, 29, 14, D) + c(20, 17, 11, L) + c(40, 17, 11, L) + c(30, 12, 11, L),
        pts: [[20, 11], [39, 11], [30, 21], [11, 25], [49, 25], [19, 34], [41, 34], [30, 37]] })
    };

    function fruitMark(t, x, y) {
      const f = t.color;
      switch (t.hang) {
        case "oval": return '<ellipse cx="' + x + '" cy="' + y + '" rx="2.6" ry="3.4" fill="' + f + '"/>';
        case "long": return '<ellipse cx="' + x + '" cy="' + (y + 1) + '" rx="2.1" ry="3.9" fill="' + f + '"/>';
        case "drop": return '<path d="M' + x + ' ' + (y - 3) + 'c-1.5 0-1.4 2-2.4 3-1 1.3-.8 3.6 2.4 3.6s3.4-2.3 2.4-3.6c-1-1-0.9-3-2.4-3z" fill="' + f + '"/>';
        case "pair": return c(x - 1.6, y + 1, 2, f) + c(x + 1.8, y + 1.6, 2, f);
        case "spiky": return c(x, y, 3.3, f, ' stroke="#6f7f22" stroke-width="1.3" stroke-dasharray="1 1"');
        default: return c(x, y, 3.2, f) + c(x - 0.9, y - 0.9, 0.8, "#fff", ' opacity=".45"');
      }
    }
    const star = (x, y, r, d) => '<path class="fx-tw" style="animation-delay:' + d + 's" d="M' + x + ' ' + (y - r) + 'L' + (x + r * .3) + ' ' + (y - r * .3) + 'L' + (x + r) + ' ' + y + 'L' + (x + r * .3) + ' ' + (y + r * .3) + 'L' + x + ' ' + (y + r) + 'L' + (x - r * .3) + ' ' + (y + r * .3) + 'L' + (x - r) + ' ' + y + 'L' + (x - r * .3) + ' ' + (y - r * .3) + 'z" fill="#ffe27a"/>';

    // Effects by rarity: rare+ shiny leaves, legendary+ twinkling sparkles, mythical+ a glow, exotic a rainbow aura.
    function backFx(t) {
      let out = "";
      if (t.glow) out += '<defs><radialGradient id="glow-' + t.id + '"><stop offset="0" stop-color="' + t.glow + '" stop-opacity=".55"/><stop offset="1" stop-color="' + t.glow + '" stop-opacity="0"/></radialGradient></defs>' +
        '<circle class="fx-pulse" cx="30" cy="30" r="30" fill="url(#glow-' + t.id + ')"/>';
      if (t.rarity === "exotic") out += '<defs><linearGradient id="rainbow-' + t.id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset=".25" stop-color="#ffd166"/><stop offset=".5" stop-color="#3ddc97"/><stop offset=".75" stop-color="#38a6ff"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>' +
        '<circle class="fx-spin" cx="30" cy="26" r="27" fill="none" stroke="url(#rainbow-' + t.id + ')" stroke-width="1.6" stroke-dasharray="4 3" opacity=".9"/>';
      return out;
    }
    function frontFx(t, pts) {
      let out = "";
      if (atLeast(t, "rare") && t.shape !== "cactus" && t.shape !== "palm") out += pts.slice(0, 4).map(([x, y]) => c(x + 4, y - 4, 1.2, "#fff", ' opacity=".35"')).join("");
      if (atLeast(t, "legendary")) out += star(8, 14, 3, 0) + star(52, 10, 2.6, .7) + star(50, 44, 2.2, 1.3) + star(10, 46, 2.4, 1.9);
      if (t.rarity === "exotic") out += [[14, 60], [46, 62], [30, 66], [22, 54], [40, 52]].map(([x, y], i) => c(x, y, 1.1, "#fff3b0", ' class="fx-float" style="animation-delay:' + (i * .6) + 's"')).join("");
      return out;
    }

    function stageInner(t, i) {
      if (t.id === "tree") return base()[i] || "";
      const [L, D] = t.leaf;
      if (i < 4) return (base()[i] || "").split("#4fb39f").join(L).split("#2f8f7c").join(D);
      const sh = SHAPES[t.shape](t, L, D);
      if (i === 4)   // blossoms: a smaller tree covered in flowers
        return GROUND + '<g transform="translate(6 14.6) scale(.8)">' + sh.body +
          sh.pts.map(([x, y]) => c(x, y, 2.6, t.blossom || BLOSSOM) + c(x, y, 0.9, "#f5c542")).join("") + '</g>' +
          (atLeast(t, "mythical") ? star(10, 30, 2.2, 0) + star(50, 26, 2, 1) : "");
      return backFx(t) + GROUND + sh.body + sh.pts.map(([x, y]) => fruitMark(t, x, y)).join("") + frontFx(t, sh.pts);
    }
    const stageName = (t, i) => t.id === "tree" ? STAGE_NAMES[i] : i === 4 ? "Blossoms" : i === 5 ? t.name + " tree" : STAGE_NAMES[i];

    const owned = () => { try { return JSON.parse(store.get(OWNED)) || ["tree"]; } catch (e) { return ["tree"]; } };
    const equippedId = () => { const id = store.get(EQUIPPED) || "tree"; return owned().includes(id) ? id : "tree"; };

    function render() {
      const list = document.getElementById("shop-list");
      const have = owned(), eq = equippedId(), bal = Sprouts.get();
      list.replaceChildren();
      TREES.forEach(t => {
        const row = el("div", "", "shop-item r-" + t.rarity + (t.id === eq ? " equipped" : ""));
        const left = el("div", "", "fruit");
        const label = el("div", "", "fruit-label");
        label.append(el("span", t.name, "fruit-name"), el("span", RARITY[t.rarity], "rarity " + t.rarity),
          el("span", t.boost ? "+" + t.boost + "% sprouts" : "No bonus", "boost" + (t.boost ? "" : " none")));
        left.append(svg(ART[t.id], "0 0 48 48"), label);

        const cycle = el("div", "", "cycle");
        cycle.setAttribute("aria-label", t.name + " growth: " + STAGE_NAMES.map((_, i) => stageName(t, i)).join(", "));
        for (let i = 0; i < 6; i++) {
          const c = el("div", "", "cyc" + (i === 5 ? " last" : ""));
          c.append(svg(stageInner(t, i), "0 0 60 80"), el("span", stageName(t, i)));
          cycle.append(c);
        }

        const right = el("div", "", "shop-right");
        const btn = el("button", "", "shop-btn");
        btn.type = "button";
        if (t.id === eq) {
          btn.textContent = "Equipped"; btn.classList.add("is-equipped"); btn.disabled = true;
        } else if (have.includes(t.id)) {
          btn.textContent = "Equip"; btn.classList.add("equip");
          btn.onclick = () => { store.set(EQUIPPED, t.id); Sfx.play("equip"); render(); };
        } else {
          btn.classList.add("buy");
          btn.append(el("small", "buy", "buy-k"));
          const amt = el("span", "", "buy-amt");
          amt.append(svg(SPROUT_ICON, "0 0 40 40"), document.createTextNode(t.price.toLocaleString()));
          btn.append(amt);
          btn.setAttribute("aria-label", "Buy the " + t.name + " tree for " + t.price + " sprouts");
          if (bal < t.price) {
            btn.disabled = true;
            right.append(btn, el("small", (t.price - bal).toLocaleString() + " more sprouts to go", "shop-need"));
          }
          btn.onclick = () => {
            if (!Sprouts.spend(t.price)) return;
            Sfx.play("chaching");
            store.set(OWNED, JSON.stringify(owned().concat(t.id)));
            store.set(EQUIPPED, t.id);   // a new tree is equipped right away
            render();
          };
        }
        if (!btn.parentNode) right.prepend(btn);
        row.append(left, cycle, right);
        list.append(row);
      });
      Sprouts.paint();
    }

    return {
      render,
      equipped: () => byId(equippedId()),
      stageSVG: (t, i) => svg(stageInner(t, i), "0 0 60 80"),
      byId,
      icon: () => svg(SPROUT_ICON, "0 0 40 40"),
      stageName
    };
  })();
  function renderShop() { Shop.render(); }


