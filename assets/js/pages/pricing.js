/* HCLabs — pricing pages.
   /pricing/          two doorways (3D) under the real package links: hover/focus lifts a doorway and opens its documents;
                      choosing a package carries its doorway forward, then the page transition takes over (~780ms total).
   package pages      a sticky 3D doorway whose documents fan out as the "What's included" list is read; hovering or
                      focusing an item presents that document (package two: the consultation brings the person forward).
   Everything degrades to the static fallback art (no WebGL) and settled frames (reduced motion, ?shot=1). */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2 } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const passive = { passive: true };
const PARAMS = new URLSearchParams(location.search);
const SCENE = () => import('/assets/js/3d/scenes/pricing.js');
const KEY = 'hc:pkg';

/* tall full-page captures (?shot=1 in a very tall window): lay out as a 900px-tall screen would */
if (SHOT && innerHeight > 1500) d.documentElement.classList.add('shot-tall');
/* ?scroll=N (screenshots only): scroll after load */
if (SHOT && PARAMS.has('scroll')) addEventListener('load', () => { scrollTo(0, +PARAMS.get('scroll') || 0); setTimeout(() => HC.refresh(), 50); }, { once: true });

/* ledger ticks land in sequence (row by row) */
$$('.ledger .tick').forEach((t, i) => t.style.setProperty('--t', i));

/* ================================================================== /pricing/ · the two doorways */
const stage = $('#pr-stage');
if (stage) {
  const hero = stage.closest('.pr-hero');
  const pkgs = $$('[data-pkg]', stage);
  const windows = $$('[data-pkg-window]', stage);
  let api = null, hover = -1, going = false;

  if (hasWebGL2()) {
    const start = () => {
      const h = mount(stage, SCENE, {
        eager: true,
        fadeMs: 700,
        scrollTarget: hero,
        sceneOptions: { mode: 'compare', anchors: windows },
      });
      h.ready.then((a) => {
        api = a;
        if (api && hover >= 0) api.setHover(hover);
        if (api && SHOT && PARAMS.has('hover')) api.setHover(+PARAMS.get('hover'));
        if (api && SHOT && PARAMS.has('select')) api.select(+PARAMS.get('select'));
        // anchors move when fonts land or copy reflows: re-place the doorways
        // (ResizeObserver callbacks already run once per frame, after layout)
        if (api && 'ResizeObserver' in window) {
          const ro = new ResizeObserver(() => api.relayout());
          windows.forEach((w) => ro.observe(w));
          ro.observe($('.pr-pkgs', stage));
        }
        d.fonts?.ready?.then(() => api?.relayout());
      });
    };
    // screenshots (?shot=1): headless capture never fires ResizeObserver, so mount once the layout has settled
    if (SHOT && d.readyState !== 'complete') addEventListener('load', () => setTimeout(start, 150), { once: true });
    else start();
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      going = false;
      hero.classList.remove('is-selecting');
      pkgs.forEach((p) => p.classList.remove('is-chosen'));
      api?.reset();
    }, passive);
  }

  const setHover = (i) => {
    if (hover === i || going) return;
    hover = i;
    api?.setHover(i);
  };
  pkgs.forEach((a, i) => {
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setHover(i); }, passive);
    a.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(-1); }, passive);
    a.addEventListener('focus', () => setHover(i));
    a.addEventListener('blur', () => setHover(-1));
    a.addEventListener('click', (e) => {
      if (a.dataset.go) { delete a.dataset.go; return; }        // our own follow-up click: let the page transition run
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (still() || !api) return;                               // instant / no 3D: plain navigation
      e.preventDefault();
      if (going) return;
      going = true;
      hero.classList.add('is-selecting');
      a.classList.add('is-chosen');
      api.select(i);
      try { sessionStorage.setItem(KEY, JSON.stringify({ i, t: Date.now() })); } catch { /* storage blocked */ }
      setTimeout(() => { a.dataset.go = '1'; a.click(); }, 300);
    });
  });
}

