/* HCLabs — homepage behaviour.
   1 hero 3D world (the static composition paints first; the live world cross-cuts over it) · 2 experience doorways
   rising · 3 the challenge sentence lighting up · 5 HR Starter Pack CSS-3D stack (pinned, scroll + hover/focus)
   6 services orbit (CSS-3D doorway tiles) · 7 pricing ground line · 8 the open door (3D, shares the hero's renderer)
   One primary motion per section; everything is transform/opacity, scroll work joins the shared HC scroll frame (the
   position is captured in the scroll event, never re-read inside rAF), loops only run while their section is on
   screen. ?shot=1 and reduced motion get settled, composed states; reduced motion, no WebGL and low-power devices keep
   the static art (no three.js download at all). */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const debounce = (fn, t = 140) => { let id; return () => { clearTimeout(id); id = setTimeout(fn, t); }; };
const passive = { passive: true };
const curY = () => (HC.scrollY ? HC.scrollY() : scrollY);
const docTop = (el) => el.getBoundingClientRect().top + scrollY;   // measure passes only (resize / load), never in rAF

/* navigate like a real link click, so the page transition runs (and modified clicks keep working natively) */
function go(href, x, y) {
  const a = d.createElement('a');
  a.href = href;
  a.hidden = true;
  d.body.append(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, detail: 1, clientX: x ?? innerWidth / 2, clientY: y ?? innerHeight / 2 }));
  a.remove();
}

/* review helpers (screenshots only): ?shot=1 in a very tall window unpins the pack; ?scroll=N scrolls after load;
   ?pack=A shows the document stack at presentation state A (0.5 = first document out … 6.5 = last);
   ?from=<section-id> drops the sections above it */
const PARAMS = new URLSearchParams(location.search);
if (SHOT && innerHeight > 1500) d.documentElement.classList.add('shot-tall');
if (SHOT && PARAMS.has('scroll')) addEventListener('load', () => { scrollTo(0, +PARAMS.get('scroll') || 0); setTimeout(() => { measureAll(); }, 50); }, { once: true });
const PACK_A = SHOT && PARAMS.has('pack') ? +PARAMS.get('pack') : 0.5;
if (SHOT && PARAMS.has('from')) {
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
const frame = (y = curY()) => { for (const fn of scrollers) fn(y); };
const measureAll = () => { vh = innerHeight; for (const fn of measurers) fn(); frame(scrollY); };
HC.onScroll(frame);
addEventListener('resize', debounce(measureAll), passive);
addEventListener('load', measureAll, { once: true });
d.fonts?.ready?.then(() => measureAll());

// 3D only where it can be smooth: WebGL2, motion allowed, and not a save-data / ≤2 GB / ≤2-core device
const CAN_3D = hasWebGL2() && (SHOT || (!HC.reduced() && !lowPower()));

/* ================================================================== 1 · HERO */
const heroStage = $('#hero-stage');
let hero = null;
if (heroStage) {
  // phones + portrait tablets: the world is a band above the headline (home.css), framed from the top
  const stacked = matchMedia('(max-width: 47.99em), (max-aspect-ratio: 4/5)');
  const focus = () => (stacked.matches ? 'top' : 'right');

  // scroll-away (desktop only): the copy drifts up a little slower than the page and only fades once the buttons have
  // passed under the header, so the calls to action never look disabled while they are still on screen
  const heroInner = $('.home-hero__inner');
  if (heroInner && !still()) {
    let lastK = -1;
    scrollers.add((y) => {
      if (stacked.matches) { if (lastK !== 0) { lastK = 0; heroInner.style.transform = ''; heroInner.style.opacity = ''; } return; }
      if (y > vh * 1.2 && lastK === 1) return;
      const p = clamp(y / vh);
      const k = p >= 1 ? 1 : Math.round(p * 400) / 400;
      if (k === lastK) return;
      lastK = k;
      heroInner.style.transform = p > 0 ? `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0)` : '';
      const o = 1 - smooth(clamp((p - 0.62) / 0.33)) * 0.85;
      heroInner.style.opacity = o >= 0.999 ? '' : o.toFixed(3);
    });
  }

  if (CAN_3D) {
    hero = mount(heroStage, () => import('/assets/js/3d/scenes/home-hero.js'), {
      eager: true,                         // idle time after load: never competes with first paint / the headline
      share: 'home',                       // one renderer + canvas for the hero and the consultation door
      fallback: '.home-hero__fallback',    // the static composition stays underneath until the world is opaque
      fadeMs: 480,
      scrollTarget: $('.home-hero'),
      sceneOptions: {
        focus: focus(), avoid: '.home-hero__copy', floor: '.home-exp',
        // the static composition has already played its entrance: the world arrives settled (a cross-cut between two
        // matching compositions), except for the ?intro-t review helper
        intro: SHOT && PARAMS.has('intro-t'),
      },
    });
    stacked.addEventListener?.('change', () => hero.api?.setFocus(focus()));
    addEventListener('hc:pt-leave', () => hero.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) hero.resume(); }, passive);

    // the floating Starter Pack documents are links: pointer over one → it lifts and the cursor says so; click → its page
    let hot = null;
    heroStage.addEventListener('hc3d:panel-hover', (e) => {
      hot = e.detail?.href || null;
      heroStage.classList.toggle('is-pointing', !!hot);
    });
    heroStage.addEventListener('click', (e) => {
      let href = hot;
      if (!href && e.pointerType !== 'mouse') href = hero.api?.pickAt?.(e.clientX, e.clientY)?.href || null;   // taps
      if (href) go(href, e.clientX, e.clientY);
    });
  }
}

