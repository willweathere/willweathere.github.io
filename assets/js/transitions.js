/* HCLabs — branded page transitions between real pages.
   Leave (~360ms): a navy doorway opens from the link you clicked — an arch-shaped clip grows from that point until it
   fills the screen, the doorway mark lands in its centre (the terracotta head last), then we navigate. The header stays
   above the layer, so the navigation never disappears; only the page swaps.
   Enter: the inline head script adds html.pt-enter (the new page paints under the navy layer); we lift the layer away
   with an arch-shaped lower edge (.5s) and fire 'hc:pt-reveal' so entrance animations start as it lifts.
   Same-page links (the logo or Home on the homepage) never reload: they scroll back to the top.
   Never traps navigation: modified/new-tab/download/hash/mailto/tel/external links are untouched, reduced motion and
   ?shot=1 navigate instantly, a failsafe clears the layer, and bfcache restores are handled on pageshow.
   Events: window 'hc:pt-leave' {detail:{href}} before leaving · window 'hc:pt-reveal' when the new page starts revealing. */

const d = document;
const html = d.documentElement;
const SHOT = html.classList.contains('shot');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const KEY = 'hc:pt';
const EXIT_MS = 360;       // doorway opens + mark lands, then navigate
const HARD_MS = 8000;      // if we are somehow still here (download, 204, blocked navigation), uncover
let leaving = false, navTimer = 0, failTimer = 0, cleanTimer = 0;

/* ---------------------------------------------------------------- enter */
function reveal() {
  if (!html.classList.contains('pt-enter')) return;
  let done = false;
  const lift = () => {
    if (done) return;
    done = true;
    html.classList.add('pt-reveal');
    dispatchEvent(new CustomEvent('hc:pt-reveal'));
    clearTimeout(cleanTimer);
    cleanTimer = setTimeout(() => html.classList.remove('pt-enter', 'pt-reveal'), 900);
  };
  // two frames so the covered state is painted first; the timeout covers hidden tabs (no rAF there)
  const go = () => { requestAnimationFrame(() => requestAnimationFrame(lift)); setTimeout(lift, 160); };
  // give the (preloaded) fonts a moment so the page is revealed settled, but never wait long
  const fonts = d.fonts?.ready;
  if (fonts && d.fonts.status !== 'loaded') Promise.race([fonts, new Promise((r) => setTimeout(r, 120))]).then(go); else go();
}

/* ---------------------------------------------------------------- leave */
const SKIP_EXT = /\.(pdf|zip|png|jpe?g|webp|avif|gif|svg|docx?|xlsx?|pptx?|csv|txt|xml|json|webmanifest|mp4|mov|mp3)$/i;
function linkUrl(e, a) {
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return null;
  const target = a.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return null;
  if ((a.getAttribute('rel') || '').includes('external')) return null;
  const raw = a.getAttribute('href') || '';
  if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|javascript):/i.test(raw)) return null;
  let url;
  try { url = new URL(a.href, location.href); } catch { return null; }
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
  if (SKIP_EXT.test(url.pathname)) return null;
  return url;
}
const samePage = (url) => url.pathname === location.pathname && url.search === location.search;
function eligible(e, a) {
  const url = linkUrl(e, a);
  return url && !samePage(url) ? url : null;
}
function reset() {
  clearTimeout(navTimer); clearTimeout(failTimer);
  leaving = false;
  html.classList.remove('is-leaving');
  const cover = d.querySelector('.pt__cover');
  if (cover) { cover.style.transition = 'none'; cover.style.clipPath = ''; }
}

/* the doorway: an arch-topped inset() clip, from a small door at the click point to one that covers the viewport */
const px = (n) => `${n.toFixed(1)}px`;
function door(t, r, b, l, rad) { return `inset(${px(t)} ${px(r)} ${px(b)} ${px(l)} round ${px(rad)} ${px(rad)} 0px 0px)`; }
function openDoor(x, y) {
  const cover = d.querySelector('.pt__cover');
  if (!cover) return;
  const W = innerWidth, H = innerHeight;
  const w0 = 44, h0 = 60;
  const start = door(y - h0 * 0.62, W - (x + w0 / 2), H - (y + h0 * 0.38), x - w0 / 2, w0 / 2);
  // the final arch is wider than the screen and its crown sits above the top edge, so its curve never shows
  const side = W * 0.16, R = (W + side * 2) / 2;
  const end = door(-R * 1.02, -side, -2, -side, R);
  cover.style.transition = 'none';
  cover.style.clipPath = start;
  cover.getBoundingClientRect();
  cover.style.transition = '';
  requestAnimationFrame(() => { cover.style.clipPath = end; });
}
function leave(href, x, y) {
  if (leaving) return;
  leaving = true;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked: new page simply won't cover */ }
  clearTimeout(cleanTimer);
  html.classList.remove('pt-enter', 'pt-reveal');
  openDoor(x, y);
  html.classList.add('is-leaving');
  dispatchEvent(new CustomEvent('hc:pt-leave', { detail: { href } }));
  navTimer = setTimeout(() => location.assign(href), EXIT_MS);
  failTimer = setTimeout(reset, HARD_MS);
}
function toTop() {
  window.HC?.closeMenu?.(false);
  scrollTo({ top: 0, behavior: mqReduce.matches ? 'auto' : 'smooth' });
  (d.getElementById('main') || d.querySelector('main'))?.focus({ preventScroll: true });
}
d.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  const url = linkUrl(e, a);
  if (!url) return;
  if (samePage(url)) {
    // the logo / Home on this very page: back to the top, no reload (a #hash keeps its native in-page jump)
    if (url.hash && url.hash !== '#') return;
    e.preventDefault();
    toTop();
    return;
  }
  if (leaving) { e.preventDefault(); return; }
  if (mqReduce.matches || SHOT) return; // instant, native navigation
  e.preventDefault();
  // origin: the pointer for mouse/touch clicks, the element's centre for keyboard activation
  let x = e.clientX, y = e.clientY;
  if (!(e.detail > 0) || (x === 0 && y === 0)) {
    const r = a.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + r.height / 2;
  }
  leave(url.href, Math.min(innerWidth, Math.max(0, x)), Math.min(innerHeight, Math.max(0, y)));
});

/* ---------------------------------------------------------------- intent prefetch (hover / focus / touch) */
const prefetched = new Set([location.pathname]);
function prefetch(e) {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a) return;
  const url = eligible({ button: 0 }, a);
  if (!url || prefetched.has(url.pathname)) return;
  if (navigator.connection?.saveData) return;
  prefetched.add(url.pathname);
  const l = d.createElement('link');
  l.rel = 'prefetch';
  l.href = url.pathname + url.search;
  d.head.append(l);
}
d.addEventListener('pointerover', prefetch, { passive: true });
d.addEventListener('focusin', prefetch, { passive: true });
d.addEventListener('touchstart', prefetch, { passive: true });

/* ---------------------------------------------------------------- bfcache / history */
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const wasLeaving = html.classList.contains('is-leaving');
  reset();
  if (wasLeaving && !mqReduce.matches && !SHOT) {
    // restored mid-transition: swap the doorway for the lifting layer and reveal
    html.classList.add('pt-enter');
    reveal();
  } else {
    html.classList.remove('pt-enter', 'pt-reveal');
  }
});
addEventListener('pagehide', () => { clearTimeout(failTimer); });

reveal();
