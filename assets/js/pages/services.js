/* HCLabs — /services/ behaviour: the service ecosystem.
   The DOM index is the real, accessible control; the 3D world mirrors it and answers back:
   - hover / focus a service row  → the ring turns that door to the front and the terracotta line connects to it
   - pointer on a 3D door (raycast) → the door lifts, its row lights up, a click opens that service
   - scrolling the index            → the row at the reading line is the one the ecosystem shows
   - nobody choosing                → the ring drifts; the caption follows the door the line points at
   Everything degrades: no WebGL / no JS → static art whose doors are real links; reduced motion → settled frames. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const passive = { passive: true };
const PARAMS = new URLSearchParams(location.search);
const pad2 = (n) => String(n + 1).padStart(2, '0');

const explorer = $('[data-explorer]');
const stage = $('#svc-stage');
const rows = $$('[data-svc-item]');
const list = $('[data-svc-list]');
const fbNodes = $$('[data-fb-node]').sort((a, b) => +a.dataset.fbNode - +b.dataset.fbNode);
const caption = $('[data-svc-caption]');
const capNum = $('[data-cap-num]');
const capTitle = $('[data-cap-title]');
const titles = rows.map((r) => $('.svc-item__title', r).textContent.trim());
const hrefs = rows.map((r) => r.getAttribute('href'));

/* review helpers (screenshots only): ?shot=1 in a very tall window → tall layout; ?svc=N shows service N chosen */
if (SHOT && innerHeight > 1500) d.documentElement.classList.add('shot-tall');
const SHOT_SVC = SHOT && PARAMS.has('svc') ? Math.max(0, Math.min(8, (+PARAMS.get('svc') || 1) - 1)) : -1;

let api = null;
let hot = -1;        // pointer / focus on a row, or pointer on a 3D door
let hotFrom3d = false;
let current = -1;    // the row at the reading line while the index scrolls
let shown = -1;      // what the caption shows

/* ---------------------------------------------------------------- the caption follows the line */
function setCaption(i) {
  if (!caption || i < 0 || i === shown) return;
  shown = i;
  caption.href = hrefs[i];
  capNum.textContent = pad2(i);
  capTitle.textContent = titles[i];
  if (!still()) { caption.classList.remove('is-swap'); void caption.offsetWidth; caption.classList.add('is-swap'); }
}

/* ---------------------------------------------------------------- one place decides what is highlighted */
function paint() {
  rows.forEach((r, i) => {
    r.classList.toggle('is-hot', i === hot);
    r.classList.toggle('is-current', i === current && hot < 0);
  });
  fbNodes.forEach((n, i) => n.classList.toggle('is-hot', i === (hot >= 0 ? hot : current)));
  if (api) {
    api.setHovered(hotFrom3d ? hot : -1);
    api.setActive(!hotFrom3d && hot >= 0 ? hot : current);
  } else {
    setCaption(hot >= 0 ? hot : current >= 0 ? current : 0);
  }
}
const setHot = (i, from3d = false) => {
  if (hot === i && hotFrom3d === from3d) return;
  hot = i; hotFrom3d = i >= 0 && from3d;
  paint();
};

/* rows: hover (mouse), focus (keyboard) */
rows.forEach((r, i) => {
  r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setHot(i); }, passive);
  r.addEventListener('focus', () => setHot(i));
  r.addEventListener('blur', () => { if (hot === i) setHot(-1); });
});
list?.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !hotFrom3d) setHot(-1); }, passive);

/* static art: its doors are links; hovering one mirrors into the index */
fbNodes.forEach((n, i) => {
  n.addEventListener('pointerenter', () => setHot(i, true), passive);
  n.addEventListener('pointerleave', () => { if (hot === i) setHot(-1); }, passive);
});

/* ---------------------------------------------------------------- scroll: the row at the reading line */
const mqDesk = matchMedia('(min-width: 64em)');
const stageCol = $('.svc-stagecol');
let rowTops = [], rowBottoms = [], bandH = 0, vh = innerHeight;
const measure = () => {
  vh = innerHeight;
  const y = scrollY;
  rowTops = rows.map((r) => r.getBoundingClientRect().top + y);
  rowBottoms = rows.map((r, i) => rowTops[i] + r.offsetHeight);
  bandH = mqDesk.matches ? 0 : (stageCol?.offsetHeight || 0);
};
const readCurrent = () => {
  if (!rows.length) return;
  const y = scrollY;
  const line = y + (bandH ? bandH + (vh - bandH) * 0.28 : vh * 0.5);
  let c = -1;
  if (line >= rowTops[0] - 4 && line <= rowBottoms[rows.length - 1] + 4) {
    for (let i = 0; i < rows.length; i++) if (line >= rowTops[i] - 1 && line < rowBottoms[i] + 1) { c = i; break; }
    if (c < 0) c = rows.length - 1;
  }
  if (c !== current) { current = c; paint(); }
};
HC.onScroll(readCurrent);
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); readCurrent(); }, 120); }, passive);
addEventListener('load', () => { measure(); readCurrent(); }, { once: true });
d.fonts?.ready?.then(() => { measure(); readCurrent(); });
measure();