/* ================================================================== 2 · EXPERIENCE — doorways rise from small to large */
const scaleRow = $('[data-scale]');
if (scaleRow) {
  const doors = $$('.home-scale__door', scaleRow);
  const ground = $('.home-scale__ground', scaleRow);
  let top = 0, h = 1, last = -1;
  const set = (p) => {
    if (Math.abs(p - last) < 0.002) return;
    last = p;
    ground.style.transform = `scaleX(${smooth(clamp(p / 0.55)).toFixed(4)})`;
    doors.forEach((el, i) => {
      const g = smooth(clamp((p - 0.08 - i * 0.085) / 0.36));
      el.style.transform = g >= 1 ? '' : `translate3d(0, ${((1 - g) * 104).toFixed(2)}%, 0)`;
    });
  };
  if (still()) set(1);
  else {
    measurers.add(() => { top = docTop(scaleRow); h = scaleRow.offsetHeight; });
    scrollers.add((y) => {
      const rel = top - y;                      // row top relative to viewport top
      if (rel > vh + 100 || rel + h < -200) return;
      set(clamp((vh - rel) / (vh * 0.62 + h * 0.3)));
    });
  }
}

/* ================================================================== 3 · THE CHALLENGE — the sentence lights up as you read */
const lit = $('[data-lit]');
if (lit) {
  const words = [];
  const wrap = (node) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const frag = d.createDocumentFragment();
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const s = d.createElement('span');
          s.className = 'w';
          s.textContent = part;
          frag.append(s);
          words.push(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1) wrap(n);
    }
  };
  if (!still()) {
    wrap(lit);
    const hls = $$('.hl', lit).map((el) => ({ el, idx: $$('.w', el).map((w) => words.indexOf(w)), last: -1 }));
    const pos = new Float32Array(words.length);   // per-word start offset (px from block top, stepped across the line)
    const val = new Float32Array(words.length).fill(-1);
    let top = 0, h = 1, lineH = 40;
    measurers.add(() => {
      top = docTop(lit); h = lit.offsetHeight;
      const w0 = lit.offsetWidth || 1;
      lineH = parseFloat(getComputedStyle(lit).lineHeight) || 40;
      words.forEach((w, i) => { pos[i] = w.offsetTop + (w.offsetLeft / w0) * lineH * 1.6; });
    });
    // unread words rest at 40% (≈3:1 on cream): the sentence is always legible, reading only brings it to full ink
    const OFF = 0.4;
    scrollers.add((y) => {
      const rel = top - y;
      if (rel > vh + 50 || rel + h < -vh) return;
      const read = vh * 0.66 - rel;               // how far the reading line has travelled into the block
      for (let i = 0; i < words.length; i++) {
        const v = clamp((read - pos[i]) / (lineH * 1.5));
        if (Math.abs(v - val[i]) > 0.01) { val[i] = v; words[i].style.opacity = (OFF + (1 - OFF) * v).toFixed(3); }
      }
      for (const hl of hls) {
        let m = 1;
        for (const i of hl.idx) m = Math.min(m, val[i]);
        if (Math.abs(m - hl.last) > 0.01) { hl.last = m; hl.el.style.setProperty('--u', `${(smooth(m) * 100).toFixed(1)}%`); }
      }
    });
  } else {
    $$('.hl', lit).forEach((el) => el.style.setProperty('--u', '100%'));
  }
}

