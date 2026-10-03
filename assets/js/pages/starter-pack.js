/* HCLabs — HR Starter Pack (/hr-starter-pack/).
   · story mode (html.sp-story, set inline before first paint): the page's scroll position maps to a story value
     t = 0 (the pack) · 1…7 (item presented, its caption centred) · 8 (all seven in place) that drives the 3D scene,
     the active caption and the "in place" counter. Anchors are measured from the real caption positions.
   · the seven items open one accessible dialog (native <dialog>): from the item buttons (keyboard / screen readers),
     from the 3D documents themselves (pointer / touch, raycast) and from inside the dialog (list, previous / next).
   · 3D hover ↔ DOM: pointing at a document highlights its button and shows a cursor label; hovering or focusing a
     button lifts its document out of the doorway.
   Static mode (reduced motion / low-power devices / no WebGL / screenshots): the composed doorway + the grid of items;
   same dialog. Reduced motion and low-power devices keep the static SVG doorway and never load three.js. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';

const d = document;
const root = d.documentElement;
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const passive = { passive: true };
const debounce = (fn, t = 150) => { let id; return () => { clearTimeout(id); id = setTimeout(fn, t); }; };
const PARAMS = new URLSearchParams(location.search);

const TITLES = [
  'Employee Handbook', 'Essential HR Policies', 'Disciplinary & Grievance Procedures', 'Absence Management Documentation',
  'Family Leave Policies', 'Manager Guidance Documents', 'HR Templates and Forms',
];
const N = TITLES.length;
const num = (i) => String(i + 1).padStart(2, '0');

const storyEl = $('.sp-story');
const wrap = $('.sp-stage-wrap');
const stage = $('#sp-stage');
const heroCopy = $('.sp-hero__copy');
const steps = $$('.sp-step');
const docBtns = $$('.sp-doc');
const outro = $('.sp-outro');
const progress = $('.sp-progress');
const countEl = $('[data-sp-count]');
const bars = $$('.sp-progress__bar i');
const cursor = $('[data-sp-cursor]');
const cursorNum = $('[data-sp-cursor-num]');
const cursorTitle = $('[data-sp-cursor-title]');

const review = root.classList.contains('sp-review');
let story = root.classList.contains('sp-story');
const REVIEW_T = review ? clamp(+PARAMS.get('sp') || 0, 0, 8) : null;
const mqStacked = matchMedia('(max-width: 47.99em), (max-aspect-ratio: 4/5)');   // keep in step with starter-pack.css
const layoutName = () => (story ? 'story' : 'static') + (mqStacked.matches ? '-stacked' : '');

let api = null;
let handle = null;

/* ==================================================================== scroll → story value */
let anchors = [0];
let vh = innerHeight;
let t = story ? 0 : 8;
let heroFloor = 0.72;
let endBand = [0.12, 0.58];     // (phones / portrait) viewport band where the completed doorway is framed at t = 8
let active = -2, placed = -1, progOn = null;
const header = $('.site-header__bar') || $('.site-header');
const END_AT = 0.6;             // (phones / portrait) the story completes when the outro card's top reaches 60% of the screen

function measure() {
  vh = innerHeight;
  if (heroCopy) heroFloor = clamp((heroCopy.getBoundingClientRect().bottom + scrollY - storyTop()) / vh, 0.3, 1.1);
  if (!story) return;
  const y0 = scrollY;
  const center = (el) => { const r = el.getBoundingClientRect(); return r.top + y0 + r.height / 2 - vh / 2; };
  anchors = [storyTop(), ...steps.map(center)];
  if (outro) {
    const c = $('.sp-outro__card', outro) || outro;
    if (mqStacked.matches) {
      // the finished doorway gets the screen above the card: complete as the card arrives, then the card slides over
      anchors.push(c.getBoundingClientRect().top + y0 - vh * END_AT);
      const hb = header ? header.getBoundingClientRect().bottom : 72;
      endBand = [clamp((hb + 6) / vh, 0.04, 0.3), END_AT - 0.025];
    } else {
      anchors.push(center(c));
    }
  }
  for (let k = 1; k < anchors.length; k++) if (anchors[k] <= anchors[k - 1]) anchors[k] = anchors[k - 1] + 1;
}
function storyTop() { return storyEl ? storyEl.getBoundingClientRect().top + scrollY : 0; }
function tAt(y) {
  if (y <= anchors[0]) return 0;
  for (let k = 1; k < anchors.length; k++) if (y < anchors[k]) return k - 1 + (y - anchors[k - 1]) / (anchors[k] - anchors[k - 1]);
  return anchors.length - 1;
}

