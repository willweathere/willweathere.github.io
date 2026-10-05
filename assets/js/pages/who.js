/* HCLabs — Who it's for (/who-its-for/).
   Hero: four doorways (3D world aligned to the four links, static SVG twin as fallback); hover/focus of a link
   plays that doorway's small story in both. Chapters: one scroll-linked motion each —
   01 the Starter Pack documents stack up as foundations and the doorway stands on them
   02 the team grows tier by tier, held up by arches, and is finally framed by one doorway
   03 the page is scanned for gaps, the gaps are filled, the page is signed off
   04 a tangled line between two people resolves into the brand's arch
   Transform/opacity/stroke only; scroll work joins the shared HC scroll frame; ?shot=1 and reduced motion get the
   settled, complete states. Review helper (screenshots only): ?who-p=0..1 renders every chapter at that progress. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2 } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const outBack = (t) => { if (t <= 0) return 0; if (t >= 1) return 1; const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const debounce = (fn, t = 140) => { let id; return () => { clearTimeout(id); id = setTimeout(fn, t); }; };
const passive = { passive: true };
const docTop = (el) => el.getBoundingClientRect().top + scrollY;
const PARAMS = new URLSearchParams(location.search);
const FORCE_P = SHOT && PARAMS.has('who-p') ? clamp(+PARAMS.get('who-p') || 0) : null;
if (SHOT && innerHeight > 1500) d.documentElement.classList.add('shot-tall');
if (SHOT && PARAMS.has('scroll')) addEventListener('load', () => { scrollTo(0, +PARAMS.get('scroll') || 0); setTimeout(() => measureAll(), 50); }, { once: true });
if (SHOT && PARAMS.has('from')) {           // ?from=<section-id>: drop the sections above it (screenshots of deep sections)
  const target = d.getElementById(PARAMS.get('from'));
  if (target) {
    for (const s of $$('main > section')) { if (s === target) break; s.hidden = true; }
    target.style.marginTop = '0';
    target.style.paddingTop = `calc(var(--header-h) + ${getComputedStyle(target).paddingTop})`;
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

/** Drive `set(p)` (0..1) by the element's passage through the viewport; settled states get p = 1. */
function scrub(el, set, { start = 1, span = 0.62 } = {}) {
  if (!el) return;
  if (FORCE_P !== null) { set(FORCE_P); return; }
  if (still()) { set(1); return; }
  let top = 0, h = 1, last = -1;
  // on desktop the illustration is pinned (position: sticky), which moves its box while it is stuck: measure it
  // unpinned for a moment so the story is always driven by its natural place in the page (measured rarely: load,
  // resize, fonts)
  const pin = el.closest('.who-ch__visual');
  measurers.add(() => {
    const prev = pin ? pin.style.position : '';
    if (pin) pin.style.position = 'static';
    top = docTop(el); h = el.offsetHeight;
    if (pin) pin.style.position = prev;
  });
  scrollers.add((y) => {
    const rel = top - y;
    if (rel > vh * 1.1 || rel + h < -vh * 0.5) return;
    const p = clamp((vh * start - rel) / (vh * span + h * 0.35));
    if (Math.abs(p - last) < 0.0015) return;
    last = p;
    set(p);
  });
  set(0);
}