/* ================================================================== 5 · HR STARTER PACK — CSS-3D stack */
const track = $('[data-pack-track]');
const packStage = $('[data-pack-stage]');
if (track && packStage) {
  const docs = $$('.pdoc', packStage);
  const cards = docs.map((li) => $('.pdoc__card', li));
  const sheens = docs.map((li) => $('.pdoc__sheen', li));
  const shadows = docs.map((li) => $('.pdoc__shadow', li));
  const lastPull = new Float32Array(docs.length).fill(-1);
  const index = $$('[data-pack-index] a');
  const N = docs.length;
  const mqPin = matchMedia('(min-width: 64em) and (min-height: 45em)');   // keep in step with home.css
  // pinned content never moves, so the lower half of the copy (index, actions) can sit below the reveal threshold for
  // the whole pin: reveal it as the pin begins instead of waiting for the section to scroll away
  const late = $$('.home-pack__copy > [data-reveal], .home-pack__side [data-reveal]');
  let lateDone = still();
  const jitter = [-0.8, 0.9, -0.5, 1.1, -1.2, 0.6, -0.9];
  let dw = 200, step = 50, trackTop = 0, trackH = 1, stageTop = 0, stageH = 1;
  const cur = { open: 1, a: 0.5 }, tgt = { open: 1, a: 0.5 };
  let hover = -1, active = -1, running = false, lastT = 0, scrollA = 0.5, scrollOpen = 1;

  const layout = () => {
    const open = cur.open, a = cur.a;
    const px = dw * 1.08, py = -(N - 1) * step * open * 0.46, pz = 96;
    let best = 0, front = -1;
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(a - (i + 0.5));
      const pull = smooth(clamp((0.56 - dist) / 0.3));   // near-sequential: one document returns as the next leaves
      const cy = -i * (step * open + 1.6 * (1 - open));
      const cz = -i * (16 * open + 2.6 * (1 - open));
      const rz = (1 - open) * jitter[i];
      const x = pull * px;
      const y = lerp(cy, py, pull);
      const z = lerp(cz, pz, pull);
      const ry = pull * 17;
      const r2 = lerp(rz, 1.2, pull);
      docs[i].style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${r2.toFixed(2)}deg)`;
      // the light and the paper-layer shadow follow the presented document — composited transform/opacity writes only
      if (Math.abs(pull - lastPull[i]) > 0.002) {
        lastPull[i] = pull;
        if (sheens[i]) {
          sheens[i].style.transform = `translate3d(${(-34 * pull).toFixed(2)}%, 0, 0)`;
          sheens[i].style.opacity = (pull * 0.9).toFixed(3);
        }
        if (shadows[i]) {
          shadows[i].style.transform = `translate3d(${(pull * 14).toFixed(1)}px, ${(pull * 18).toFixed(1)}px, -2px) scale(${(1 + pull * 0.08).toFixed(3)})`;
          shadows[i].style.opacity = (0.75 + pull * 0.25).toFixed(3);
        }
      }
      if (pull > best) { best = pull; front = i; }
    }
    const act = best > 0.35 ? front : -1;
    if (act !== active) {
      active = act;
      index.forEach((el, i) => el.classList.toggle('is-active', i === act));
    }
  };

  const tick = (t) => {
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 1 / 60);
    lastT = t;
    const k = 1 - Math.exp(-dt * 7.5);
    cur.open += (tgt.open - cur.open) * k;
    cur.a += (tgt.a - cur.a) * k;
    const done = Math.abs(tgt.open - cur.open) < 0.001 && Math.abs(tgt.a - cur.a) < 0.001;
    if (done) { cur.open = tgt.open; cur.a = tgt.a; }
    layout();
    if (done) { running = false; lastT = 0; } else requestAnimationFrame(tick);
  };
  const kick = () => {
    if (still()) { cur.open = tgt.open; cur.a = tgt.a; layout(); return; }
    if (!running) { running = true; lastT = 0; requestAnimationFrame(tick); }
  };
  // scroll detents: each document holds the stage for most of its share of the scroll, so wherever the reader stops
  // one document is cleanly presented (never two half-drawn titles overlapping)
  const detent = (a) => { const v = a - 0.5, k = Math.floor(v), f = v - k; return k + smooth(clamp((f - 0.3) / 0.4)) + 0.5; };
  const retarget = () => {
    tgt.open = scrollOpen;
    tgt.a = hover >= 0 ? hover + 0.5 : detent(scrollA);
    kick();
  };

  measurers.add(() => {
    dw = cards[0].offsetWidth || 200;
    step = dw * 0.25;                          // = --step in home.css
    trackTop = docTop(track); trackH = track.offsetHeight;
    stageTop = docTop(packStage); stageH = packStage.offsetHeight;
  });

  if (still()) {
    // settled composition: the open cascade with the first document presented
    scrollA = 0.5; scrollOpen = 1;
    measurers.add(() => { tgt.open = cur.open = 1; tgt.a = cur.a = hover >= 0 ? hover + 0.5 : PACK_A; layout(); });
  } else {
    scrollers.add((y) => {
      const pinned = mqPin.matches;
      if (pinned) {
        const rel = trackTop - y;
        if (rel > vh * 1.2 || rel + trackH < -vh * 0.2) return;
        if (!lateDone && rel < vh * 0.3) { lateDone = true; late.forEach((el, i) => HC.reveal(el, i)); }
        scrollOpen = smooth(clamp(1 - (rel - vh * 0.05) / (vh * 0.7)));
        const p = clamp(-rel / Math.max(1, trackH - vh));
        scrollA = -0.3 + p * 7.6;
      } else {
        const rel = stageTop - y;
        if (rel > vh * 1.2 || rel + stageH < -vh * 0.2) return;
        scrollOpen = smooth(clamp((vh * 0.98 - rel) / (vh * 0.4)));
        const p = clamp((vh * 0.7 - rel) / (stageH + vh * 0.2));
        scrollA = -0.3 + p * 7.6;
      }
      retarget();
    });
  }

  // hover / focus from the accessible index (and pointer over a document) presents that document
  const setHover = (i) => { if (hover === i) return; hover = i; retarget(); };
  index.forEach((a, i) => {
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setHover(i); }, passive);
    a.addEventListener('focus', () => setHover(i));
    a.addEventListener('blur', () => setHover(-1));
  });
  $('[data-pack-index]')?.addEventListener('pointerleave', () => setHover(-1), passive);
  // pointer over a document: mirror it in the index (the documents themselves only lift, so nothing moves out from under the pointer)
  cards.forEach((c, i) => {
    c.addEventListener('pointerenter', () => index[i]?.classList.add('is-hot'), passive);
    c.addEventListener('pointerleave', () => index[i]?.classList.remove('is-hot'), passive);
  });
  layout();
}

/* ================================================================== 6 · SERVICES — orbit of doorway tiles */
const orbit = $('[data-orbit]');
if (orbit) {
  const ring = $('.orbit__ring', orbit);
  const nodes = $$('.orbit__node', orbit);
  const spokeG = $('.orbit__spokes', orbit);
  const visual = $('[data-svc-visual]') || orbit;
  const NS = 'http://www.w3.org/2000/svg';
  // each service hangs from the core on a short flowing curve (the brand's line), not a straight clock hand
  const spokes = nodes.map((_, k) => {
    const a = (k * 40 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const x1 = c * 14, y1 = s * 14, x2 = c * 76, y2 = s * 76;
    const mx = c * 45 - s * 9, my = s * 45 + c * 9;       // control point swung sideways: a gentle S of the line
    const p = d.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${mx.toFixed(2)} ${my.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`);
    spokeG.append(p);
    return p;
  });
  const rows = $$('.svc-row');
  const caption = $('[data-orbit-caption]');
  const capNum = $('[data-orbit-num]'), capTitle = $('[data-orbit-title]');
  const titles = rows.map((r) => $('.svc-row__title', r).textContent.trim());
  nodes.forEach((n, k) => { n.setAttribute('data-title', titles[k] || ''); n.setAttribute('aria-label', titles[k] || ''); });
  let rot = 90, tgt = 90, hover = -1, front = -1, shown = -1, visible = false, running = false, lastT = 0, lastY = curY(), paused = false;
  // drift only while nothing is being pointed at: with the pointer anywhere over the visual, every tile holds still
  const idle = () => HC.fine() && hover < 0 && !paused;
  const nearest = (deg) => { let t = deg; while (t - rot > 180) t -= 360; while (t - rot < -180) t += 360; return t; };

  const setCaption = (i) => {
    if (!caption || i === shown || i < 0) return;
    shown = i;
    caption.href = nodes[i].getAttribute('href');
    capNum.textContent = String(i + 1).padStart(2, '0');
    capTitle.textContent = titles[i];
    if (!still() && capNum.animate) {
      for (const el of [capNum, capTitle]) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }
  };
  const apply = () => {
    ring.style.setProperty('--rot', `${rot.toFixed(2)}deg`);
    let best = -2, fi = 0;
    for (let k = 0; k < nodes.length; k++) {
      const th = ((k * 40 + rot) * Math.PI) / 180;
      const f = Math.sin(th);                        // 1 = nearest the viewer
      nodes[k].style.opacity = k === hover ? '1' : (0.45 + 0.55 * (f + 1) / 2).toFixed(3);
      if (f > best) { best = f; fi = k; }
    }
    if (fi !== front) {
      front = fi;
      nodes.forEach((n, k) => n.classList.toggle('is-front', k === fi));
      spokes.forEach((s, k) => s.classList.toggle('is-front', k === fi));
    }
    setCaption(hover >= 0 ? hover : front);          // the caption always names what a click would open
  };
  const tick = (t) => {
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 1 / 60);
    lastT = t;
    if (idle()) tgt -= dt * 5;                          // slow idle drift
    rot += (tgt - rot) * (1 - Math.exp(-dt * 5));
    apply();
    const settledNow = !idle() && Math.abs(tgt - rot) < 0.02;
    if (visible && !settledNow && !d.hidden) requestAnimationFrame(tick); else { running = false; lastT = 0; }
  };
  const kick = () => {
    if (still()) { rot = tgt; apply(); return; }
    if (!running && visible) { running = true; lastT = 0; requestAnimationFrame(tick); }
  };
  const focusService = (i, turn = true) => {
    hover = i;
    rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
    nodes.forEach((n, k) => n.classList.toggle('is-hover', k === i));
    if (i >= 0 && turn) tgt = nearest(90 - i * 40);
    else if (i >= 0) tgt = rot;                           // pointer on a tile: hold still under the pointer
    apply();
    kick();
  };
  rows.forEach((r, i) => {
    r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') focusService(i); }, passive);
    r.addEventListener('focus', () => focusService(i));
    r.addEventListener('blur', () => focusService(-1));
  });
  $('[data-svc-list]')?.addEventListener('pointerleave', () => focusService(-1), passive);
  nodes.forEach((n, i) => {
    n.addEventListener('pointerenter', () => focusService(i, false), passive);
    n.addEventListener('pointerleave', () => focusService(-1), passive);
  });
  visual.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { paused = true; tgt = rot; } }, passive);
  visual.addEventListener('pointerleave', () => { paused = false; kick(); }, passive);
  new IntersectionObserver((es) => { for (const e of es) { visible = e.isIntersecting; if (visible) kick(); } }, { rootMargin: '10% 0px' }).observe(orbit);
  d.addEventListener('visibilitychange', () => { if (!d.hidden) kick(); });
  if (!still()) {
    scrollers.add((y) => {
      const dy = y - lastY; lastY = y;
      if (!visible || hover >= 0 || paused) return;
      tgt -= dy * 0.06;                                  // scrolling turns the ecosystem
      kick();
    });
  }
  apply();
}

