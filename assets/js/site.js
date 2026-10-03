/* HCLabs — site shell: header state, menus, reveals, split headlines, magnetic buttons, card tilt,
   parallax, arch cards, modals. Small, dependency-free, passive listeners, transform/opacity only.
   Public API: window.HC (see bottom). */

const d = document;
const html = d.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
const SHOT = html.classList.contains('shot');
const reduced = () => mqReduce.matches;
const fine = () => mqFine.matches && !reduced() && !SHOT;
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const raf = requestAnimationFrame;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, t = 150) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); }; };
const passive = { passive: true };

/* ---------------------------------------------------------------- main landmark */
const main = d.querySelector('main');
if (main) {
  if (!d.getElementById('main')) main.id = 'main';
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
}

/* ---------------------------------------------------------------- header: scrolled state + ground detection */
const header = d.querySelector('[data-header]');
const GROUND_SEL = '[data-ground],.theme-dark,.theme-deep,.theme-ink,.theme-light,.theme-paper';
const groundOf = (el) => {
  const g = el.getAttribute('data-ground');
  if (g) return g;
  return /theme-(light|paper)/.test(el.className) ? 'light' : 'dark';
};
function setGround(g) { if (header && header.dataset.ground !== g) header.dataset.ground = g; }
setGround(groundOf(d.body.matches(GROUND_SEL) ? d.body : html));

// immediate, synchronous read of the ground under the header (boot, refresh, resize); the IO below keeps it live on scroll
function syncGround() {
  if (!header) return;
  const y = Math.round((header.querySelector('.site-header__bar')?.offsetHeight || 84) / 2);
  const hit = d.elementsFromPoint(innerWidth / 2, y).find((el) => !header.contains(el) && !el.closest('.mobile-menu,.pt'));
  const g = hit?.closest(GROUND_SEL);
  if (g) setGround(groundOf(g));
}
let groundIO;
const activeGrounds = new Set();
function pickGround() {
  let best = null;
  for (const el of activeGrounds) {
    if (!best || best.contains(el) || (!el.contains(best) && (best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) best = el;
  }
  setGround(best ? groundOf(best) : groundOf(d.body));
}
function initGround() {
  if (!header || !('IntersectionObserver' in window)) return;
  groundIO?.disconnect();
  activeGrounds.clear();
  const band = Math.round((header.querySelector('.site-header__bar')?.offsetHeight || 84) / 2);
  const onGround = (entries) => {
    for (const e of entries) {
      const wide = e.boundingClientRect.width >= innerWidth * 0.6;
      if (e.isIntersecting && wide) activeGrounds.add(e.target); else activeGrounds.delete(e.target);
    }
    pickGround();
  };
  const margin = `-${band}px 0px -${Math.max(0, innerHeight - band - 2)}px 0px`;
  try { groundIO = new IntersectionObserver(onGround, { root: d, rootMargin: margin }); }
  catch { groundIO = new IntersectionObserver(onGround, { rootMargin: margin }); }
  for (const el of $$(GROUND_SEL)) if (el !== d.body && !header.contains(el) && !el.closest('.mobile-menu,.pt,dialog')) groundIO.observe(el);
}

/* The scroll position is captured once, in the scroll event, before any frame writes styles: reading scrollY inside a
   rAF after other callbacks have written styles forces a synchronous layout. Every scroller receives it (fn(y)), and
   HC.scrollY() returns it for page code. */
let lastY = scrollY;
function onHeaderScroll() {
  header?.classList.toggle('is-scrolled', lastY > 12);
}

/* ---------------------------------------------------------------- scroll loop (one rAF for header + parallax + scroll-draw) */
let ticking = false;
const scrollers = new Set();
function onScroll() {
  lastY = scrollY;
  if (ticking) return;
  ticking = true;
  raf(() => {
    ticking = false;
    onHeaderScroll();
    for (const fn of scrollers) fn(lastY);
  });
}
addEventListener('scroll', onScroll, passive);
addEventListener('resize', () => { lastY = scrollY; }, passive);

/* ---------------------------------------------------------------- mobile menu */
const menu = d.querySelector('[data-menu]');
const menuBtn = d.querySelector('[data-menu-toggle]');
let menuOpen = false, menuHideTimer;
const focusables = (root) => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', root)
  .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
function setInert(on) {
  for (const el of d.body.children) {
    if (el === header || el === menu || el.tagName === 'SCRIPT' || el.classList.contains('pt')) continue;
    if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }
}
function lockScroll(on) {
  if (on && !html.classList.contains('is-locked')) html.style.setProperty('--sbw', `${Math.max(0, innerWidth - html.clientWidth)}px`);
  html.classList.toggle('is-locked', on);
}
function openMenu() {
  if (!menu || menuOpen) return;
  menuOpen = true;
  clearTimeout(menuHideTimer);
  menu.hidden = false;
  $$('[data-mm]', menu).forEach((el, i) => el.style.setProperty('--mm-i', i));
  menu.getBoundingClientRect(); // commit start state before transitioning
  raf(() => menu.classList.add('is-open'));
  menuBtn.setAttribute('aria-expanded', 'true');
  html.classList.add('menu-open');
  lockScroll(true);
  setInert(true);
  setTimeout(() => { if (menuOpen) (menu.querySelector('[aria-current]') || menu.querySelector('a'))?.focus({ preventScroll: true }); }, 120);
  d.addEventListener('keydown', onMenuKey);
}
function closeMenu(returnFocus = true) {
  if (!menu || !menuOpen) return;
  menuOpen = false;
  menu.classList.remove('is-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  html.classList.remove('menu-open');
  lockScroll(false);
  setInert(false);
  d.removeEventListener('keydown', onMenuKey);
  menuHideTimer = setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 650);
  if (returnFocus) menuBtn.focus({ preventScroll: true });
}
function onMenuKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
  if (e.key !== 'Tab') return;
  const items = [...focusables(header), ...focusables(menu)];
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  const i = items.indexOf(d.activeElement);
  if (e.shiftKey && (d.activeElement === first || i === -1)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (d.activeElement === last || i === -1)) { e.preventDefault(); first.focus(); }
}
if (menu && menuBtn) {
  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  menu.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    // same page (or hash on this page): just close (transitions.js scrolls a same-page link to the top instead of
    // reloading); other pages: the page transition covers the menu
    if (url.pathname === location.pathname) closeMenu(false);
  });
  // "Services" opens in place: the nine services + Who it's for, one tap from anywhere
  for (const btn of $$('[data-mm-toggle]', menu)) {
    const sub = d.getElementById(btn.getAttribute('aria-controls'));
    if (!sub) continue;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      sub.hidden = !open;
      if (open) $$('li', sub).forEach((li, i) => li.style.setProperty('--mm-j', i));
    });
  }
  matchMedia('(min-width: 62em)').addEventListener('change', (e) => { if (e.matches) closeMenu(false); });
}

