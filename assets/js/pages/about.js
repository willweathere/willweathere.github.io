/* HCLabs — About page behaviour.
   1 the doorway window: reading position → story progress (0 hero · 1–5 chapters) → 3D camera, caption, traced outline,
     active chapter. Desktop: window pinned beside the copy. Phones/portrait: window pinned on top, chapters pass over it.
   2 the experience line: a path built through the station dots, drawn by scroll; stations light as it arrives.
   Scroll work joins the shared HC scroll frame; everything is transform/opacity/attribute-only.
   ?shot=1 / reduced motion: settled states (chapters fully visible, line drawn, 3D at the exact chapter pose).
   Review helper (screenshots only): ?shot=1&ab-p=<0..5> shows the window at that story state. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const debounce = (fn, t = 140) => { let id; return () => { clearTimeout(id); id = setTimeout(fn, t); }; };
// ask for a real WebGL2 context once and hand it straight back
const webgl2Works = () => {
  try {
    const gl = d.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
};
const passive = { passive: true };
const PARAMS = new URLSearchParams(location.search);
const FORCE_P = SHOT && PARAMS.has('ab-p') ? clamp(+PARAMS.get('ab-p') || 0, 0, 5) : null;
// review helper (screenshots only): ?shot=1&from=<section-id> drops the sections above it
if (SHOT && PARAMS.has('from')) {
  const from = d.getElementById(PARAMS.get('from'));
  if (from?.parentElement) {
    for (const el of Array.from(from.parentElement.children)) { if (el === from) break; if (el.tagName === 'SECTION') el.remove(); }
    from.classList.add('header-offset');
    from.style.marginTop = '0';
  }
}

let vh = innerHeight;
const measurers = new Set();
const scrollers = new Set();
const frame = () => { const y = scrollY; for (const fn of scrollers) fn(y); };
const measureAll = () => { vh = innerHeight; for (const fn of measurers) fn(); frame(); };
HC.onScroll(frame);
addEventListener('resize', debounce(measureAll), passive);
addEventListener('load', measureAll, { once: true });
d.fonts?.ready?.then(() => measureAll());

/* ================================================================== 1 · THE DOORWAY WINDOW + SARAH'S STORY */
const win = $('[data-window]');
const stage = $('#ab-stage');
const story = $('[data-story]');
if (win && stage && story) {
  const mqPinned = matchMedia('(min-width: 64em) and (min-aspect-ratio: 5/4)');   // keep in step with about.css
  const chapters = $$('[data-chapter]', story);
  const STATES = [['—', 'The bigger picture'], ['01', 'The founder'], ['02', '20+ years'], ['03', 'Scale'], ['04', 'Operational & strategic'], ['05', 'HCLabs']];
  const cap = $('[data-cap]', win), capN = $('[data-cap-n]', win), capT = $('[data-cap-t]', win);
  const trace = $('[data-trace]', win), traceBg = $('[data-trace-bg]', win), traceFg = $('[data-trace-fg]', win);
  let centers = [0], reading = 0.5, p = FORCE_P ?? 0, shown = -1, activeCh = -1, handle = null;

  const traceShape = () => {
    const w = stage.offsetWidth, h = stage.offsetHeight;
    if (!w || !h || !trace) return;
    const pad = 10, o = 6;                          // svg overhang, line offset outside the frame
    const W = w + pad * 2, Hh = h + pad * 2;
    const R = w / 2 + o, cx = pad + w / 2, cy = pad + w / 2;
    const lx = pad - o, rx = pad + w + o, by = pad + h - 1;
    const dpath = `M${lx} ${by}V${Math.min(cy, by)}A${R} ${R} 0 0 1 ${rx} ${Math.min(cy, by)}V${by}`;
    trace.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    traceBg.setAttribute('d', dpath);
    traceFg.setAttribute('d', dpath);
  };

  measurers.add(() => {
    const pinned = mqPinned.matches;
    reading = pinned ? 0.5 : 0.8;
    // state 0 holds until the window is in place: pinned from the start on desktop; stacked, once it reaches its pin
    const winTop = parseFloat(getComputedStyle(win).top) || 0;
    const storyTop = story.getBoundingClientRect().top + scrollY;
    const start = pinned ? 0 : Math.max(0, storyTop - winTop);
    centers = [start + vh * reading];
    for (const ch of chapters) { const r = ch.getBoundingClientRect(); centers.push(r.top + scrollY + r.height / 2); }
    story.classList.toggle('is-live', pinned && !still());
    traceShape();
  });

  const progressAt = (y) => {
    const line = y + vh * reading;
    if (line <= centers[0]) return 0;
    for (let k = 0; k < centers.length - 1; k++) {
      if (line < centers[k + 1]) return k + (line - centers[k]) / Math.max(1, centers[k + 1] - centers[k]);
    }
    return centers.length - 1;
  };

  const render = () => {
    const k = Math.round(p);
    trace?.style.setProperty('--trace', (p / 5).toFixed(4));
    if (k !== shown) {
      shown = k;
      if (capN && capT) {
        capN.textContent = STATES[k][0];
        capT.textContent = STATES[k][1];
        if (!still()) { cap.classList.remove('is-swap'); void cap.offsetWidth; cap.classList.add('is-swap'); }
      }
      if (still()) handle?.invalidate();          // settled frames render the exact chapter pose on change
    }
    const ch = k - 1;
    if (ch !== activeCh) {
      activeCh = ch;
      chapters.forEach((el, i) => el.classList.toggle('is-active', i === ch));
    }
  };

  scrollers.add((y) => {
    if (FORCE_P != null) return render();
    p = clamp(progressAt(y), 0, 5);
    render();
  });

  // 3D: the world inside the doorway (fallback art managed here so it never double-exposes with the live world)
  let fbShown = false;
  const showFallback = () => { if (!fbShown) { fbShown = true; stage.classList.add('fb-on'); } };
  // 3D only where it works and can be smooth: a real WebGL2 context (hasWebGL2() only checks that the API exists, so
  // on blocked / blocklisted GPUs three.js would fail inside the engine with a console error), and not a save-data /
  // ≤2 GB / ≤2-core device (SPEC §1: those keep the static art and never download three.js)
  const webgl = hasWebGL2() && (SHOT || !lowPower()) && webgl2Works();
  // the static art mirrors the opening pose, so at the top of the page it stands in from the first paint and the
  // 3D world cross-fades over it; deeper in the story it only appears if the world is late (no double exposure)
  // (screenshots too, unless a later story state is forced: the art only mirrors the opening pose)
  if (!webgl || (scrollY < innerHeight * 0.3 && !FORCE_P)) showFallback();
  else if (!SHOT) setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(); }, 2400);
  let wasLive = false;
  new MutationObserver(() => {
    const st = stage.getAttribute('data-3d');
    if (st === 'live') wasLive = true;
    else if (st === 'fallback' || wasLive) showFallback();
  }).observe(stage, { attributes: true, attributeFilter: ['data-3d'] });

  // when the static art is playing its own entrance, the live world waits for it to settle (it then matches the art's
  // pose, so the cut reads as the picture coming alive, not a double exposure). Released early by a scroll (the pose
  // is about to change anyway), and never held longer than 3.2s.
  const artSettled = () => new Promise((done) => {
    if (!fbShown || SHOT || HC.reduced() || scrollY > 40) return done();
    // the longest entrance animations (line, rim); already finished (e.g. a bfcache rebuild) → no wait
    const running = $$('.abf-line, .abf-rim', stage).flatMap((el) => el.getAnimations?.() || []).filter((a) => a.playState !== 'finished');
    if (!running.length) return done();
    let t = 0, over = false;
    const finish = () => { if (over) return; over = true; clearTimeout(t); removeEventListener('scroll', onScroll); done(); };
    const onScroll = () => { if (scrollY > 40) finish(); };
    t = setTimeout(finish, 3200);
    Promise.all(running.map((a) => a.finished)).then(finish, finish);
    addEventListener('scroll', onScroll, passive);
  });

  if (webgl) {
    handle = mount(stage, () => Promise.all([import('/assets/js/3d/scenes/about.js'), artSettled()]).then(([m]) => m), {
      eager: true,
      fallback: '[data-3d-fallback]',              // the engine keeps the art opaque underneath until the canvas is, then cuts
      fadeMs: 500,
      scrollTarget: story,
      // reduced motion never shows an in-between pose: the chapter state only
      sceneOptions: {
        get progress() { return still() && FORCE_P == null ? Math.round(p) : p; },
        get intro() { return !fbShown; },         // the static art already stands in: cross-fade to the settled pose
      },
    });
    addEventListener('hc:pt-leave', () => handle.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) handle.resume(); }, passive);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(debounce(traceShape, 60)).observe(stage);
  mqPinned.addEventListener?.('change', measureAll);
}