/* ================================================================== 7 · PRICING — the ground line both doorways stand on */
const plans = $('[data-plans]');
if (plans) {
  if (still() || !('IntersectionObserver' in window)) plans.classList.add('is-drawn');
  else {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { plans.classList.add('is-drawn'); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(plans);
  }
}

/* ================================================================== 8 · FREE CONSULTATION — the open door (3D, shares the hero's renderer) */
const doorStage = $('#door-stage');
if (doorStage) {
  // the whole door is a way in: it turns toward the cursor, so it must behave like the band's button
  const doorLink = $('[data-door-link]');
  doorStage.addEventListener('click', (e) => { if (doorLink) go(doorLink.getAttribute('href'), e.clientX, e.clientY); });
  if (CAN_3D) {
    const stackedBand = matchMedia('(max-width: 63.99em)');   // the stage sits under the copy (home.css)
    const door = mount(doorStage, () => import('/assets/js/3d/scenes/home-door.js'), {
      manual: !SHOT,                        // built in idle time once the hero is live (never mid-scroll)
      eager: SHOT,
      share: 'home',
      scrollTarget: doorStage.closest('.home-consult'),
      sceneOptions: { get stacked() { return stackedBand.matches; } },
    });
    if (!SHOT) {
      const idle = (fn, timeout) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 400));
      let warmed = false;
      const warm = () => { if (warmed) return; warmed = true; idle(() => door.prewarm(), 5000); };
      // after the hero has settled (or, with no hero world, after load); and in any case well before the band arrives
      if (hero) hero.ready.then(() => setTimeout(warm, 1200)); else addEventListener('load', warm, { once: true });
      new IntersectionObserver((es, io) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); door.prewarm(); } }, { rootMargin: '150% 0px' }).observe(doorStage);
    }
    addEventListener('hc:pt-leave', () => door.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) door.resume(); }, passive);
  }
}

measureAll();