/* ---------------------------------------------------------------- services panel (desktop) */
for (const item of $$('[data-nav-panel]')) {
  const btn = item.querySelector('.site-nav__toggle');
  let t;
  const set = (open) => {
    clearTimeout(t);
    item.classList.toggle('is-open', open);
    btn?.setAttribute('aria-expanded', String(open));
  };
  btn?.addEventListener('click', () => set(!item.classList.contains('is-open')));
  item.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { clearTimeout(t); t = setTimeout(() => set(true), 90); } });
  item.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { clearTimeout(t); t = setTimeout(() => set(false), 220); } });
  item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) set(false); });
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && item.classList.contains('is-open')) { e.stopPropagation(); set(false); btn?.focus(); }
  });
  d.addEventListener('pointerdown', (e) => { if (!item.contains(e.target)) set(false); }, passive);
  // mark the current service inside the panel
  for (const a of $$('.nav-panel a', item)) {
    if (new URL(a.href).pathname === location.pathname) a.setAttribute('aria-current', 'page');
  }
}

// the current service inside the mobile menu's Services list
for (const a of $$('.mobile-menu__sub a')) {
  if (new URL(a.href).pathname === location.pathname) a.setAttribute('aria-current', 'page');
}

/* ---------------------------------------------------------------- active nav fallback */
(function activeNav() {
  if (d.querySelector('.site-nav [aria-current]') || d.body.classList.contains('page-404')) return;
  const seg = location.pathname.split('/')[1] || '';
  const key = { '': 'home', about: 'about', 'hr-starter-pack': 'starter', services: 'services', pricing: 'pricing', contact: 'contact', consultation: 'consultation', 'who-its-for': 'who' }[seg];
  if (!key) return;
  const exact = location.pathname.split('/').filter(Boolean).length <= 1;
  for (const el of $$(`[data-nav="${key}"]`)) el.setAttribute('aria-current', exact ? 'page' : 'true');
})();