/* ================================================================== HERO · four doorways */
const hero = $('.who-hero');
const stage = $('#who-stage');
if (hero && stage) {
  const doors = $$('.who-door', hero);
  const spaces = doors.map((a) => $('.who-door__space', a));
  const discEl = $('[data-disc]', hero);
  let api = null;

  // fallback art choreography (as on the homepage hero): hidden while the world is expected, shown with its own
  // entrance only if it is late or unavailable, cut the moment the world is live
  let fbShown = false, wasLive = false;
  const showFallback = (animate) => {
    hero.classList.add('fb-on');
    if (fbShown) return;
    fbShown = true;
    if (animate) hero.classList.add('is-fb-in');
  };
  const webgl = hasWebGL2();
  // screenshots / reduced motion: the finished static art at once; it is cut (no transition in shot mode) the moment
  // the world is live, so a slow software renderer can never leave the doorways blank
  if (still()) showFallback(false);
  else if (!webgl) showFallback(true);
  else setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(true); }, 2200);
  // the engine marks the stage live as its canvas STARTS fading in; the static art sits above the canvas, so it only
  // begins its own fade once the canvas is fully in (a cross-dissolve between the two, never a dip to bare navy)
  const FADE = 650;
  let liveTimer = 0;
  new MutationObserver(() => {
    const st = stage.getAttribute('data-3d');
    clearTimeout(liveTimer);
    if (st === 'live') {
      wasLive = true;
      liveTimer = setTimeout(() => { if (stage.getAttribute('data-3d') === 'live') hero.classList.add('is-live'); }, still() ? 0 : FADE + 120);
    } else {
      hero.classList.remove('is-live');
      if (st === 'fallback' || wasLive) showFallback(!still() && !wasLive);
    }
  }).observe(stage, { attributes: true, attributeFilter: ['data-3d'] });

  // hover / focus: the doorway plays its story (CSS for the static art, api for the world)
  let focus = -1;
  const setFocus = (i) => {
    if (focus === i) return;
    focus = i;
    doors.forEach((a, k) => a.classList.toggle('is-on', k === i));
    api?.setFocus(i);
  };
  doors.forEach((a, i) => {
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setFocus(i); }, passive);
    a.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && focus === i) setFocus(-1); }, passive);
    a.addEventListener('focus', () => setFocus(i));
    a.addEventListener('blur', () => { if (focus === i) setFocus(-1); });
  });

  if (webgl) {
    // the world is laid out from the DOM: each doorway sits in its link's door space, the disc where the CSS disc is
    const anchors = () => {
      const sr = stage.getBoundingClientRect();
      return spaces.map((s) => {
        const r = s.getBoundingClientRect();
        return { cx: r.left + r.width / 2 - sr.left, top: r.top - sr.top, bottom: r.bottom - sr.top };
      });
    };
    const disc = () => {
      if (!discEl) return null;
      const r = discEl.getBoundingClientRect();
      if (!r.width) return null;
      const sr = stage.getBoundingClientRect();
      return { cx: r.left + r.width / 2 - sr.left, cy: r.top + r.height / 2 - sr.top, r: r.width / 2 };
    };
    const world = mount(stage, () => import('/assets/js/3d/scenes/who.js'), {
      eager: true,
      fallback: null,
      fadeMs: FADE,
      scrollTarget: hero,
      sceneOptions: { anchors, disc, get intro() { return !fbShown; } },
    });
    world.ready.then((a) => { api = a; if (api && focus >= 0) api.setFocus(focus); });
    const relayout = debounce(() => api?.relayout?.(), 60);
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(relayout);
      ro.observe($('.who-hero__copy', hero));
      ro.observe($('.who-doors', hero));
    }
    d.fonts?.ready?.then(relayout);
    addEventListener('load', relayout, { once: true });
    addEventListener('hc:pt-leave', () => world.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) world.resume(); }, passive);
  }
}

/* ================================================================== 01 · the foundations */
const found = $('[data-found]');
if (found) {
  const slabs = $$('.found__slab', found);            // DOM order 01…07; 01 is the bottom of the stack
  const frameEl = $('.found__frame', found);
  const walker = $('.found__walker', found);
  const N = slabs.length;
  scrub(found, (p) => {
    for (let i = 0; i < N; i++) {
      const g = smooth(clamp((p - i * 0.07) / 0.26));
      const side = i % 2 ? 1 : -1;
      const el = slabs[i];
      if (g >= 1) { if (el.style.transform) { el.style.transform = ''; el.style.opacity = ''; } continue; }
      el.style.transform = `translate3d(${(side * (1 - g) * 34).toFixed(2)}%, ${(-(1 - g) * 26).toFixed(1)}px, 0) rotate(${(side * (1 - g) * 3).toFixed(2)}deg)`;
      el.style.opacity = clamp(g * 1.6).toFixed(3);
    }
    // the doorway is built up from the top document (it grows from its base; only its first instant fades)
    const gd = clamp((p - 0.54) / 0.22);
    frameEl.style.transform = gd >= 1 ? '' : `scaleY(${Math.max(0.001, outBack(gd)).toFixed(3)})`;
    frameEl.style.opacity = clamp(gd * 8).toFixed(3);
    const gw = clamp((p - 0.72) / 0.22);
    walker.style.transform = gw >= 1 ? '' : `translateX(${(-(1 - inOut(gw)) * 34).toFixed(2)}px)`;
    walker.style.opacity = clamp(gw * 2.5).toFixed(3);
  }, { span: 0.7 });
  // keyboard: a document that is still arriving shows itself when focused
  slabs.forEach((li) => li.addEventListener('focusin', () => { li.style.transform = ''; li.style.opacity = ''; }));
}

