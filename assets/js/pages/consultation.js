/* HCLabs — /consultation/ behaviour.
   1 hero: the opening door (3D, loaded straight away: it is the first thing you see) + fallback choreography
   2 every "Book a Free Consultation" link on this page (hero CTA, header, menu, footer) glides to the form and focuses it
   3 the form: validation + Netlify Forms submit (forms.js), ?topic= preselect, loading label, success / error states
   ?shot=1 and reduced motion get settled, composed states. */
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';
import { initForm } from '/assets/js/forms.js';

const d = document;
const html = d.documentElement;
const SHOT = HC.shot;
const still = () => SHOT || HC.reduced();
const $ = (s, r = d) => r.querySelector(s);
const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
const passive = { passive: true };
const PARAMS = new URLSearchParams(location.search);

/* review helpers (screenshots only): a very tall shot window keeps the hero at a sensible height;
   ?from=request drops the hero; ?form=success|error|invalid shows that form state; ?scroll=N scrolls after load */
if (SHOT && innerHeight > 1500) html.classList.add('shot-tall');
if (SHOT && PARAMS.get('from') === 'request') {
  const hero = $('.cons-hero');
  if (hero) hero.hidden = true;
  const req = $('#request');
  if (req) { req.style.marginTop = '0'; req.style.paddingTop = `calc(var(--header-h) + ${getComputedStyle(req).paddingTop})`; }
}
if (SHOT && PARAMS.has('scroll')) addEventListener('load', () => { scrollTo(0, +PARAMS.get('scroll') || 0); HC.refresh(); }, { once: true });

/* ================================================================== 1 · HERO — the door opens */
const stage = $('#door-stage');
let door = null;
if (stage) {
  // The fallback art is managed here (not by the engine) so it never double-exposes with the live world: hidden while
  // the world loads, shown with its own entrance only if the world is late or unavailable, and cut quickly once the
  // world is live. A late world skips its intro, so the swap is between two settled, near-identical compositions.
  let fbShown = false, wasLive = false;
  const showFallback = (animate) => {
    stage.classList.add('fb-on');
    if (fbShown) return;
    fbShown = true;
    if (animate) stage.classList.add('is-fb-in');
  };
  // SPEC §1: reduced motion, no WebGL2 and low-power devices keep the static art and never download three.js
  const webgl = hasWebGL2();
  const can3d = webgl && (SHOT || (!HC.reduced() && !lowPower()));
  // screenshots: the settled world; if a slow software renderer hasn't produced it yet, the settled art stands in
  // (and is cut as soon as the world goes live) so a capture never shows an empty stage
  if (SHOT && can3d) setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(false); }, 6000);
  else if (!can3d) showFallback(!still());
  else setTimeout(() => { if (stage.getAttribute('data-3d') !== 'live') showFallback(true); }, 2400);
  new MutationObserver(() => {
    const st = stage.getAttribute('data-3d');
    if (st === 'live') wasLive = true;
    else if (st === 'fallback' || wasLive) showFallback(!still() && !wasLive);
  }).observe(stage, { attributes: true, attributeFilter: ['data-3d'] });

  if (can3d) {
    // fetch the world's modules in parallel with the rest of the page (only for devices that will run it)
    for (const href of ['/assets/vendor/three.module.min.js', '/assets/js/3d/kit.js', '/assets/js/3d/scenes/consultation.js']) {
      const l = d.createElement('link');
      l.rel = 'modulepreload'; l.href = href;
      d.head.append(l);
    }
    // the stage sits under the copy on phones / portrait tablets (keep in step with consultation.css)
    const stacked = matchMedia('(max-width: 63.99em), (max-aspect-ratio: 5/6)');
    door = mount(stage, () => import('/assets/js/3d/scenes/consultation.js'), {
      eager: true,
      fallback: null,
      fadeMs: 700,
      scrollTarget: $('.cons-hero'),
      sceneOptions: { get stacked() { return stacked.matches; }, intro: () => !fbShown },
    });
    addEventListener('hc:pt-leave', () => door.pause(), passive);
    addEventListener('pageshow', (e) => { if (e.persisted) door.resume(); }, passive);
    // hovering / focusing the main CTA opens the doors a little wider
    const cta = $('.cons-hero__cta');
    if (cta) {
      const invite = (v) => door?.api?.invite?.(v);
      cta.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') invite(1); }, passive);
      cta.addEventListener('pointerleave', () => invite(0), passive);
      cta.addEventListener('focus', () => invite(1));
      cta.addEventListener('blur', () => invite(0));
    }
    // the doorway itself is a way in: pointer over it → it opens wider and shows a pointer; click / tap → the form
    // (the canvas is aria-hidden decoration; the CTA above is the accessible route to the same place)
    stage.addEventListener('hc3d:door-hover', (e) => stage.classList.toggle('is-door-hover', !!e.detail?.over));
    stage.addEventListener('click', (e) => {
      if (stage.getAttribute('data-3d') !== 'live' || !door?.api?.pickAt?.(e.clientX, e.clientY)) return;
      door.api.invite?.(1);
      setTimeout(() => door.api.invite?.(0), 1400);
      goToForm();
    });
  }
}

