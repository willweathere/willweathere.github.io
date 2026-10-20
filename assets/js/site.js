/* Scroll-in reveals and the footer year. Content is visible without JS. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  var items = [].slice.call(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px 12% 0px', threshold: 0 });
  // Safety net: nothing stays hidden if an observer callback is missed.
  setTimeout(function () { items.forEach(function (el) { el.classList.add('is-in'); }); }, 2500);
  items.forEach(function (el) { io.observe(el); });
})();