/* ================================================================== 02 · the team grows */
const team = $('[data-team]');
if (team) {
  const tier = (n) => $$(`.team__p--${n}`, team);
  const p0 = tier(0), p1 = tier(1), p2 = tier(2);
  const a1 = $$('.team__arch--1, .team__arch--1s', team), a2 = $$('.team__arch--2', team);
  const ring = $('.team__ring', team), dot = $('.team__dot', team);
  const pop = (el, v) => { el.style.setProperty('--s', Math.max(0.001, outBack(v)).toFixed(3)); el.style.setProperty('--o', clamp(v * 3).toFixed(3)); };
  const draw = (el, v) => el.style.setProperty('--off', (1 - inOut(clamp(v))).toFixed(4));
  scrub(team, (p) => {
    p0.forEach((el) => pop(el, clamp(p / 0.1)));
    a1.forEach((el, i) => draw(el, (p - 0.08 - i * 0.06) / 0.16));
    p1.forEach((el, i) => pop(el, clamp((p - 0.22 - i * 0.05) / 0.14)));
    a2.forEach((el, i) => draw(el, (p - 0.4 - i * 0.05) / 0.16));
    p2.forEach((el, i) => pop(el, clamp((p - 0.54 - i * 0.035) / 0.13)));
    draw(ring, (p - 0.74) / 0.2);
    dot.style.setProperty('--s', Math.max(0.001, outBack(clamp((p - 0.9) / 0.09))).toFixed(3));
  }, { span: 0.72 });
}

/* ================================================================== 03 · the gaps are found, then filled */
const docs = $('[data-docs]');
if (docs) {
  const gaps = $$('.docs__gap', docs).map((g) => ({ el: g, y: +g.dataset.y }));
  const scan = $('.docs__scan', docs);
  const seal = $('.docs__seal', docs);
  scrub(docs, (p) => {
    const sp = clamp((p - 0.04) / 0.5);
    const sy = lerp(126, 352, inOut(sp));
    scan.style.setProperty('--scan-y', `${sy.toFixed(1)}px`);
    scan.style.setProperty('--scan-o', (sp <= 0 ? 0 : sp >= 1 ? clamp(1 - (p - 0.54) / 0.06) : 1).toFixed(3));
    gaps.forEach((g, i) => {
      const found = clamp((sy - g.y + 6) / 18);
      const fill = clamp((p - 0.6 - i * 0.07) / 0.16);
      g.el.style.setProperty('--found', (found * (1 - inOut(fill) * 0.9)).toFixed(3));
      g.el.style.setProperty('--mark', Math.max(0.001, outBack(found) * (1 - inOut(fill) * 0.35)).toFixed(3));
      g.el.style.setProperty('--fill', inOut(fill).toFixed(4));
    });
    seal.style.setProperty('--seal', Math.max(0.001, outBack(clamp((p - 0.86) / 0.1))).toFixed(3));
    docs.classList.toggle('is-done', p > 0.84);
  }, { span: 0.75 });
}