/* ---------------------------------------------------------------- split-line headlines */
const splitEls = new Set();
function splitLines(el) {
  if (!el._hcOrig) el._hcOrig = el.innerHTML;
  el.innerHTML = el._hcOrig;
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const tokens = [];
  const frag = d.createDocumentFragment();
  // words only break at real whitespace: an inline element in the middle of a word (e.g. a kerned apostrophe
  // <span class="ap">’</span> in "Let’s", or a nowrap span) joins the word it sits in instead of becoming its own token
  let word = null;
  const piece = (node) => {
    if (!word) { word = d.createElement('span'); word.className = 'split-word'; frag.append(word); tokens.push(word); }
    word.append(node);
  };
  const space = () => { if (word) { frag.append(' '); tokens.push(' '); } word = null; };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) space(); else piece(d.createTextNode(part));
      }
    } else if (node.nodeName === 'BR') {
      space(); tokens.push('br');
    } else if (node.nodeType === 1 && !node.children.length && /\s/.test(node.textContent.trim())) {
      // a multi-word inline element (e.g. <em>two words</em>): one clone per word
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { space(); continue; }
        const c = node.cloneNode(false); c.textContent = part; piece(c);
      }
    } else if (node.nodeType === 1) {
      piece(node.cloneNode(true));
    }
  }
  el.textContent = '';
  el.append(frag);
  // group words into lines by their rendered top
  const lines = [];
  let cur = null, top = null, forceBreak = false;
  for (const t of tokens) {
    if (t === 'br') { forceBreak = true; continue; }
    if (t === ' ') continue;
    const y = t.offsetTop;
    if (!cur || forceBreak || Math.abs(y - top) > 3) { cur = []; lines.push(cur); top = y; forceBreak = false; }
    cur.push(t);
  }
  const visual = d.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  lines.forEach((words, i) => {
    const line = d.createElement('span');
    line.className = 'split-line';
    line.style.setProperty('--line-i', i);
    const inner = d.createElement('span');
    inner.className = 'split-line__inner';
    words.forEach((w, j) => { if (j) inner.append(' '); inner.append(w); });
    line.append(inner);
    visual.append(line);
  });
  const sr = d.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = label;
  el.textContent = '';
  el.append(sr, visual);
  el.classList.add('is-split');
  el._hcW = el.offsetWidth;
}
function initSplit(root = d) {
  const els = $$('[data-split]', root).filter((el) => !splitEls.has(el));
  if (!els.length) return;
  if (SHOT || reduced()) { els.forEach((el) => el.classList.add('is-split', 'is-in')); return; }
  const run = () => els.forEach((el) => { try { splitLines(el); splitEls.add(el); } catch { el.classList.add('is-split', 'is-in'); } });
  const fontsReady = d.fonts?.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve();
  return fontsReady.then(run);
}
addEventListener('resize', debounce(() => {
  for (const el of splitEls) if (el.isConnected && Math.abs(el.offsetWidth - (el._hcW || 0)) > 2) splitLines(el);
}, 200), passive);