function onScroll() {
  if (!story) return;
  t = review ? REVIEW_T : tAt(scrollY);
  api?.setProgress(t);
  // the caption being read
  const k = t < 0.5 ? -1 : Math.min(N, Math.round(t)) - 1;     // 0..6 = items, 7 = outro
  if (k !== active) {
    active = k;
    steps.forEach((s, i) => s.classList.toggle('is-active', i === k));
  }
  // how many of the seven are in place
  const p = clamp(Math.floor(t - 0.46), 0, N);
  if (p !== placed) {
    placed = p;
    if (countEl) countEl.textContent = String(p);
    bars.forEach((b, i) => b.classList.toggle('is-on', i < p));
  }
  const bottom = storyEl.getBoundingClientRect().bottom;
  const on = t > 0.55 && t < 7.85 && bottom > vh * 0.7;
  if (on !== progOn) { progOn = on; progress?.classList.toggle('is-on', on); }
  if (pointer.inside) schedulePick();
}

/* ==================================================================== 3D */
function leaveStory() {
  if (!story || review) return;
  story = false;
  root.classList.remove('sp-story');
  t = 8;
  api?.setProgress(8);
  progress?.classList.remove('is-on');
  steps.forEach((s) => s.classList.remove('is-active'));
  measure();
  // the layout changed under a deep link (#doc-0N): keep that item in view
  const target = /^#doc-0[1-7]$/.test(location.hash) ? d.getElementById(location.hash.slice(1)) : null;
  if (target && scrollY > 0) target.scrollIntoView({ block: 'start' });
}

// html.sp-nogl: the inline boot test could not create a WebGL2 context (blocked / blocklisted GPU) — keep the static art
// without asking three.js to try (it would log a context error before the engine falls back).
// SPEC §1 / 3D README §1: reduced motion and low-power devices keep the static art and never download three.js
// (screenshots and ?q= testing still mount).
const CAN_3D = !!stage && hasWebGL2() && !root.classList.contains('sp-nogl')
  && (HC.shot || PARAMS.has('q') || (!HC.reduced() && !lowPower()));
if (CAN_3D) {
  measure();
  t = review ? REVIEW_T : story ? tAt(scrollY) : 8;
  handle = mount(stage, () => import('/assets/js/3d/scenes/starter-pack.js'), {
    eager: true,
    fadeMs: 900,
    scrollTarget: storyEl,
    sceneOptions: {
      get layout() { return layoutName(); },
      get heroFloor() { return heroFloor; },
      get endBand() { return endBand; },
      t,
    },
  });
  handle.ready.then((a) => {
    if (!a || typeof a.setProgress !== 'function') { leaveStory(); return; }
    api = a;
    api.setProgress(story ? t : review ? REVIEW_T : 8);
    if (lastHover >= 0) api.setHover('dom', lastHover);
    if (modal?.open) api.select(cur);
  });
  addEventListener('hc:pt-leave', () => handle.pause(), passive);
  addEventListener('pageshow', (e) => { if (e.persisted) handle.resume(); }, passive);
} else {
  leaveStory();
}

/* ---- pointer on the stage: hover a document (raycast), click / tap to open it ---- */
const pointer = { x: 0, y: 0, inside: false, fine: false };
let pickFrame = 0, hot = -1;
function schedulePick() { if (!pickFrame) pickFrame = requestAnimationFrame(runPick); }
function runPick() {
  pickFrame = 0;
  const i = pointer.inside && pointer.fine && api ? api.pick(pointer.x, pointer.y) : -1;
  setHot(i);
  if (i >= 0 && cursor) {
    const r = wrap.getBoundingClientRect();
    const cw = cursor.offsetWidth || 200;
    const x = Math.min(pointer.x - r.left + 20, r.width - cw - 12);
    cursor.style.setProperty('--cx', `${x.toFixed(1)}px`);
    cursor.style.setProperty('--cy', `${(pointer.y - r.top + 20).toFixed(1)}px`);
  }
}
function setHot(i) {
  if (i === hot) return;
  if (hot >= 0) docBtns[hot]?.classList.remove('is-hot');
  hot = i;
  api?.setHover('pointer', i);
  wrap?.classList.toggle('is-hot', i >= 0);
  if (i >= 0) {
    docBtns[i]?.classList.add('is-hot');
    if (cursorNum) cursorNum.textContent = num(i);
    if (cursorTitle) cursorTitle.textContent = TITLES[i];
  }
  cursor?.classList.toggle('is-on', i >= 0);
}
if (wrap) {
  wrap.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    pointer.fine = e.pointerType === 'mouse' || e.pointerType === 'pen';
    schedulePick();
  }, passive);
  wrap.addEventListener('pointerleave', () => { pointer.inside = false; schedulePick(); }, passive);
  wrap.addEventListener('click', (e) => {
    if (!api) return;
    const i = api.pick(e.clientX, e.clientY);
    if (i >= 0) openDoc(i, null);
  });
}