/* ================================================================== 2 · EXPERIENCE — the line */
const lineBox = $('[data-line]');
if (lineBox) {
  const svg = $('.ab-line__svg', lineBox);
  const track = $('[data-line-track]', lineBox);
  const draw = $('[data-line-draw]', lineBox);
  const stations = $$('[data-station]', lineBox);
  const dots = stations.map((s) => $('[data-dot]', s));
  const NS = 'http://www.w3.org/2000/svg';
  const tip = d.createElementNS(NS, 'circle');
  tip.setAttribute('class', 'ab-line__tip');
  tip.setAttribute('r', '4.5');
  svg.append(tip);
  const SAMPLES = 240;
  const sx = new Float32Array(SAMPLES + 1), sy = new Float32Array(SAMPLES + 1);
  let frac = [], horiz = false, top = 0, h = 1, lastDraw = -1, lit = -1;

  // smooth path through the points (centripetal-ish Catmull-Rom → cubic Béziers)
  const pathThrough = (pts) => {
    let s = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      s += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return s;
  };

  const build = () => {
    const box = lineBox.getBoundingClientRect();
    const W = box.width, Hh = box.height;
    const pts = dots.map((el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]; });
    if (pts.length < 2 || !W) return;
    horiz = Math.abs(pts[1][0] - pts[0][0]) > Math.abs(pts[1][1] - pts[0][1]);
    let all;
    if (horiz) {
      // the brand's line runs edge to edge: enter low from the left, leave rising to the right
      const gx = Math.max(24, (innerWidth - W) / 2);
      all = [[-gx, pts[0][1] + 70], ...pts, [W + gx, pts[pts.length - 1][1] - 60]];
    } else {
      // a gentle sway between the stations
      all = [[pts[0][0], pts[0][1] - 44]];
      pts.forEach((pt, i) => {
        all.push(pt);
        const nx = pts[i + 1];
        if (nx) all.push([pt[0] + (i % 2 ? 9 : -9), (pt[1] + nx[1]) / 2]);
      });
      const last = pts[pts.length - 1];
      all.push([last[0], last[1] + 70]);
    }
    const dpath = pathThrough(all);
    svg.setAttribute('viewBox', `0 0 ${W.toFixed(1)} ${Hh.toFixed(1)}`);
    track.setAttribute('d', dpath);
    draw.setAttribute('d', dpath);
    const L = track.getTotalLength();
    for (let k = 0; k <= SAMPLES; k++) { const pt = track.getPointAtLength((k / SAMPLES) * L); sx[k] = pt.x; sy[k] = pt.y; }
    frac = pts.map(([x, y]) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k <= SAMPLES; k++) { const dd = (sx[k] - x) ** 2 + (sy[k] - y) ** 2; if (dd < bd) { bd = dd; best = k; } }
      return best / SAMPLES;
    });
    top = box.top + scrollY; h = Hh;
    lastDraw = -1;
  };

  const setDraw = (v) => {
    if (Math.abs(v - lastDraw) < 0.0008) return;
    lastDraw = v;
    svg.style.setProperty('--draw', v.toFixed(4));
    const k = Math.min(SAMPLES, Math.round(v * SAMPLES));
    tip.setAttribute('cx', sx[k].toFixed(1));
    tip.setAttribute('cy', sy[k].toFixed(1));
    tip.style.opacity = v > 0.004 && v < 0.996 ? '1' : '0';
    let n = -1;
    for (let i = 0; i < frac.length; i++) if (v >= frac[i] - 0.004) n = i;
    if (n !== lit) { lit = n; stations.forEach((s, i) => s.classList.toggle('is-lit', i <= n)); }
  };

  measurers.add(build);
  if (still()) {
    measurers.add(() => setDraw(1));
  } else {
    lineBox.classList.add('is-live');
    scrollers.add((y) => {
      const rel = top - y;                                   // line box top relative to the viewport
      if (rel > vh * 1.2 || rel + h < -vh * 0.5) return;
      let v;
      if (horiz) v = clamp((vh * 0.88 - rel) / (vh * 0.72));
      else {
        // vertical: the tip follows a reading line 72% down the viewport
        const ty = vh * 0.72 - rel;
        if (ty <= sy[0]) v = 0;
        else if (ty >= sy[SAMPLES]) v = 1;
        else { let k = 0; while (k < SAMPLES && sy[k + 1] < ty) k++; v = (k + (ty - sy[k]) / Math.max(0.001, sy[k + 1] - sy[k])) / SAMPLES; }
      }
      setDraw(v);
    });
  }
}

measureAll();