/* ---------------------------------------------------------------- reveal on scroll (with hierarchy + stagger) */
let revealIO;
const docOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
function reveal(el, i = 0) {
  if (el.hasAttribute('data-reveal-group')) {
    $$('[data-reveal],[data-split],[data-draw]', el).forEach((c, j) => { c.style.setProperty('--reveal-i', Math.min(j, 10)); c.classList.add('is-in'); revealIO?.unobserve(c); });
    el.classList.add('is-in');
    return;
  }
  if (!el.style.getPropertyValue('--reveal-i')) el.style.setProperty('--reveal-i', Math.min(i, 8));
  if (el.hasAttribute('data-split')) el.style.setProperty('--reveal-base', `${Math.min(i, 8) * 80}ms`);
  el.classList.add('is-in');
}
function revealTargets(root = d) {
  const groups = $$('[data-reveal-group]', root);
  const inGroup = (el) => groups.some((g) => g !== el && g.contains(el));
  return [...groups, ...$$('[data-reveal],[data-split],[data-draw]:not([data-draw="scroll"])', root).filter((el) => !inGroup(el))];
}
function initReveal(root = d) {
  const targets = revealTargets(root);
  if (SHOT || reduced() || !('IntersectionObserver' in window)) {
    for (const el of targets) { el.classList.add('is-in'); $$('[data-reveal],[data-split],[data-draw]', el).forEach((c) => c.classList.add('is-in')); }
    return;
  }
  revealIO ??= new IntersectionObserver((entries) => {
    const hits = entries.filter((e) => e.isIntersecting)
      .flatMap((e) => (proxyOf.has(e.target) ? [...proxyOf.get(e.target), ...(e.target._hcRevealSelf ? [e.target] : [])] : [e.target]))
      .sort(docOrder);
    hits.forEach((el, i) => { revealIO.unobserve(el._hcIOTarget || el); reveal(el, i); });
  }, { rootMargin: '0px 0px -9% 0px', threshold: 0.12 });
  targets.forEach((el) => {
    // "clip" / "arch" reveals start clipped to nothing, and IntersectionObserver measures the target's own clip-path,
    // so it would never see them: watch the (unclipped) parent instead, and release the rectangular clip afterwards so
    // the element's soft paper-layer shadow is not cut off
    if (/^(clip|arch)$/.test(el.getAttribute('data-reveal') || '') && el.parentElement) {
      el._hcIOTarget = el.parentElement;
      if (!proxyOf.has(el.parentElement)) proxyOf.set(el.parentElement, new Set());
      proxyOf.get(el.parentElement).add(el);
      const release = (e) => {
        if (e.target !== el || e.propertyName !== 'clip-path' || !el.classList.contains('is-in')) return;
        el.style.clipPath = 'none';
        el.removeEventListener('transitionend', release);
      };
      el.addEventListener('transitionend', release);
    } else el._hcRevealSelf = true;
    revealIO.observe(el._hcIOTarget || el);
  });
}
const proxyOf = new WeakMap();

/* ---------------------------------------------------------------- magnetic buttons (fine pointers only) */
function initMagnetic(root = d) {
  for (const el of $$('[data-magnetic]', root)) {
    if (el._hcMag) continue;
    el._hcMag = true;
    let rect = null, frame = 0, px = 0, py = 0;
    const strength = parseFloat(el.dataset.magnetic) || 0.3;
    const label = el.querySelector('.btn__label');
    const apply = () => {
      frame = 0;
      if (!rect) return;
      const dx = px - (rect.left + rect.width / 2), dy = py - (rect.top + rect.height / 2);
      el.style.setProperty('--mx', `${(dx * strength).toFixed(2)}px`);
      el.style.setProperty('--my', `${(dy * strength * 1.2).toFixed(2)}px`);
      if (label) { label.style.setProperty('--lx', `${(dx * strength * 0.35).toFixed(2)}px`); label.style.setProperty('--ly', `${(dy * strength * 0.35).toFixed(2)}px`); }
    };
    el.addEventListener('pointerenter', (e) => { if (!fine() || e.pointerType !== 'mouse') return; rect = el.getBoundingClientRect(); el.classList.add('is-magnetic'); }, passive);
    el.addEventListener('pointermove', (e) => { if (!rect) return; px = e.clientX; py = e.clientY; frame ||= raf(apply); }, passive);
    el.addEventListener('pointerleave', () => {
      rect = null;
      el.classList.remove('is-magnetic');
      el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px');
      label?.style.setProperty('--lx', '0px'); label?.style.setProperty('--ly', '0px');
    }, passive);
  }
}

