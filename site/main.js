/* Steady landing page.
   Every number on the page lives in DATA. Change it here and nowhere else. */
const DATA = {
  // "What we found": asks that landed on a week with a high PHQ-2, at this many asks per student-year
  budget: 12,
  students: 213,
  asks: [
    { label: "Fixed calendar", value: 13 },
    { label: "Phone model", value: 18 },
    { label: "One short check-in", value: 24, lead: true },
  ],
  asksScaleMax: 30,
  matchedRandom: 23, // random weeks, same student and term
  // the tone model against a keyword list, on comments it had never seen
  tone: { model: 50, keyword: 24, commentsText: "5,427", scaleMax: 70 },
  limits: { selfHarmMissed: 9, selfHarmTotal: 15, aucMen: "0.75", aucWomen: "0.66" },
  // "The problem" (NIMH, 2021)
  problem: { one: 1, oneIn: 5, untreatedIn10: 6, treatedPct: "40.6" },
  // the message typed in the privacy section
  typed: "i miss how things used to be",
};

(() => {
  const root = document.documentElement;
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (RM) root.classList.add("rm");

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

  /* ---------- fill the page from DATA ---------- */
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), DATA);
  $$("[data-bind]").forEach((el) => { const v = lookup(el.dataset.bind); if (v != null) el.textContent = String(v); });

  function buildBars(host, rows, scaleMax, mark) {
    host.innerHTML = rows.map((r, i) => `
      <div class="bar-row${r.lead ? " lead" : ""}">
        <span class="bar-label">${r.label}</span>
        <div class="bar-track">
          <i class="bar-fill" style="--w:${((r.value / scaleMax) * 100).toFixed(2)}%;--i:${i}"></i>
          ${mark != null ? `<i class="bar-mark" data-tag="${mark}% at random" style="--x:${((mark / scaleMax) * 100).toFixed(2)}%"></i>` : ""}
        </div>
        <span class="bar-val"><b data-count="${r.value}">0</b>%</span>
      </div>`).join("");
  }
  buildBars($("#askBars"), DATA.asks, DATA.asksScaleMax, DATA.matchedRandom);
  buildBars($("#toneBars"), [
    { label: "Our tone model", value: DATA.tone.model, lead: true },
    { label: "Keyword list", value: DATA.tone.keyword },
  ], DATA.tone.scaleMax, null);

  /* ---------- words that rise ---------- */
  $$("[data-split]").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute("aria-label", words.join(" "));
    el.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
  });

  /* ---------- theme: night to paper ---------- */
  const NIGHT = { bg: [14, 17, 20], fg: [244, 242, 236], fg2: [169, 171, 169], hair: [244, 242, 236, 0.14], grain: 0.5 };
  const PAPER = { bg: [239, 237, 232], fg: [21, 23, 26], fg2: [107, 111, 118], hair: [21, 23, 26, 0.1], grain: 0.26 };
  const DAWN = [128, 116, 108];
  const themeMeta = $('meta[name="theme-color"]');
  const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(",")})`;
  let lastWarm = -1;
  function setTheme(w) {
    w = Math.round(w * 100) / 100;
    if (w === lastWarm) return;
    lastWarm = w;
    const k = smooth(0.46, 0.54, w); // text flips within a few pixels of scroll, so it never sits grey on grey
    const h = NIGHT.hair.map((v, i) => mix(v, PAPER.hair[i], k));
    const st = root.style;
    // night to paper by way of a warm dawn grey, not a flat neutral one
    st.setProperty("--bg", w < 0.5 ? rgb(NIGHT.bg, DAWN, w * 2) : rgb(DAWN, PAPER.bg, (w - 0.5) * 2));
    st.setProperty("--fg", rgb(NIGHT.fg, PAPER.fg, k));
    st.setProperty("--fg2", rgb(NIGHT.fg2, PAPER.fg2, k));
    st.setProperty("--hair", `rgba(${Math.round(h[0])},${Math.round(h[1])},${Math.round(h[2])},${h[3].toFixed(3)})`);
    st.setProperty("--grain", mix(NIGHT.grain, PAPER.grain, w).toFixed(2));
    if (themeMeta) themeMeta.setAttribute("content", w > 0.5 ? "#EFEDE8" : "#0E1114");
  }

  /* ---------- hero: four signal lines, two of them slipping out of their band ---------- */
  const cv = $("#signals"), ctx = cv.getContext("2d"), hero = $(".hero");
  let cw = 0, ch = 0, dpr = 1, lt = 0.2, lg = 0.1;
  function sizeCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const cs = getComputedStyle(hero);
    lt = parseFloat(cs.getPropertyValue("--lt")) || 0.2;
    lg = parseFloat(cs.getPropertyValue("--lg")) || 0.1;
  }
  function drawSignals(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const band = clamp(ch * 0.05, 24, 46), step = 6, n = Math.ceil(cw / step) + 1;
    const breathe = 0.9 + 0.1 * Math.sin(t * 0.35);
    for (let i = 0; i < 4; i++) {
      const by = ch * (lt + lg * i);
      ctx.fillStyle = "rgba(244,242,236,0.04)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, by - band / 2, cw, band, 8); else ctx.rect(0, by - band / 2, cw, band);
      ctx.fill();
      const ys = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        const x = j * step, u = x / cw;
        let y = Math.sin(x * 0.011 + t * 0.55 + i * 1.7) * 0.5 + Math.sin(x * 0.029 - t * 0.38 + i * 0.9) * 0.3 + Math.sin(x * 0.067 + t * 0.8 + i) * 0.2;
        y *= band * 0.26;
        if (i === 1) y += band * 1.7 * smooth(0.5, 0.78, u) * breathe;      // reaching out slips first
        if (i === 0) y += band * 1.15 * smooth(0.7, 0.93, u) * breathe;     // then sleep
        ys[j] = by + y;
      }
      ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(244,242,236,0.82)";
      ctx.beginPath();
      for (let j = 0; j < n; j++) (j ? ctx.lineTo(j * step, ys[j]) : ctx.moveTo(0, ys[0]));
      ctx.stroke();
      // repaint in amber wherever the line sits outside its band
      ctx.strokeStyle = "#F2A33A"; ctx.lineWidth = 1.9;
      ctx.beginPath();
      let open = false;
      for (let j = 0; j < n; j++) {
        const out = Math.abs(ys[j] - by) > band / 2;
        if (out) { if (!open) { ctx.moveTo(j * step, ys[j]); open = true; } else ctx.lineTo(j * step, ys[j]); }
        else open = false;
      }
      ctx.stroke();
    }
  }

  /* ---------- the problem ---------- */
  const beats = Object.fromEntries($$("#problem .beat").map((b) => [b.dataset.beat, b]));
  const oneDot = $(".five .one"), tens = $$(".ten i"), clipRect = $("#slipClipRect"), slipTags = $$(".slip-tag");
  const beatCHead = $(".beat-c .headline"), slipWrap = $(".slip-wrap");
  (function slipPath() {
    const W = 1200, base = 118, drops = [[0.3, 46], [0.54, 60], [0.78, 70]], N = 240;
    let d = "";
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      let y = base + Math.sin(u * 38) * 5 + Math.sin(u * 91 + 1.3) * 3 + Math.sin(u * 17 + 0.4) * 4;
      for (const [at, drop] of drops) y += drop * smooth(at - 0.045, at + 0.045, u);
      d += `${i ? "L" : "M"}${(u * W).toFixed(1)} ${y.toFixed(1)}`;
    }
    $("#slipLine").setAttribute("d", d);
  })();
  const show = (el, o, y = 0) => { el.style.opacity = o.toFixed(3); el.style.transform = y ? `translate3d(0,${y.toFixed(1)}px,0)` : ""; };
  function problem(p, rm) {
    if (rm) {
      oneDot.style.fillOpacity = 1;
      tens.forEach((el, i) => el.classList.toggle("off", i < DATA.problem.untreatedIn10));
      clipRect.setAttribute("width", 1200);
      slipTags.forEach((t) => t.classList.add("on"));
      return;
    }
    const a = 1 - smooth(0.2, 0.25, p);
    const b = Math.min(smooth(0.25, 0.3, p), 1 - smooth(0.46, 0.51, p));
    const c = smooth(0.51, 0.56, p);
    const d = smooth(0.88, 0.94, p);
    show(beats.a, a, -40 * smooth(0.1, 0.25, p));
    show(beats.b, b, 40 * (1 - smooth(0.25, 0.3, p)) - 40 * smooth(0.4, 0.51, p));
    show(beats.c, c, 40 * (1 - c));
    show(beats.d, d, 30 * (1 - d));
    oneDot.style.fillOpacity = smooth(0.05, 0.15, p).toFixed(3);
    const off = DATA.problem.untreatedIn10;
    tens.forEach((el, i) => el.classList.toggle("off", i < off && p > 0.3 + i * 0.016));
    const r = smooth(0.57, 0.85, p);
    clipRect.setAttribute("width", (1200 * r).toFixed(1));
    slipTags.forEach((t) => t.classList.toggle("on", r >= parseFloat(t.dataset.at)));
    beatCHead.style.opacity = (1 - smooth(0.86, 0.91, p)).toFixed(3);
    slipWrap.style.opacity = mix(1, 0.13, smooth(0.86, 0.94, p)).toFixed(3);
  }

  /* ---------- what Steady does ---------- */
  const howBox = $(".sticky.how"), steps = $$(".step"), notes = $$(".note"), howShots = $$(".how-phone .shot"), railFill = $(".rail i");
  let howIdx = -1;
  function how(p, rm) {
    const i = rm ? 0 : Math.min(3, Math.floor(p * 4 * 0.9999));
    if (i !== howIdx) {
      howIdx = i;
      howBox.dataset.active = String(i);
      if (!rm) { steps.forEach((s, k) => s.classList.toggle("on", k === i)); notes.forEach((s, k) => s.classList.toggle("on", k === i)); }
      howShots.forEach((s, k) => s.classList.toggle("on", k === i));
      syncVideos();
    }
    railFill.style.transform = `scaleY(${p.toFixed(3)})`;
  }

  /* ---------- privacy: a message becomes a bubble, then a dot ---------- */
  const bubble = $("#bubble"), typed = $("#typed"), newDot = $("#newDot");
  typed.innerHTML = [...DATA.typed].map((c) => `<span>${c === " " ? "&nbsp;" : c}</span>`).join("");
  const chars = $$("span", typed);
  let toDot = { x: 0, y: 0 }, shown = -1, bubbleW = 0, charRight = [];
  function measurePrivacy() {
    bubble.style.transform = ""; newDot.style.transform = ""; // measure both at rest (resize time only)
    const b = bubble.getBoundingClientRect(), d = newDot.getBoundingClientRect();
    if (!b.width) return;
    toDot = { x: d.left + d.width / 2 - b.left, y: d.top + d.height / 2 - b.bottom };
    bubbleW = b.width;
    charRight = chars.map((c) => c.getBoundingClientRect().right - b.left);
    shown = -1;
  }
  // the bubble is as wide as what has been typed so far (a clip, so nothing reflows)
  const clipBubble = (k) => {
    const right = k >= chars.length ? 0 : Math.max(0, bubbleW - ((charRight[k - 1] || 26) + 18));
    bubble.style.clipPath = `inset(0 ${right.toFixed(1)}px 0 0 round 22px 22px 22px 6px)`;
  };
  function privacy(p, rm) {
    const t = rm ? 1 : smooth(0.1, 0.42, p);
    const k = Math.round(t * chars.length);
    if (k !== shown) { shown = k; chars.forEach((c, i) => c.classList.toggle("on", i < k)); clipBubble(k); }
    if (rm) { bubble.style.opacity = 1; newDot.style.opacity = 1; return; }
    const m = easeOut(smooth(0.5, 0.74, p));
    bubble.style.opacity = (smooth(0.04, 0.1, p) * (1 - smooth(0.66, 0.74, p))).toFixed(3);
    bubble.style.transform = `translate3d(${(toDot.x * m).toFixed(1)}px,${(toDot.y * m).toFixed(1)}px,0) scale(${(1 - 0.95 * m).toFixed(3)})`;
    const d = smooth(0.68, 0.78, p);
    newDot.style.opacity = d.toFixed(3);
    newDot.style.transform = `scale(${(2.4 - 1.4 * d).toFixed(3)})`;
  }

  /* ---------- the note ---------- */
  const courier = $(".courier"), noteStage = $(".note-stage"), chips = $$(".tag-chip");
  const shotHome = $('[data-note="home"]'), shotNote = $('[data-note="note"]');
  let stageW = 560, noteOn = null;
  function note(p, rm) {
    const arrived = rm || p > 0.3;
    if (arrived !== noteOn) { noteOn = arrived; shotNote.classList.toggle("on", arrived); shotHome.classList.toggle("on", !arrived); }
    chips.forEach((c, i) => c.classList.toggle("on", rm || p > 0.44 + i * 0.14));
    if (rm) return;
    const t = smooth(0.06, 0.3, p);
    courier.style.opacity = (smooth(0.04, 0.1, p) * (1 - smooth(0.27, 0.33, p))).toFixed(3);
    courier.style.transform = `translate3d(${(stageW * 0.5 * easeOut(t)).toFixed(1)}px,0,0)`;
  }

  /* ---------- media in the phones: real captures when present, a labelled placeholder until then ---------- */
  function addImg(slot, src, onFail) {
    const im = new Image();
    im.alt = ""; im.decoding = "async";
    im.onload = () => { slot.appendChild(im); slot.classList.add("ready"); };
    im.onerror = onFail || (() => {});
    im.src = src;
  }
  $$(".shot[data-media]").forEach((slot) => {
    const src = slot.dataset.media, jpg = src.replace(/\.(mp4|png)$/, ".jpg");
    if (src.endsWith(".mp4")) {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.addEventListener("loadeddata", () => { slot.classList.add("ready"); syncVideos(); });
      v.addEventListener("error", () => { v.remove(); slot._video = null; addImg(slot, jpg); });
      v.src = src;
      slot.appendChild(v);
      slot._video = v;
    } else {
      addImg(slot, src, () => addImg(slot, jpg));
    }
  });
  const sectionSeen = new WeakMap();
  function syncVideos() {
    $$(".shot").forEach((slot) => {
      const v = slot._video;
      if (!v) return;
      const want = !RM && slot.classList.contains("on") && sectionSeen.get(slot.closest(".scrub"));
      if (want && v.paused) v.play().catch(() => {});
      if (!want && !v.paused) v.pause();
    });
  }
  const demo = $("#demoVideo"), player = demo.closest(".player");
  demo.addEventListener("loadedmetadata", () => player.classList.add("ready"));

  /* ---------- reveal on enter, count up ---------- */
  function countUp(el) {
    const to = parseFloat(el.dataset.count), t0 = performance.now(), dur = 1300;
    if (RM) { el.textContent = String(to); return; }
    const tick = (now) => {
      const k = easeOut((now - t0) / dur);
      el.textContent = String(Math.round(to * k));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      $$("[data-count]", e.target).forEach(countUp);
      seen.unobserve(e.target);
    }
  }, { threshold: 0.3, rootMargin: "0px 0px -8% 0px" });
  $$(".reveal, .flow .split").forEach((el) => seen.observe(el));
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) sectionSeen.set(e.target, e.isIntersecting);
    syncVideos();
  }, { threshold: 0.05 });
  $$(".scrub").forEach((el) => near.observe(el));

  /* ---------- the scroll engine: read once, then write transforms and opacity ---------- */
  const handlers = { problem, how, privacy, note };
  const scrubs = $$("[data-scrub]").map((el) => ({ el, fn: handlers[el.dataset.scrub], top: 0, h: 0, p: -1 }));
  const howEl = $("#how");
  let vh = innerHeight, howTop = 0, lastY = -1, dirty = true, heroOn = true;
  function measure() {
    vh = innerHeight;
    const y = scrollY;
    for (const s of scrubs) { const r = s.el.getBoundingClientRect(); s.top = r.top + y; s.h = r.height; s.p = -1; }
    howTop = howEl.getBoundingClientRect().top + y;
    stageW = noteStage.getBoundingClientRect().width || 560;
    measurePrivacy();
    sizeCanvas();
    if (RM) drawSignals(4); // resizing a canvas clears it, and nothing else redraws in reduced motion
    dirty = true;
  }
  function update(y) {
    if (!RM) {
      for (const s of scrubs) {
        const p = clamp((y - s.top) / Math.max(1, s.h - vh));
        if (p !== s.p) { s.p = p; s.fn(p, false); }
      }
    }
    setTheme(clamp((y + vh * 0.92 - howTop) / (vh * 0.8)));
    heroOn = y < vh * 1.05;
  }
  function frame(now) {
    const y = scrollY;
    if (y !== lastY || dirty) { lastY = y; dirty = false; update(y); }
    if (heroOn && !RM) drawSignals(now / 1000);
    requestAnimationFrame(frame);
  }

  let resizeQueued = false;
  addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; measure(); });
  });
  addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  measure();
  if (RM) for (const s of scrubs) s.fn(1, true);
  requestAnimationFrame(() => requestAnimationFrame(() => { hero.classList.add("in"); $(".hero h1").classList.add("in"); }));
  requestAnimationFrame(frame);
})();