/* ================================================================== 2 · FORM */
const form = $('#consultation-form');
const card = $('.cons-card');
const select = $('#cf-topic');
const grid = $('.cons-form__grid');

/** ?topic=<slug> (e.g. hr-audits, starter-pack, starter-pack-consultation, other) or an option's exact text. */
function preselect(raw) {
  if (!select || !raw) return false;
  const norm = (s) => String(s).toLowerCase().replace(/&amp;|&/g, ' and ').replace(/[£]/g, '').replace(/[^a-z0-9+]+/g, '-').replace(/^-+|-+$/g, '');
  const key = norm(raw);
  const opt = $$('option', select).find((o) => o.value && ((o.dataset.topic || '').split(/\s+/).includes(key) || norm(o.value) === key));
  if (!opt) return false;
  select.value = opt.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));   // forms.js marks it valid
  const field = select.closest('.field');
  field?.classList.remove('is-preselected');
  void field?.offsetWidth;
  field?.classList.add('is-preselected');
  return true;
}

/* once sent, the card shrinks to its success state: settle the whole doorway card calmly in view under the header
   (replaces forms.js's generic "centre the message" scroll, which can leave the card's arch under the header) */
function settleOnCard() {
  if (!card) return;
  card.classList.add('is-sent');   // (measure the final, shorter card)
  const r = card.getBoundingClientRect();
  const top = headerOffset();
  const avail = innerHeight - top;
  const pad = Math.min(120, Math.max(0, (avail - r.height) / 2));
  scrollTo({ top: Math.max(0, r.top + scrollY - top - pad), behavior: still() ? 'auto' : 'smooth' });
}

if (form) {
  initForm(form, { success: 'consultation-success', onSuccess: settleOnCard });
  preselect(PARAMS.get('topic'));

  // loading label + a polite status for screen readers; the card drops its header once sent
  const label = $('[data-submit-label]', form);
  const status = $('[data-form-status]', form);
  const idleLabel = label?.textContent || 'Request Consultation';
  new MutationObserver(() => {
    const st = form.dataset.state;
    if (label) label.textContent = st === 'loading' ? 'Sending…' : idleLabel;
    if (status) status.textContent = st === 'loading' ? 'Sending your consultation request…' : '';
    if (st === 'success') card?.classList.add('is-sent');
  }).observe(form, { attributes: true, attributeFilter: ['data-state'] });

  // review states for screenshots
  if (SHOT && PARAMS.has('form')) {
    const want = PARAMS.get('form');
    if (want === 'success') { form.hidden = true; card?.classList.add('is-sent'); const s = $('#consultation-success'); if (s) s.hidden = false; }
    else if (want === 'error') { form.dataset.state = 'error'; const a = $('.form-alert', form); if (a) a.hidden = false; }
    else if (want === 'invalid') {
      $('#cf-email').value = 'sarah@business';
      $('#cf-phone').value = '0771';
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }
}

/* ================================================================== 3 · every consultation CTA on this page → the form */
const headerOffset = () => (($('.site-header__bar')?.offsetHeight) || 72) + 20;
function goToForm({ keyboard = false } = {}) {
  const target = (form && !form.hidden) ? grid || form : $('#consultation-success') || grid;
  if (!target) return;
  const y = Math.max(0, target.getBoundingClientRect().top + scrollY - headerOffset());
  const smooth = !still();
  scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  // keyboard and mouse users land in the first field; on touch we focus the heading (no surprise keyboard)
  const touch = matchMedia('(pointer: coarse)').matches;
  const focusEl = form && !form.hidden
    ? ((keyboard || !touch) ? $('#cf-name') : $('#request-title'))
    : $('#consultation-success');
  if (!focusEl) return;
  let done = false;
  const focus = () => { if (done) return; done = true; focusEl.focus({ preventScroll: true }); };
  if (!smooth) { focus(); return; }
  if ('onscrollend' in window) addEventListener('scrollend', focus, { once: true });
  setTimeout(focus, 1100);
}

d.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  let url;
  try { url = new URL(a.href, location.href); } catch { return; }
  const toThisPage = url.origin === location.origin && url.pathname === location.pathname && (!url.hash || url.hash === '#request');
  if (!a.hasAttribute('data-to-form') && !toThisPage) return;
  e.preventDefault();   // (also stops the page transition from reloading this page)
  const topic = url.searchParams.get('topic');
  if (topic) preselect(topic);
  const inMenu = !!a.closest('[data-menu]');
  if (inMenu) HC.closeMenu(false);
  setTimeout(() => goToForm({ keyboard: e.detail === 0 }), inMenu ? 80 : 0);
}, true);

/* arriving with #request (e.g. /consultation/?topic=hr-audits#request): land on the form, not the hero */
if (location.hash === '#request' && !SHOT) {
  addEventListener('load', () => setTimeout(() => {
    const y = Math.max(0, (grid || form).getBoundingClientRect().top + scrollY - headerOffset());
    scrollTo({ top: y, behavior: 'auto' });
  }, 60), { once: true });
}
