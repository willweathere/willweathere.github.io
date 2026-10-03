/* HCLabs — contact page behaviour.
   1 copy-to-clipboard for the email address and phone number (with a polite live-region confirmation)
   2 the conversation (3D, lazy): you and Sarah in her doorway, a message travelling the arc between you.
     The page tells the scene where it may draw (clear of the copy, above Sarah's card) and mirrors the same frame
     onto the static art, so the fallback and the live world line up.
   3 hovering / focusing a channel sends a message along the arc. */
import { mount, hasWebGL2 } from '/assets/js/3d/engine.js';

const d = document;
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const passive = { passive: true };
const debounce = (fn, t = 140) => { let id; return () => { clearTimeout(id); id = setTimeout(fn, t); }; };

let scene = null;   // scene api once the world is live
const ping = (kind) => scene?.ping?.(kind);

/* ================================================================== 1 · copy to clipboard */
const statusEl = $('[data-copy-status]');
function announce(msg) {
  if (!statusEl) return;
  statusEl.textContent = '';
  setTimeout(() => { statusEl.textContent = msg; }, 40);   // re-announce the same message on repeat copies
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = d.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    d.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = d.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
for (const btn of $$('[data-copy]')) {
  const label = $('[data-copy-label]', btn);
  const text = btn.dataset.copy;
  const what = btn.dataset.copyWhat || 'Text';
  let timer = 0;
  btn.hidden = false;   // shipped hidden: without this script the button would do nothing
  const value = btn.closest('.ct-channel')?.querySelector('.ct-channel__value');
  btn.addEventListener('click', async () => {
    const ok = await copyText(text);
    clearTimeout(timer);
    btn.classList.toggle('is-copied', ok);
    btn.classList.toggle('is-failed', !ok);
    if (ok) {
      if (label) label.textContent = 'Copied';
      announce(`${what} copied to the clipboard: ${text}`);
      ping(btn.dataset.ping);
    } else {
      // the browser refused the clipboard: select the visible text instead, so a copy shortcut / long-press finishes the job
      let selected = false;
      if (value) {
        try { const sel = getSelection(); sel.removeAllRanges(); sel.selectAllChildren(value); selected = !sel.isCollapsed; } catch { /* nothing to select */ }
      }
      if (label) label.textContent = selected ? 'Selected' : 'Copy failed';
      announce(selected
        ? `Couldn't copy automatically, so the ${what.toLowerCase()} is selected for you: ${text}`
        : `Couldn't copy automatically. The ${what.toLowerCase()} is ${text}`);
    }
    timer = setTimeout(() => {
      btn.classList.remove('is-copied', 'is-failed');
      if (label) label.textContent = 'Copy';
    }, ok ? 2600 : 4200);
  });
}

/* ================================================================== 2 · the conversation (3D) */
const stage = $('#ct-stage');
const person = $('.ct-person');
const hero = $('.ct-hero');
const bar = $('.site-header__bar');
const copyCol = $('.ct-hero__copy');
const mqSide = matchMedia('(min-width: 64em)');   // keep in step with contact.css: world beside the copy vs stacked under it

/* Layout boxes relative to the hero, WITHOUT transforms. Sarah's card rises in with the shared reveal
   (translateY 28px → 0), and a page transition may move <main>; getBoundingClientRect() would measure the card
   mid-flight and the world would stand on a floor that isn't there any more. Offsets are the settled layout. */
function box(el) {
  let x = 0, y = 0, n = el;
  while (n && n !== hero) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  if (n !== hero) {   // hero isn't on the offset chain (unexpected layout): fall back to rects, minus any transform on el
    const r = el.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    const tf = getComputedStyle(el).transform, m = new DOMMatrixReadOnly(tf && tf !== 'none' ? tf : undefined);
    x = r.left - hr.left - m.m41; y = r.top - hr.top - m.m42;
  }
  return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
}

/* Where the world may draw, in stage pixels: { l, r, t, b } + the disc { x, y, r }. The subject (you, the arc, the
   doorway) is fitted into l..r × t..b and stands on b; the disc is pinned near the top-right corner, cropped by the
   page edge like the brand art. */
function region() {
  const s = box(stage);
  const w = s.width || 1, h = s.height || 1;
  const p = person ? box(person) : null;
  if (mqSide.matches) {
    const top = (bar?.offsetHeight || 84) + 22;
    const floor = p ? p.top - s.top - clamp(h * 0.045, 26, 48) : h * 0.62;
    const discR = clamp(Math.min(w * 0.25, h * 0.22), 100, 215);
    const clear = copyCol ? box(copyCol).right - s.left + clamp(w * 0.06, 32, 72) : w * 0.16;
    const right = p ? Math.min(w * 0.92, p.right - s.left + w * 0.02) : w * 0.9;
    // with the full nav the disc may pass behind the (filled) header button; with the outlined Menu button (< 70em) it stays below the bar
    const discY = matchMedia('(min-width: 70em)').matches ? top + discR * 0.3 : (bar?.offsetHeight || 84) + discR + 8;
    return { l: Math.max(w * 0.08, clear), r: right, t: top, b: Math.max(top + 160, floor), disc: { x: w - discR * 0.16, y: discY, r: discR } };
  }
  // stacked: the stage is its own full-bleed band; Sarah's card rises over its lower edge
  const floor = p ? Math.min(h * 0.96, p.top - s.top - 14) : h * 0.82;
  const discR = clamp(w * 0.2, 64, 150);
  const t = h * 0.07;
  return { l: w * 0.07, r: w * 0.93, t, b: Math.max(t + 120, floor), disc: { x: w - discR * 0.34, y: Math.max(discR * 1.06, h * 0.36), r: discR } };
}

/* hasWebGL2() only checks that the API exists; where WebGL is blocked or blacklisted, three.js then fails inside the
   engine with a console error. Ask for a real context once (and hand it straight back): those devices simply keep
   the static art. */
function webgl2Works() {
  try {
    const gl = d.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

function applyRegion() {
  if (!stage) return;
  const r = region();
  const st = stage.style;
  st.setProperty('--reg-l', `${r.l.toFixed(1)}px`);
  st.setProperty('--reg-r', `${r.r.toFixed(1)}px`);
  st.setProperty('--reg-t', `${r.t.toFixed(1)}px`);
  st.setProperty('--reg-b', `${r.b.toFixed(1)}px`);
  st.setProperty('--disc-x', `${r.disc.x.toFixed(1)}px`);
  st.setProperty('--disc-y', `${r.disc.y.toFixed(1)}px`);
  st.setProperty('--disc-r', `${r.disc.r.toFixed(1)}px`);
  return r;
}

if (stage) {
  applyRegion();
  const reframe = () => { applyRegion(); scene?.reframe?.(); };
  addEventListener('resize', debounce(reframe), passive);
  addEventListener('load', reframe, { once: true });
  d.fonts?.ready?.then(reframe);
  mqSide.addEventListener?.('change', reframe);
  if ('ResizeObserver' in window && person) new ResizeObserver(debounce(reframe, 60)).observe(person);
  // backstop: once the card has finished rising in, frame against where it actually stands
  person?.addEventListener('transitionend', (e) => { if (e.target === person && e.propertyName === 'transform') reframe(); });

  if (hasWebGL2() && webgl2Works()) {
    // The static art is held back while the world loads (the type leads the first beat and the world stages its own
    // entrance). If the world is late or unavailable the art comes in instead, and a late world then skips its
    // entrance, so the cross-fade is between two matching, settled compositions. Screenshots / reduced motion: the
    // art shows at once and the engine swaps in the settled frame.
    const still = d.documentElement.classList.contains('shot') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fbShown = still;
    const showFallback = () => { fbShown = true; stage.classList.remove('fb-hold'); };
    if (!still) {
      stage.classList.add('fb-hold');
      setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(); }, 2200);
      new MutationObserver(() => { if (stage.getAttribute('data-3d') === 'fallback') showFallback(); })
        .observe(stage, { attributes: true, attributeFilter: ['data-3d'] });
    }
    // Mount once the type has settled: the hero's height (and so the stage and the region) depends on the web fonts.
    // three.js itself still loads only when the stage comes near the viewport.
    const fontsReady = d.fonts?.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
    fontsReady.then(() => {
      applyRegion();
      const handle = mount(stage, () => import('/assets/js/3d/scenes/contact.js'), {
        scrollTarget: hero,
        fadeMs: 700,
        // always measure afresh: the engine's own ResizeObserver may resize the world before any page event fires
        sceneOptions: { region: () => applyRegion(), intro: () => !fbShown },
      });
      handle.ready.then((api) => { scene = api && typeof api.ping === 'function' ? api : null; if (scene) setTimeout(reframe, 0); });
      addEventListener('hc:pt-leave', () => handle.pause(), passive);
      addEventListener('pageshow', (e) => { if (e.persisted) handle.resume(); }, passive);
    });
  } else {
    stage.setAttribute('data-3d', 'fallback');   // no world on this device: the static art is the scene
  }
}

/* ================================================================== 3 · channels speak to the world */
for (const a of $$('.ct-channel__link[data-ping]')) {
  const kind = a.dataset.ping;
  a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') ping(kind); }, passive);
  a.addEventListener('focus', () => { if (a.matches(':focus-visible')) ping(kind); });
}

/* ================================================================== 4 · Sarah's card arrives with the hero
   On phones its top edge only just peeks into the first screen: below the shared reveal threshold, so the first view
   would end on an empty band. When any of it is on screen once the type has settled, bring it in with the hero. */
if (person && person.hasAttribute('data-reveal') && !person.classList.contains('is-in')) {
  const settle = d.fonts?.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
  settle.then(() => requestAnimationFrame(() => {
    const r = person.getBoundingClientRect();
    if (r.top < innerHeight - 4 && r.bottom > 0 && !person.classList.contains('is-in')) {
      if (window.HC?.reveal) window.HC.reveal(person); else person.classList.add('is-in');
    }
  }));
}

