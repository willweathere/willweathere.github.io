/* HCLabs — accessible form helper (validation + Netlify Forms submit + loading/success/error states).
   Usage (page script):  import { initForm } from '/assets/js/forms.js'; initForm(document.querySelector('#consultation-form'));
   Markup contract: see /styleguide/#forms. Each control sits in .field with a .field__error (id referenced by aria-describedby).
   Options: { success: Element|id, endpoint: '/', onSuccess(form), onError(form, err) }.
   form[data-demo] simulates the request (styleguide) — never use it on a real form. */

const encode = (fd) => new URLSearchParams(Array.from(fd.entries()).map(([k, v]) => [k, typeof v === 'string' ? v : v.name])).toString();

function labelText(field) {
  const l = field.querySelector('.field__label');
  return (l?.childNodes[0]?.textContent || l?.textContent || 'this field').trim().toLowerCase();
}

function messageFor(input, field) {
  const v = input.validity;
  const ds = input.dataset;
  if (v.valueMissing) return ds.errorRequired || (input.tagName === 'SELECT' ? 'Please choose an option.' : `Please enter your ${labelText(field)}.`);
  if (v.typeMismatch && input.type === 'email') return ds.errorEmail || 'Please enter a valid email address, like name@business.co.uk.';
  if (v.patternMismatch) return ds.errorPattern || 'Please check the format of this field.';
  if (v.tooShort) return ds.errorShort || `Please add a little more detail (at least ${input.minLength} characters).`;
  if (v.tooLong) return `Please keep this under ${input.maxLength} characters.`;
  return input.validationMessage || 'Please check this field.';
}

export function initForm(form, opts = {}) {
  if (!form || form._hcForm) return;
  form._hcForm = true;
  form.noValidate = true;
  form.dataset.state = 'idle';
  const submit = form.querySelector('[type="submit"]');
  const alertEl = form.querySelector('.form-alert');
  const success = typeof opts.success === 'string' ? document.getElementById(opts.success) : (opts.success || (form.dataset.success && document.getElementById(form.dataset.success)));
  const controls = () => Array.from(form.querySelectorAll('.field input, .field select, .field textarea')).filter((c) => c.type !== 'hidden');

  function validate(input, show = true) {
    const field = input.closest('.field');
    if (!field) return input.checkValidity();
    if (input.type !== 'email' && input.type !== 'checkbox' && typeof input.value === 'string' && input.value.trim() === '' && input.value !== '') input.value = '';
    const ok = input.checkValidity();
    const err = field.querySelector('.field__error');
    if (show) {
      field.classList.toggle('is-invalid', !ok);
      field.classList.toggle('is-valid', ok && input.value.trim() !== '');
      input.setAttribute('aria-invalid', String(!ok));
      if (err) err.textContent = ok ? '' : messageFor(input, field);
    }
    return ok;
  }

  for (const c of controls()) {
    c.addEventListener('blur', () => { if (c.value !== '' || c.dataset.touched) validate(c); c.dataset.touched = '1'; });
    c.addEventListener('input', () => { if (c.closest('.field')?.classList.contains('is-invalid')) validate(c); });
    c.addEventListener('change', () => { if (c.tagName === 'SELECT') validate(c); });
  }

  function setState(state) {
    form.dataset.state = state;
    if (submit) submit.setAttribute('aria-busy', String(state === 'loading'));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.state === 'loading') return;
    if (alertEl) alertEl.hidden = true;
    const bad = controls().filter((c) => !validate(c));
    if (bad.length) { bad[0].focus(); return; }
    setState('loading');
    try {
      if (form.hasAttribute('data-demo')) {
        await new Promise((r) => setTimeout(r, 1300));
        if (/error/i.test(form.querySelector('[name="name"]')?.value || '')) throw new Error('demo error');
      } else {
        const res = await fetch(opts.endpoint || '/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encode(new FormData(form)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setState('success');
      if (success) {
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
        success.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      opts.onSuccess?.(form);
    } catch (err) {
      setState('error');
      if (alertEl) { alertEl.hidden = false; alertEl.focus?.(); }
      opts.onError?.(form, err);
    }
  });

  return { validate, setState, reset() { form.reset(); form.hidden = false; if (success) success.hidden = true; setState('idle'); for (const f of form.querySelectorAll('.field')) f.classList.remove('is-invalid', 'is-valid'); } };
}

export default initForm;