/* ---------------------------------------------------------------- the 3D ecosystem */
if (stage) {
  // Fallback art is managed here (not by the engine) so it never double-exposes with the live world: hidden while the
  // world loads, shown if it is late or unavailable, cut quickly the moment the world is live.
  const showFallback = () => stage.classList.add('fb-on');
  // SPEC §1: reduced motion, no WebGL2 and low-power devices keep the static art and never download three.js
  const webgl = hasWebGL2() && (SHOT || (!HC.reduced() && !lowPower()));
  stage.classList.add('is-managed');
  if (webgl) {
    for (const href of ['/assets/vendor/three.module.min.js', '/assets/js/3d/kit.js', '/assets/js/3d/scenes/services.js']) {
      const l = d.createElement('link');
      l.rel = 'modulepreload'; l.href = href;
      d.head.appendChild(l);
    }
  }
  // a slow load may already have revealed the art (html.js-failed): keep it until the world is live, no flicker
  if (!webgl || d.documentElement.classList.contains('js-failed')) showFallback();
  else if (!SHOT) setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(); }, 2400);
  new MutationObserver(() => { if (stage.getAttribute('data-3d') === 'fallback') showFallback(); })
    .observe(stage, { attributes: true, attributeFilter: ['data-3d'] });

  if (webgl) {
    const mqStack = matchMedia('(max-width: 63.99em)');
    const h = mount(stage, () => import('/assets/js/3d/scenes/services.js'), {
      eager: mqDesk.matches || SHOT,
      fallback: null,
      fadeMs: 700,
      scrollTarget: explorer,
      sceneOptions: { rest: SHOT_SVC >= 0 ? SHOT_SVC : 0, get stacked() { return mqStack.matches; } },
    });
    h.ready.then((a) => {
      if (!a) { showFallback(); return; }
      api = a;
      if (SHOT_SVC >= 0) { hot = SHOT_SVC; hotFrom3d = false; }
      paint();
    });
    stage.addEventListener('hc3d:target', (e) => setCaption(e.detail.index));
    mqStack.addEventListener?.('change', () => h.invalidate());
    addEventListener('hc:pt-leave', () => h.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) h.resume(); }, passive);

    // pointer on a door: raycast on move (one per frame at most); the door lifts and its row lights up
    let px = 0, py = 0, queued = false, pointerType = 'mouse';
    const probe = () => {
      queued = false;
      if (!api) return;
      const i = api.pickAt(px, py, false);
      stage.classList.toggle('is-pointing', i >= 0);
      if (i >= 0) setHot(i, true);
      else if (hotFrom3d) setHot(-1);
    };
    // while the mouse rests over the stage, doors can still turn or scroll beneath it: re-pick on a light timer
    // (a raycast against one instanced mesh of nine doors) so the highlight never goes stale
    let inside = false, repick = 0;
    const repickLoop = () => { repick = 0; if (!inside || d.hidden) return; probe(); repick = setTimeout(repickLoop, 200); };
    stage.addEventListener('pointermove', (e) => {
      pointerType = e.pointerType;
      if (e.pointerType !== 'mouse') return;
      px = e.clientX; py = e.clientY;
      inside = true;
      if (!queued) { queued = true; requestAnimationFrame(probe); }
      if (!repick) repick = setTimeout(repickLoop, 200);
    }, passive);
    addEventListener('hc:pt-leave', () => { inside = false; clearTimeout(repick); repick = 0; }, passive);
    stage.addEventListener('pointerleave', () => {
      inside = false; clearTimeout(repick); repick = 0;
      stage.classList.remove('is-pointing');
      if (hotFrom3d) setHot(-1);
    }, passive);
    stage.addEventListener('pointerdown', (e) => { pointerType = e.pointerType; }, passive);
    // click / tap on a door opens its service (through the row's link, so page transitions apply)
    stage.addEventListener('click', (e) => {
      if (!api) return;
      const i = api.pickAt(e.clientX, e.clientY, pointerType !== 'mouse');
      if (i >= 0) rows[i].click();
    });
  }
}

paint();
readCurrent();