/* ---------------------------------------------------------------- card tilt (fine pointers only, transform only) */
function initTilt(root = d) {
  for (const el of $$('[data-tilt]', root)) {
    if (el._hcTilt) continue;
    el._hcTilt = true;
    const max = parseFloat(el.dataset.tilt) || 5;
    let rect = null, frame = 0, px = 0.5, py = 0.5;
    const apply = () => {
      frame = 0;
      if (!rect) return;
      el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-(py - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
    };
    el.addEventListener('pointerenter', (e) => { if (!fine() || e.pointerType !== 'mouse') return; rect = el.getBoundingClientRect(); setTimeout(() => rect && el.classList.add('is-tilting'), 180); }, passive);
    el.addEventListener('pointermove', (e) => {
      if (!rect) return;
      px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      frame ||= raf(apply);
    }, passive);
    el.addEventListener('pointerleave', () => {
      rect = null;
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    }, passive);
  }
}

/* ---------------------------------------------------------------- arch-topped cards: true semicircle tops */
const archRO = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
  for (const e of entries) {
    const w = e.borderBoxSize?.[0]?.inlineSize ?? e.target.offsetWidth;
    e.target.style.setProperty('--aw', `${(w / 2).toFixed(1)}px`);
  }
}) : null;
function initArch(root = d) { for (const el of $$('.card--arch,[data-arch]', root)) archRO?.observe(el); }

/* ---------------------------------------------------------------- parallax + scroll-scrubbed line draws */
const px = { items: [], vh: innerHeight };
function measureParallax() {
  px.vh = innerHeight;
  for (const it of px.items) {
    it.el.style.translate = '';
    const r = it.el.getBoundingClientRect();
    it.top = r.top + scrollY; it.h = r.height;
  }
  updateParallax();
}
function updateParallax() {
  const y = lastY, vh = px.vh;
  for (const it of px.items) {
    if (!it.visible) continue;
    const center = it.top + it.h / 2 - y - vh / 2;
    if (it.kind === 'parallax') {
      const ty = clamp(-center * it.speed, -240, 240);
      it.el.style.translate = `0 ${ty.toFixed(1)}px`;
    } else {
      const p = clamp((vh - (it.top - y)) / (vh * 0.9 + it.h * 0.4), 0, 1);
      it.el.style.setProperty('--draw', p.toFixed(3));
      it.svg?.style.setProperty('--draw', p.toFixed(3));
    }
  }
}
function initParallax(root = d) {
  if (SHOT || reduced()) { $$('[data-draw="scroll"]', root).forEach((el) => el.classList.add('is-in')); return; }
  const fresh = [
    ...$$('[data-parallax]', root).map((el) => ({ el, kind: 'parallax', speed: parseFloat(el.dataset.parallax) || 0.12 })),
    ...$$('[data-draw="scroll"]', root).map((el) => ({ el, kind: 'draw', svg: el.querySelector('svg') })),
  ].filter((it) => !it.el._hcPx);
  if (!fresh.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { const it = px.items.find((x) => x.el === e.target); if (it) it.visible = e.isIntersecting; }
    updateParallax();
  }, { rootMargin: '25% 0px 25% 0px' });
  for (const it of fresh) { it.el._hcPx = true; px.items.push(it); io.observe(it.el); }
  measureParallax();
  scrollers.add(updateParallax);
}
addEventListener('resize', debounce(() => { if (px.items.length) measureParallax(); initGround(); syncGround(); }, 180), passive);
addEventListener('load', () => { if (px.items.length) measureParallax(); }, { once: true });

