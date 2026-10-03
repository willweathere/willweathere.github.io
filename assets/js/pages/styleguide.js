// Styleguide page: demo form + chips
import { initForm } from '/assets/js/forms.js';

const form = document.getElementById('sg-form');
const api = initForm(form, { success: 'sg-form-success' });
document.querySelector('[data-sg-reset]')?.addEventListener('click', () => { api?.reset(); form.querySelector('input')?.focus(); });

for (const group of document.querySelectorAll('[data-chips]')) {
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    for (const c of group.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === chip));
  });
}

// Review helper: /styleguide/?from=<section-id> drops the sections above it (for screenshots of long pages)
const from = new URLSearchParams(location.search).get('from');
const start = from && document.getElementById(from);
if (start) {
  let el = start.parentElement === document.querySelector('main') ? start : start.closest('main > *');
  while (el?.previousElementSibling) el.previousElementSibling.remove();
  window.HC?.refresh();
}

// Review helper: ?open=menu | modal | services opens that state (for screenshots)
const open = new URLSearchParams(location.search).get('open');
if (open) setTimeout(() => {
  if (open === 'menu') window.HC?.openMenu();
  if (open === 'modal') window.HC?.openModal('sg-dialog');
  if (open === 'services') document.querySelector('.site-nav__toggle')?.click();
}, 300);
if (open === 'leaving') document.documentElement.classList.add('is-leaving');
const sy = +new URLSearchParams(location.search).get('scroll');
if (sy) addEventListener('load', () => scrollTo(0, sy));
