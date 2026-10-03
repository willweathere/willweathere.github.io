/* HCLabs — service page template behaviour (shared by all nine /services/<slug>/ pages).
   1 the service's world in the hero doorway (3D, lazy; motif from [data-motif]; static SVG fallback stays for
     reduced motion / no WebGL / failure) · 2 hero copy recedes as the page scrolls · 3 HR Starter Pack list ⇄ the
     fanned documents (hover / focus presents a document) · 4 screenshot helpers.
   Transform/opacity only; scroll work joins the shared HC scroll frame. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2 } from '/assets/js/3d/engine.js';

const d = document;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const passive = { passive: true };
const PARAMS = new URLSearchParams(location.search);

/* ---- review helpers (screenshots only): ?from=<section-id> drops the sections above it; ?scroll=N scrolls after load */
if (SHOT && PARAMS.has('from')) {
  const target = d.getElementById(PARAMS.get('from'));
  if (target) {
    for (const s of $$('main > section')) { if (s === target) break; s.hidden = true; }
    target.style.marginTop = '0';
    target.style.borderRadius = '0';
    target.style.paddingTop = `calc(var(--header-h) + ${getComputedStyle(target).paddingTop})`;
  }
}
if (SHOT && PARAMS.has('scroll')) addEventListener('load', () => scrollTo(0, +PARAMS.get('scroll') || 0), { once: true });

/* ================================================================== 1 · HERO WORLD */
const stage = $('#svc-stage');
const hero = $('.svc-hero');
if (stage && hasWebGL2()) {
  // ?motif=<name> previews another motif in this page's doorway (review only; see docs/SERVICE_TEMPLATE.md)
  const motif = PARAMS.get('motif') || stage.dataset.motif || 'audit';
  const world = mount(stage, () => import('/assets/js/3d/scenes/service.js'), {
    eager: true,                       // the doorway is in the first view: start loading straight away
    scrollTarget: hero,
    fadeMs: 900,
    sceneOptions: { motif, accent: $('main')?.dataset.accent || 'terracotta' },
  });
  addEventListener('hc:pt-leave', () => world.pause(), passive);
  addEventListener('pageshow', (e) => { if (e.persisted) world.resume(); }, passive);
}

/* ================================================================== 1b · the hero line's draw-on length
   The line's SVG is stretched to the hero (preserveAspectRatio="none") with a non-scaling stroke, so Chrome sizes the
   pathLength="1" dash in screen space. Measure the drawn length (sampled, once per resize) and hand it to CSS as --dash
   (in pathLength units): the dash then always covers the whole line and the draw ends exactly at its end. */
const heroLine = $('.svc-hero__line path');
if (heroLine && !SHOT) {
  const svg = heroLine.ownerSVGElement;
  const vb = svg.viewBox.baseVal;
  const L = heroLine.getTotalLength();
  const measure = () => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !vb.width) return;
    const sx = r.width / vb.width, sy = r.height / vb.height;
    let len = 0, px = 0, py = 0;
    for (let i = 0; i <= 48; i++) {
      const p = heroLine.getPointAtLength((L * i) / 48);
      const x = p.x * sx, y = p.y * sy;
      if (i) len += Math.hypot(x - px, y - py);
      px = x; py = y;
    }
    heroLine.style.setProperty('--dash', ((len / L) * 1.01).toFixed(4));
  };
  measure();
  let raf = 0;
  addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); }, passive);
}

/* ================================================================== 2 · hero copy recedes on scroll */
const copy = $('.svc-hero__copy');
if (copy && hero && !still()) {
  let last = -1;
  HC.onScroll(() => {
    const y = scrollY, vh = innerHeight;
    if (y > vh * 1.2 && last <= 0.5) return;
    const o = 1 - smooth(clamp(y / (vh * 0.85))) * 0.5;
    if (Math.abs(o - last) > 0.004) { last = o; copy.style.opacity = o >= 0.999 ? '' : o.toFixed(3); }
  });
}

/* ================================================================== 3 · HR Starter Pack list ⇄ documents */
const list = $('[data-pack-list]');
const fan = $('[data-pack-fan]');
if (list && fan) {
  const items = $$('a[data-doc]', list);
  const docs = $$('.svc-doc[data-doc]', fan);
  const byDoc = (n) => docs.find((el) => el.dataset.doc === n);
  let active = null, pinned = null;
  const present = (n) => {
    const next = n ? byDoc(n) : null;
    if (next === active) return;
    active?.classList.remove('is-active');
    active = next;
    active?.classList.add('is-active');
    items.forEach((a) => a.classList.toggle('is-hot', !!n && a.dataset.doc === n));
  };
  items.forEach((a) => {
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') present(a.dataset.doc); }, passive);
    a.addEventListener('focus', () => { pinned = a.dataset.doc; present(pinned); });
    a.addEventListener('blur', () => { pinned = null; present(null); });
  });
  list.addEventListener('pointerleave', () => present(pinned), passive);
  docs.forEach((doc) => {
    doc.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') present(doc.dataset.doc); }, passive);
    doc.addEventListener('pointerleave', () => present(pinned), passive);
  });
}