/* ================================================================== package pages · the doorway and its documents */
const pkStage = $('#pk-stage');
if (pkStage) {
  const kind = pkStage.dataset.pkg === 'plus' ? 'plus' : 'pack';
  const track = $('[data-pk-track]') || pkStage;
  const list = $('[data-pk-list]');
  const items = $$('[data-pk-item]');
  const mqSticky = matchMedia('(min-width: 64em)');   // keep in step with pricing.css (.pk-hero__visual sticky)
  let api = null, hover = -1, spread = 0, focus = -1, sentSpread = -1, sentFocus = -2;

  // arriving from the selection on /pricing/: the scene starts inside the doorway and steps back out
  let arrive = false;
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    sessionStorage.removeItem(KEY);
    if (v && Date.now() - v.t < 6000 && v.i === (kind === 'plus' ? 1 : 0) && !still()) arrive = true;
  } catch { /* ignore */ }

  const push = () => {
    if (!api) return;
    const f = hover >= 0 ? hover : focus;
    if (Math.abs(spread - sentSpread) < 0.002 && f === sentFocus) return;
    sentSpread = spread; sentFocus = f;
    api.setState({ spread, focus: f });
  };
  const mark = (f) => items.forEach((el, i) => el.classList.toggle('is-active', i === f));

  const measure = () => {
    if (!list) return;
    const vh = innerHeight;
    if (mqSticky.matches) {
      const r = list.getBoundingClientRect();
      spread = clamp((vh * 0.92 - r.top) / (vh * 0.42));
      let best = -1, bd = Infinity;
      if (r.top < vh * 0.62 && r.bottom > vh * 0.3) {
        items.forEach((el, i) => {
          const b = el.getBoundingClientRect();
          const dd = Math.abs((b.top + b.bottom) / 2 - vh * 0.5);
          if (dd < bd) { bd = dd; best = i; }
        });
      }
      focus = best;
    } else {
      // stacked: the documents open as the doorway passes up through the viewport
      const r = pkStage.getBoundingClientRect();
      spread = clamp((vh * 0.62 - r.top) / (vh * 0.5));
      focus = -1;
    }
    if (hover < 0) mark(focus);
    push();
  };

  if (hasWebGL2()) {
    let h = null;
    const start = () => {
      h = mount(pkStage, SCENE, {
        eager: true,
        fadeMs: arrive ? 300 : 800,
        scrollTarget: track,
        sceneOptions: { mode: kind, arrive },
      });
      h.ready.then((a) => { api = a; sentSpread = -1; push(); });
    };
    // screenshots (?shot=1): mount once the layout has settled (headless capture never fires ResizeObserver)
    if (SHOT && d.readyState !== 'complete') addEventListener('load', () => setTimeout(start, 150), { once: true });
    else start();
    addEventListener('hc:pt-leave', () => h?.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) h?.resume(); }, passive);
  }

  if (SHOT) {
    // screenshots: ?spread=0..1&focus=i compose a specific state
    spread = PARAMS.has('spread') ? clamp(+PARAMS.get('spread')) : 0;
    focus = PARAMS.has('focus') ? +PARAMS.get('focus') : -1;
    mark(focus);
  } else if (HC.reduced()) {
    spread = 1; focus = -1;                              // one composed state (the pack fanned open); no scroll-driven motion
  } else {
    HC.onScroll(measure);
    addEventListener('resize', measure, passive);
    measure();
  }

  const setHover = (i) => {
    if (hover === i) return;
    hover = i;
    mark(i >= 0 ? i : focus);
    if (HC.reduced() && i >= 0) spread = 1;
    push();
  };
  items.forEach((el) => {
    const i = +el.dataset.pkItem;
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setHover(i); }, passive);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(-1); }, passive);
    el.addEventListener('focus', () => setHover(i));
    el.addEventListener('blur', () => setHover(-1));
  });
}

/* ================================================================== £399 · the hour: the row at the reading line (or under the pointer) is lit */
const rows = $$('[data-hour]');
if (rows.length) {
  let over = -1, read = -1;
  const paint = () => { const k = over >= 0 ? over : read; rows.forEach((r, i) => r.classList.toggle('is-lit', i === k)); };
  if (SHOT) {
    read = PARAMS.has('lit') ? +PARAMS.get('lit') : -1;
    paint();
  } else if (HC.reduced()) {
    rows.forEach((r) => r.classList.add('is-lit'));   // one composed state, no scroll-driven change
  } else {
    const onScroll = () => {
      const vh = innerHeight;
      let best = -1, bd = vh * 0.3;
      rows.forEach((r, i) => {
        const b = r.getBoundingClientRect();
        const dd = Math.abs((b.top + b.bottom) / 2 - vh * 0.55);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best !== read) { read = best; paint(); }
    };
    HC.onScroll(onScroll);
    onScroll();
    rows.forEach((r, i) => {
      r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { over = i; paint(); } }, passive);
      r.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { over = -1; paint(); } }, passive);
    });
  }
}