/* ---------------------------------------------------------------- modals (native <dialog>) */
function openModal(target) {
  const dlg = typeof target === 'string' ? d.getElementById(target) : target;
  if (!dlg || dlg.open) return;
  dlg.classList.remove('is-closing');
  dlg.showModal();
  lockScroll(true);
  dlg.dispatchEvent(new CustomEvent('hc:modal-open', { bubbles: true }));
}
function closeModal(target) {
  const dlg = typeof target === 'string' ? d.getElementById(target) : target;
  if (!dlg || !dlg.open || dlg.classList.contains('is-closing')) return;
  const done = () => { dlg.classList.remove('is-closing'); dlg.close(); if (!d.querySelector('dialog[open]') && !menuOpen) lockScroll(false); };
  if (reduced() || SHOT) return done();
  dlg.classList.add('is-closing');
  setTimeout(done, 280);
}
d.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-modal-open]');
  if (opener) { e.preventDefault(); openModal(opener.getAttribute('data-modal-open') || opener.getAttribute('aria-controls')); return; }
  const closer = e.target.closest('[data-modal-close]');
  if (closer) { e.preventDefault(); closeModal(closer.closest('dialog')); return; }
  if (e.target instanceof HTMLDialogElement && e.target.open && downOnBackdrop === e.target) closeModal(e.target);
});
let downOnBackdrop = null;
d.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target instanceof HTMLDialogElement ? e.target : null; }, passive);
d.addEventListener('cancel', (e) => { if (e.target instanceof HTMLDialogElement) { e.preventDefault(); closeModal(e.target); } }, true);
d.addEventListener('close', (e) => { if (e.target instanceof HTMLDialogElement && !d.querySelector('dialog[open]') && !menuOpen) lockScroll(false); }, true);

/* ---------------------------------------------------------------- back to top */
d.addEventListener('click', (e) => {
  const a = e.target.closest('[data-to-top]');
  if (!a) return;
  e.preventDefault();
  scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  (d.getElementById('main') || main)?.focus({ preventScroll: true });
});

/* ---------------------------------------------------------------- boot */
function refresh(root = d) {
  syncGround();
  initArch(root);
  initMagnetic(root);
  initTilt(root);
  initParallax(root);
  const split = initSplit(root);
  const go = () => initReveal(root);
  if (split && typeof split.then === 'function') split.then(go); else go();
}
function boot() {
  onHeaderScroll();
  initGround();
  syncGround();
  // when arriving through a page transition, hold entrance animations until the brand layer starts lifting
  if (html.classList.contains('pt-enter') && !SHOT && !reduced()) {
    initArch(); initMagnetic(); initTilt(); initParallax();
    const splitting = initSplit();
    let started = false;
    const start = () => { if (started) return; started = true; if (splitting) splitting.then(() => initReveal()); else initReveal(); };
    addEventListener('hc:pt-reveal', start, { once: true });
    setTimeout(start, 1400);
  } else {
    refresh();
  }
  html.classList.add('is-booted');
}
boot();

/* bfcache restore: never leave menus/overlays open */
addEventListener('pageshow', (e) => { if (e.persisted) { closeMenu(false); for (const dlg of $$('dialog[open]')) dlg.close(); lockScroll(false); lastY = scrollY; onHeaderScroll(); } });

/* ---------------------------------------------------------------- phone sticky call to action
   <a class="sticky-cta" data-sticky-cta> (footer partial). Phones only (CSS). Slides in once the first screen has
   scrolled away; steps aside while a CTA band, a form or the footer is on screen, and never shows on /consultation/.
   Pages can mark more areas with [data-cta-zone]. */
const sticky = d.querySelector('[data-sticky-cta]');
if (sticky && !SHOT && !/^\/consultation(\/|$)/.test(location.pathname) && 'IntersectionObserver' in window) {
  const zones = new Set();
  let past = false, on = false;
  const set = () => {
    const v = past && zones.size === 0;
    if (v === on) return;
    on = v;
    sticky.classList.toggle('is-on', v);
  };
  const zio = new IntersectionObserver((es) => {
    for (const e of es) { if (e.isIntersecting) zones.add(e.target); else zones.delete(e.target); }
    set();
  }, { rootMargin: '0px 0px -6% 0px' });
  const watchZones = () => $$('.cta-band, [data-cta-zone], .site-footer, main form').forEach((el) => zio.observe(el));
  watchZones();
  scrollers.add((y) => { const p = y > innerHeight * 0.85; if (p !== past) { past = p; set(); } });
}

const HC = {
  reduced, fine, shot: SHOT, refresh, openModal, closeModal, openMenu, closeMenu, splitLines, reveal,
  onScroll: (fn) => { scrollers.add(fn); return () => scrollers.delete(fn); },
  /** scroll position captured in the last scroll event (read this inside rAF instead of window.scrollY) */
  scrollY: () => lastY,
};
window.HC = HC;
export default HC;
export { reduced, fine, SHOT, refresh, openModal, closeModal };