/* ================================================================== 04 · the tangle resolves */
const knot = $('[data-knot]');
if (knot) {
  const path = $('[data-knot-line]', knot);
  const dot = $('.knot__dot', knot);
  const opening = $('.knot__opening', knot);
  // six cubic segments. Resolved: the doorway arch (legs rise from above each head, a semicircle over the top).
  const C = [200, 222], R = 90, H = 4 / 3 * Math.tan(Math.PI / 16) * R;
  const P = (deg) => { const a = (deg * Math.PI) / 180; return [C[0] + R * Math.cos(a), C[1] - R * Math.sin(a)]; };
  const T = (deg) => { const a = (deg * Math.PI) / 180; return [Math.sin(a), Math.cos(a)]; };
  const arcSeg = (d0, d1) => { const p0 = P(d0), p1 = P(d1), t0 = T(d0), t1 = T(d1); return [p0[0] + H * t0[0], p0[1] + H * t0[1], p1[0] - H * t1[0], p1[1] - H * t1[1], p1[0], p1[1]]; };
  const smoothPath = [
    110, 262,
    110, 248.7, 110, 235.3, 110, 222,
    ...arcSeg(180, 135), ...arcSeg(135, 90), ...arcSeg(90, 45), ...arcSeg(45, 0),
    290, 235.3, 290, 248.7, 290, 262,
  ];
  // tangled: the same six segments, knotted into loops between the two people
  const tangled = [
    110, 262,
    196, 250, 88, 176, 150, 204,
    214, 232, 118, 262, 176, 214,
    246, 156, 248, 262, 206, 222,
    160, 184, 300, 176, 238, 214,
    176, 250, 300, 262, 262, 206,
    232, 160, 318, 200, 290, 262,
  ];
  const n = smoothPath.length;
  const cur = new Float32Array(n);
  const write = () => {
    let s = `M${cur[0].toFixed(1)} ${cur[1].toFixed(1)}`;
    for (let i = 2; i < n; i += 6) s += `C${cur[i].toFixed(1)} ${cur[i + 1].toFixed(1)} ${cur[i + 2].toFixed(1)} ${cur[i + 3].toFixed(1)} ${cur[i + 4].toFixed(1)} ${cur[i + 5].toFixed(1)}`;
    path.setAttribute('d', s);
  };
  scrub(knot, (p) => {
    for (let i = 0; i < n; i++) {
      const segI = i < 2 ? 0 : Math.floor((i - 2) / 6);
      const mid = Math.abs(segI - 2.5) / 2.5;                   // the ends straighten first, the middle last
      const t = inOut(clamp((p - 0.08 - (1 - mid) * 0.14) / 0.55));
      cur[i] = lerp(tangled[i], smoothPath[i], t);
    }
    write();
    dot.style.setProperty('--dot', Math.max(0.001, outBack(clamp((p - 0.8) / 0.14))).toFixed(3));
    opening?.style.setProperty('--door', smooth(clamp((p - 0.66) / 0.26)).toFixed(3));
  }, { span: 0.7 });
}

/* ================================================================== pointer depth
   Each illustration window leans a little toward the cursor, its layers move at different depths (CSS reads
   --mx/--my, −1..1) and a soft light follows. Mouse/trackpad with motion allowed only; eased in one rAF that stops
   as soon as it settles. */
{
  const boxes = [found, team, docs, knot].filter(Boolean);
  const live = [];
  for (const box of boxes) {
    const s = { box, r: null, tx: 0, ty: 0, x: 0, y: 0, raf: 0 };
    const tick = () => {
      s.x += (s.tx - s.x) * 0.12; s.y += (s.ty - s.y) * 0.12;
      const done = Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) < 0.002;
      if (done) { s.x = s.tx; s.y = s.ty; }
      box.style.setProperty('--mx', s.x.toFixed(3));
      box.style.setProperty('--my', s.y.toFixed(3));
      s.raf = done ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => { s.raf ||= requestAnimationFrame(tick); };
    box.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !HC.fine()) return;
      s.r = box.getBoundingClientRect();
      box.classList.add('is-near');
    }, passive);
    box.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !HC.fine()) return;
      s.r ||= box.getBoundingClientRect();
      s.tx = clamp(((e.clientX - s.r.left) / s.r.width) * 2 - 1, -1, 1);
      s.ty = clamp(((e.clientY - s.r.top) / s.r.height) * 2 - 1, -1, 1);
      kick();
    }, passive);
    box.addEventListener('pointerleave', () => { s.r = null; s.tx = 0; s.ty = 0; box.classList.remove('is-near'); kick(); }, passive);
    live.push(s);
  }
  if (live.length) HC.onScroll(() => { for (const s of live) s.r = null; });
}

/* ================================================================== related links → the illustration answers */
const VIS = { team, docs, knot };
for (const list of $$('[data-links]')) {
  const vis = VIS[list.dataset.links];
  if (!vis) continue;
  for (const a of $$('a', list)) {
    const cls = a.dataset.hint ? `hint-${a.dataset.hint}` : 'hint';
    const on = () => vis.classList.add(cls);
    const off = () => vis.classList.remove(cls);
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); }, passive);
    a.addEventListener('pointerleave', off, passive);
    a.addEventListener('focus', on);
    a.addEventListener('blur', off);
  }
}

measureAll();