/* ---- DOM → 3D: hovering / focusing an item lifts its document ---- */
let lastHover = -1;
const setDomHover = (i) => { lastHover = i; api?.setHover('dom', i); };
docBtns.forEach((btn) => {
  const i = +btn.dataset.doc;
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setDomHover(i); }, passive);
  btn.addEventListener('pointerleave', () => { if (lastHover === i) setDomHover(-1); }, passive);
  btn.addEventListener('focus', () => {
    setDomHover(i);
    // keyboard focus in the story: glide to the point where this item is presented (its caption centred)
    if (story && !review && btn.matches(':focus-visible') && anchors[i + 1] != null && Math.abs(scrollY - anchors[i + 1]) > 4) {
      scrollTo({ top: anchors[i + 1], behavior: HC.reduced() ? 'auto' : 'smooth' });
    }
  });
  btn.addEventListener('blur', () => { if (lastHover === i) setDomHover(-1); });
  btn.addEventListener('click', () => openDoc(i, btn));
});

/* ---- "See all seven items": in the story, land exactly on the first item ---- */
for (const a of $$('[data-sp-jump]')) {
  a.addEventListener('click', (e) => {
    if (!story) return;
    e.preventDefault();
    measure();
    scrollTo({ top: anchors[1] ?? 0, behavior: HC.reduced() ? 'auto' : 'smooth' });
    docBtns[0]?.focus({ preventScroll: true });
  });
}

/* ==================================================================== the detail dialog */
const modal = $('#sp-modal');
let cur = 0, opener = null;
const m = modal ? {
  art: $('[data-m-art]', modal), bignum: $('[data-m-bignum]', modal), count: $('[data-m-count]', modal),
  title: $('[data-m-title]', modal), name: $('[data-m-name]', modal), live: $('[data-m-live]', modal),
  prevT: $('[data-m-prev-t]', modal), nextT: $('[data-m-next-t]', modal), list: $$('[data-m-go]', modal),
} : null;

function fill(i, swap) {
  cur = (i + N) % N;
  const n = num(cur);
  m.art.setAttribute('href', `#spa-${cur + 1}`);
  m.bignum.textContent = n;
  m.count.textContent = `Item ${n} of 07`;
  m.title.textContent = TITLES[cur];
  m.name.textContent = TITLES[cur];
  m.prevT.textContent = TITLES[(cur + N - 1) % N];
  m.nextT.textContent = TITLES[(cur + 1) % N];
  m.list.forEach((b, k) => { if (k === cur) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  if (swap) {
    modal.classList.remove('is-swap'); void modal.offsetWidth; modal.classList.add('is-swap');
    m.live.textContent = `Item ${n} of 07: ${TITLES[cur]}`;
  }
  api?.select(cur);
}
function openDoc(i, from) {
  if (!modal) return;
  opener = from;
  modal.classList.remove('is-swap');
  m.live.textContent = '';
  fill(i, false);
  HC.openModal(modal);
}
if (modal) {
  $('[data-m-prev]', modal)?.addEventListener('click', () => fill(cur - 1, true));
  $('[data-m-next]', modal)?.addEventListener('click', () => fill(cur + 1, true));
  m.list.forEach((b) => b.addEventListener('click', () => fill(+b.dataset.mGo, true)));
  modal.addEventListener('keydown', (e) => {   // arrow keys browse the pack while the dialog is open
    if (e.target.closest('a, input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); fill(cur + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); fill(cur - 1, true); }
  });
  modal.addEventListener('close', () => {
    api?.select(-1);
    const back = opener; opener = null;
    // opened from a button: return focus to the item's own button (it may have been another item, via the dialog)
    if (back) {
      const target = docBtns[cur] && docBtns[cur].offsetParent !== null ? docBtns[cur] : back;
      target.focus({ preventScroll: true });
    }
  });
}

/* ---- deep links (/hr-starter-pack/#doc-04 from the homepage and the package pages): land where that item is
   presented, caption centred. Re-applied while fonts/layout settle, until the visitor scrolls themselves. ---- */
const deepMatch = /^#doc-0([1-7])$/.exec(location.hash);
let deepPending = !!deepMatch && story && !review;
if (deepPending) {
  const stop = () => { deepPending = false; };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, stop, { passive: true, once: true });
  setTimeout(stop, 3000);
}
function landDeepLink() {
  if (!deepPending || !story) return;
  const y = anchors[+deepMatch[1]];
  if (y != null && Math.abs(scrollY - y) > 2) scrollTo({ top: y, behavior: 'auto' });
}

/* ==================================================================== boot */
const remeasure = () => { measure(); landDeepLink(); active = -2; placed = -1; progOn = null; onScroll(); };
HC.onScroll(onScroll);
addEventListener('resize', debounce(remeasure, 140), passive);
addEventListener('load', remeasure, { once: true });
d.fonts?.ready?.then(remeasure);
if ('ResizeObserver' in window && storyEl) new ResizeObserver(debounce(remeasure, 120)).observe(storyEl);
mqStacked.addEventListener?.('change', remeasure);
remeasure();
