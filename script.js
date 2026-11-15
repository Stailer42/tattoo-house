/* =========================================================
   TATTOO HOUSE: shared script
   All page behaviour. Data (services, masters, gallery, reviews,
   contacts, giveaway) comes from lib/site-data.js: Supabase when
   config.js is present, built-in seed otherwise (demo mode).
   Works from file:// and from GitHub Pages, no build step.
   ========================================================= */
(function () {
  'use strict';

  var NB = ' ';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function price(n) { return num(n) + NB + '₴'; }
  function icon(id, cls) { return '<svg class="' + (cls || '') + '" aria-hidden="true"><use href="#i-' + id + '"></use></svg>'; }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  /* =========================================================
     DATA: filled by applyData() from lib/site-data.js
     ========================================================= */
  var SERVICES = [], MASTERS = [], GALLERY = [], REVIEWS = [], INFO = {}, GIVEAWAY = {};
  var GIVEAWAY_END = new Date(0);
  var POS_CLASS = { top: 'master__photo--pos-top', wide: 'master__photo--wide' };
  var ART = ['dagger', 'star', 'flame', 'bolt', 'horns', 'skull'];

  function applyData(d) {
    SERVICES = d.services.map(function (x) {
      return { id: x.id, name: x.name, icon: ART.indexOf(x.icon) > -1 ? x.icon : 'dagger', price: Number(x.price) || 0, unit: x.unit || '', text: x.text || '' };
    });
    MASTERS = d.masters.map(function (m) {
      return { slug: m.id, name: m.name, nick: m.nick || '', style: m.style || '', photo: m.photo || null, photoClass: POS_CLASS[m.photo_pos] || '',
        tags: m.tags || [], exp: Number(m.exp) || 0, price: m.price || '', about: m.about || '' };
    });
    GALLERY = d.gallery.map(function (g) {
      return { src: g.src, w: g.w, h: g.h, alt: g.alt, style: g.style || '', master: g.master_id || null };
    });
    REVIEWS = d.reviews || [];
    INFO = d.info || {};
    GIVEAWAY = d.giveaway || {};
    GIVEAWAY_END = new Date(GIVEAWAY.ends_at || 0);
  }

  // «Псевдо» майстра в лапках або нічого, якщо його не вказали
  function nickq(m) { return m && m.nick ? ' «' + esc(m.nick) + '»' : ''; }
  function phoneHref(p) { return 'tel:+' + String(p || '').replace(/\D/g, ''); }

  function masterBySlug(slug) {
    for (var i = 0; i < MASTERS.length; i++) if (MASTERS[i].slug === slug) return MASTERS[i];
    return null;
  }

  /* =========================================================
     SVG SPRITE (arts + UI icons)
     ========================================================= */
  var SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
    '<symbol id="i-skull" viewBox="0 0 100 100"><path fill="currentColor" fill-rule="evenodd" d="M50 6C28 6 14 21 14 42c0 12 5 20 12 25v13c0 4 3 7 7 7h4v-8h6v8h14v-8h6v8h4c4 0 7-3 7-7V67c7-5 12-13 12-25C86 21 72 6 50 6ZM34 40c6 0 11 5 11 11s-5 9-11 9-10-4-10-9 4-11 10-11Zm32 0c6 0 10 6 10 11s-4 9-10 9-11-3-11-9 5-11 11-11ZM50 62l6 11H44Z"/></symbol>' +
    '<symbol id="i-horns" viewBox="0 0 100 100"><path fill="currentColor" d="M30 92C10 72 4 42 14 6c3 30 13 50 30 64Zm40 0c20-20 26-50 16-86-3 30-13 50-30 64Z"/></symbol>' +
    '<symbol id="i-bolt" viewBox="0 0 100 100"><path fill="currentColor" d="M60 2 20 56h24L34 98l46-58H56L70 2Z"/></symbol>' +
    '<symbol id="i-flame" viewBox="0 0 100 100"><path fill="currentColor" fill-rule="evenodd" d="M50 2c6 18 26 28 26 54 0 22-12 40-26 42-14-2-26-16-26-38 0-14 8-22 12-30 2 12 6 16 10 18-2-16-2-30 4-46Zm0 58c6 6 10 12 8 22-2 6-14 6-16 0-2-8 4-14 8-22Z"/></symbol>' +
    '<symbol id="i-dagger" viewBox="0 0 100 100"><path fill="currentColor" d="M50 2l7 56H43Zm-22 56h44v7H28Zm18 7h8v22h-8Zm4 22a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/></symbol>' +
    '<symbol id="i-star" viewBox="0 0 100 100"><path fill="currentColor" d="M50 0c3 35 15 47 50 50-35 3-47 15-50 50-3-35-15-47-50-50 35-3 47-15 50-50Z"/></symbol>' +
    '<symbol id="i-star5" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 3 6.6 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.8Z"/></symbol>' +
    '<symbol id="i-spikes" viewBox="0 0 120 30"><path fill="currentColor" d="M0 30 10 0l10 30L30 4l10 26L50 0l10 30L70 4l10 26L90 0l10 30 10-26 10 26Z"/></symbol>' +
    '<symbol id="i-barbed" viewBox="0 0 120 30"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M0 15c10-8 20-8 30 0s20 8 30 0 20-8 30 0 20 8 30 0"/><path d="M0 15c10 8 20 8 30 0s20-8 30 0 20 8 30 0 20-8 30 0"/><path d="M26 7l8 16M34 7l-8 16M86 7l8 16M94 7l-8 16"/></g></symbol>' +
    '<symbol id="i-bust" viewBox="0 0 200 220"><path fill="currentColor" d="M100 30c-26 0-44 20-44 48 0 20 9 36 22 44v14c-38 6-66 26-74 60l-2 24h196l-2-24c-8-34-36-54-74-60v-14c13-8 22-24 22-44 0-28-18-48-44-48Z"/><path fill="#d90429" opacity=".55" d="M66 52C56 40 54 24 60 8c4 14 10 22 18 28Zm68 0c10-12 12-28 6-44-4 14-10 22-18 28Z"/></symbol>' +
    '<symbol id="i-quote" viewBox="0 0 48 48"><path fill="currentColor" d="M4 40V26C4 14 10 7 20 6v6c-5 2-8 6-8 12h8v16Zm24 0V26c0-12 6-19 16-20v6c-5 2-8 6-8 12h8v16Z"/></symbol>' +
    '<symbol id="i-instagram" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/></g></symbol>' +
    '<symbol id="i-telegram" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></g></symbol>' +
    '<symbol id="i-phone" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></g></symbol>' +
    '<symbol id="i-pin" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></g></symbol>' +
    '<symbol id="i-clock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></g></symbol>' +
    '<symbol id="i-left" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="m15 18-6-6 6-6"/></g></symbol>' +
    '<symbol id="i-right" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="m9 18 6-6-6-6"/></g></symbol>' +
    '<symbol id="i-arrow" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"><path d="M4 12h15M13 6l6 6-6 6"/></g></symbol>' +
    '<symbol id="i-close" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="M18 6 6 18M6 6l12 12"/></g></symbol>' +
    '<symbol id="i-zoom" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></g></symbol>' +
    '</svg>';

  function injectSprite() {
    var holder = document.createElement('div');
    holder.innerHTML = SPRITE;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  }

  /* =========================================================
     COMMON UI
     ========================================================= */
  function initSticker() {
    $$('.brand__sticker').forEach(function (el) {
      var rnd = function (min, max) { return Math.random() * (max - min) + min; };
      var rot = rnd(4, 11) * (Math.random() < .5 ? -1 : 1);
      el.style.setProperty('--rot', rot.toFixed(1) + 'deg');
      el.style.setProperty('--dx', rnd(-9, 9).toFixed(1) + 'px');
      el.style.setProperty('--dy', rnd(-4, 6).toFixed(1) + 'px');
      if (!reduceMotion) el.classList.add('is-stuck');
    });
  }

  function initMenu() {
    var burger = $('.burger');
    var menu = $('#mobile-menu');
    if (!burger || !menu) return;
    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
      menu.hidden = !open;
      document.body.classList.toggle('menu-open', open);
      if (open) { var first = $('a', menu); if (first) first.focus(); }
    }
    burger.addEventListener('click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setOpen(false); burger.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth >= 900 && !menu.hidden) setOpen(false); });
  }

  function initTransitions() {
    window.addEventListener('pageshow', function () { document.body.classList.remove('is-leaving'); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(tel:|mailto:|viber:|https?:)/i.test(href)) return;
      if (!/\.html(\?|#|$)/.test(href)) return;
      if (reduceMotion) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(function () { window.location.href = a.href; }, 320);
    });
  }

  var revealObserver = null;
  function observeReveals(root) {
    var els = $$('[data-reveal]:not(.is-in)', root);
    $$('[data-stagger]', root).forEach(function (group) {
      $$('[data-reveal]', group).forEach(function (el, i) { el.style.setProperty('--d', (i * 90) + 'ms'); });
    });
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); revealObserver.unobserve(en.target); }
        });
      }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    }
    els.forEach(function (el) { revealObserver.observe(el); });
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    countersStarted = true;
    function run(el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var out = $('.js-count', el) || el;
      if (reduceMotion) { out.textContent = dec ? target.toFixed(dec) : num(target); return; }
      var dur = 1800, t0 = null;
      function tick(t) {
        if (!t0) t0 = t;
        var p = Math.min((t - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 4);
        var v = target * eased;
        out.textContent = dec ? v.toFixed(dec) : num(Math.round(v));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    if (!reduceMotion) els.forEach(function (el) { var o = $('.js-count', el) || el; o.textContent = '0'; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: .5 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initFloatCta() {
    var cta = $('.float-cta');
    if (!cta) return;
    var footer = $('.site-footer');
    function update() {
      var nearFooter = footer && footer.getBoundingClientRect().top < window.innerHeight - 40;
      cta.classList.toggle('is-visible', window.scrollY > 700 && !nearFooter);
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---------- overlay (modal / lightbox) with focus trap ---------- */
  function openOverlay(el, onClose) {
    var prevFocus = document.activeElement;
    document.body.appendChild(el);
    document.body.classList.add('menu-open');
    function focusables() {
      return $$('a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])', el)
        .filter(function (n) { return n.offsetParent !== null; });
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (el.__onKey) el.__onKey(e);
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      el.remove();
      document.body.classList.remove('menu-open');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (onClose) onClose();
    }
    document.addEventListener('keydown', onKey);
    var downOnBackdrop = false;
    el.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === el; });
    el.addEventListener('click', function (e) {
      if ((e.target === el && downOnBackdrop) || e.target.closest('[data-close]')) close();
      downOnBackdrop = false;
    });
    var f = focusables(); if (f.length) f[0].focus();
    return close;
  }

  /* =========================================================
     RENDERERS
     ========================================================= */
  function renderServices(mount) {
    mount.innerHTML = SERVICES.map(function (s, i) {
      return '<article class="service" data-reveal="up">' +
        '<span class="service__num">' + String(i + 1).padStart(2, '0') + ' /</span>' +
        icon(s.icon, 'service__icon') +
        '<h3>' + esc(s.name) + '</h3>' +
        '<p>' + esc(s.text) + '</p>' +
        '<p class="service__price">від <strong>' + price(s.price) + '</strong>' + esc(s.unit) + '</p>' +
        '</article>';
    }).join('');
  }

  function workHTML(item, i, lazy) {
    var m = masterBySlug(item.master);
    return '<button type="button" class="work" data-reveal="zoom" data-index="' + i + '" aria-label="Відкрити фото: ' + esc(item.alt) + '">' +
      '<img src="' + esc(item.src) + '" alt="' + esc(item.alt) + '" width="' + item.w + '" height="' + item.h + '"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async">' +
      '<span class="work__cap"><span>' + esc(item.style) + (m ? ' / ' + esc(m.nick || m.name) : '') + '</span>' + icon('zoom') + '</span>' +
      '</button>';
  }

  function renderWorks(mount, limit) {
    var items = GALLERY.slice(0, limit || GALLERY.length);
    mount.innerHTML = items.map(function (it, i) { return workHTML(it, i, true); }).join('');
    if (mount.__bound) return;
    mount.__bound = true;
    mount.addEventListener('click', function (e) {
      var btn = e.target.closest('.work');
      if (btn) openLightbox(parseInt(btn.getAttribute('data-index'), 10));
    });
  }

  function photoHTML(m, lazy) {
    if (m.photo) {
      return '<div class="master__photo ' + m.photoClass + '"><img src="' + esc(m.photo) + '" alt="' + esc(m.name + ', майстер ' + m.style) + '" width="600" height="800"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async"></div>';
    }
    return '<div class="master__photo"><div class="master__silhouette" role="img" aria-label="' + esc('Фото майстра ' + m.name + ' скоро буде') + '">' +
      '<span>Фото скоро</span><svg viewBox="0 0 200 220" aria-hidden="true"><use href="#i-bust"></use></svg></div></div>';
  }

  function renderMastersPreview(mount, limit) {
    mount.innerHTML = MASTERS.slice(0, limit).map(function (m) {
      return '<a class="master" href="masters.html#' + encodeURIComponent(m.slug) + '" data-reveal="up">' +
        photoHTML(m, true) +
        '<h3 class="master__name">' + esc(m.name) + (m.nick ? ' <span class="master__nick">«' + esc(m.nick) + '»</span>' : '') + '</h3>' +
        '<p class="master__style">' + esc(m.style) + '</p>' +
        '</a>';
    }).join('');
  }

  function renderMastersFull(mount) {
    mount.innerHTML = MASTERS.map(function (m, i) {
      return '<article class="master-card" id="' + esc(m.slug) + '" data-reveal="' + (i % 2 ? 'right' : 'left') + '">' +
        photoHTML(m, i > 1) +
        '<div class="master-card__body">' +
        '<span class="master-card__num">' + String(i + 1).padStart(2, '0') + ' / ' + String(MASTERS.length).padStart(2, '0') + '</span>' +
        '<h2>' + esc(m.name) + (m.nick ? '<span class="master__nick">«' + esc(m.nick) + '»</span>' : '') + '</h2>' +
        '<div class="master-card__tags">' + m.tags.map(function (t, k) { return '<span class="tag' + (k === 0 ? ' tag--red' : '') + '">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<p>' + esc(m.about) + '</p>' +
        '<dl class="master-card__facts"><div><dt>Досвід</dt><dd>' + m.exp + NB + plural(m.exp, 'рік', 'роки', 'років') + '</dd></div>' +
        (m.price ? '<div><dt>Вартість</dt><dd>' + esc(m.price) + '</dd></div>' : '') + '</dl>' +
        '<a class="btn" href="booking.html?master=' + encodeURIComponent(m.slug) + '"><span class="btn__fill"></span><span class="btn__label">Записатися до' + NB + 'майстра</span>' + icon('arrow') + '</a>' +
        '</div></article>';
    }).join('');
  }

  /* ---------- reviews (home) ---------- */
  function renderReviews(mount) {
    var limit = parseInt(mount.getAttribute('data-limit') || '3', 10);
    mount.innerHTML = REVIEWS.slice(0, limit).map(function (r) {
      return '<figure class="review" data-reveal="up">' +
        '<svg class="review__mark" aria-hidden="true"><use href="#i-quote"></use></svg>' +
        '<blockquote><p>' + esc(r.text) + '</p></blockquote>' +
        '<figcaption><strong>' + esc(r.author) + '</strong>' + (r.caption ? ' / ' + esc(r.caption) : '') + '</figcaption>' +
        '</figure>';
    }).join('');
    mount.hidden = !REVIEWS.length;
  }

  /* ---------- contacts: header phone, footer, map, JSON-LD ---------- */
  function setText(sel, text) { $$(sel).forEach(function (el) { el.textContent = text || ''; el.hidden = !text; }); }
  function renderInfo() {
    var addr = [INFO.address, INFO.city].filter(Boolean).join(', ');
    var mapQ = INFO.map_query || addr;
    $$('[data-info-tel]').forEach(function (a) { a.href = phoneHref(INFO.phone); });
    $$('[data-info="address"]').forEach(function (a) {
      a.textContent = addr;
      a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQ);
    });
    $$('[data-info="phone"]').forEach(function (a) { a.textContent = INFO.phone || ''; a.href = phoneHref(INFO.phone); });
    setText('[data-info="address_note"]', INFO.address_note);
    setText('[data-info="phone_note"]', INFO.phone_note);
    setText('[data-info="hours"]', INFO.hours);
    setText('[data-info="hours_note"]', INFO.hours_note);
    ['instagram', 'telegram'].forEach(function (k) {
      $$('[data-info="' + k + '"]').forEach(function (a) { if (INFO[k]) a.href = INFO[k]; a.hidden = !INFO[k]; });
    });
    $$('[data-info="map"]').forEach(function (f) {
      var src = 'https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s' + encodeURIComponent(mapQ).replace(/%20/g, '+') + '!6i16';
      if (f.getAttribute('src') !== src) f.setAttribute('src', src);
      f.title = 'Карта: Tattoo House, ' + addr;
    });
    var ld = $('#ld-json');
    if (ld) {
      try {
        var j = JSON.parse(ld.textContent);
        j.telephone = '+' + String(INFO.phone || '').replace(/\D/g, '');
        j.address = { '@type': 'PostalAddress', streetAddress: INFO.address, addressLocality: INFO.city, addressCountry: 'UA' };
        if (INFO.opening_hours) j.openingHours = INFO.opening_hours;
        j.sameAs = [INFO.instagram, INFO.telegram].filter(Boolean);
        ld.textContent = JSON.stringify(j);
      } catch (e) { /* лишаємо статичний блок */ }
    }
  }

  /* ---------- merits: counters + rotating ring (home) ---------- */
  var countersStarted = false;
  function renderStats() {
    var st = INFO.stats || {};
    $$('[data-stat]').forEach(function (el) {
      var v = Number(st[el.getAttribute('data-stat')]);
      if (!isFinite(v)) return;
      el.setAttribute('data-count', String(v));
      if (countersStarted || reduceMotion) {
        var out = $('.js-count', el) || el;
        var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
        out.textContent = dec ? v.toFixed(dec) : num(v);
      }
    });
    var ring = $('#ring-text');
    if (ring) {
      var y = Number(st.years) || 0, c = Number(st.clients) || 0, n = MASTERS.length;
      ring.textContent = [
        y + ' ' + plural(y, 'РІК', 'РОКИ', 'РОКІВ') + ' ДОСВІДУ',
        c + '+ ' + plural(c, 'КЛІЄНТ', 'КЛІЄНТИ', 'КЛІЄНТІВ'),
        st.rating + ' У GOOGLE',
        'САЛОН РОКУ ЛЬВІВ 2025',
        n + ' ' + plural(n, 'МАЙСТЕР', 'МАЙСТРИ', 'МАЙСТРІВ')
      ].join(' / ') + ' /';
      var sr = $('#ring-sr');
      if (sr) sr.textContent = y + ' ' + plural(y, 'рік', 'роки', 'років') + ' досвіду, понад ' + c + ' клієнтів, рейтинг ' + st.rating +
        ' у Google, салон року Львів 2025, ' + n + ' ' + plural(n, 'майстер', 'майстри', 'майстрів') + '.';
    }
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- lightbox ---------- */
  function openLightbox(index) {
    var cur = index;
    var el = document.createElement('div');
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Перегляд роботи');
    el.innerHTML =
      '<div class="lightbox__top"><span class="lightbox__count"></span>' +
      '<button type="button" class="modal__close" data-close aria-label="Закрити">' + icon('close') + '</button></div>' +
      '<div class="lightbox__stage">' +
      '<button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="Попередня робота">' + icon('left') + '</button>' +
      '<img class="lightbox__img" alt="">' +
      '<button type="button" class="lightbox__nav lightbox__nav--next" aria-label="Наступна робота">' + icon('right') + '</button>' +
      '</div><p class="lightbox__cap"></p>';
    var img = $('.lightbox__img', el), cap = $('.lightbox__cap', el), count = $('.lightbox__count', el);
    function show(i) {
      cur = (i + GALLERY.length) % GALLERY.length;
      var it = GALLERY[cur], m = masterBySlug(it.master);
      img.classList.remove('lightbox__img'); void img.offsetWidth; img.classList.add('lightbox__img');
      img.src = it.src; img.alt = it.alt; img.width = it.w; img.height = it.h;
      cap.textContent = it.alt + (m ? ' / майстер ' + m.name + (m.nick ? ' «' + m.nick + '»' : '') : '');
      count.textContent = (cur + 1) + ' / ' + GALLERY.length;
    }
    $('.lightbox__nav--prev', el).addEventListener('click', function () { show(cur - 1); });
    $('.lightbox__nav--next', el).addEventListener('click', function () { show(cur + 1); });
    el.__onKey = function (e) {
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    };
    var sx = null;
    el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(dx < 0 ? cur + 1 : cur - 1);
      sx = null;
    });
    show(cur);
    openOverlay(el);
  }

  /* =========================================================
     GIVEAWAY (home)
     ========================================================= */
  var HP_FIELD = '<div class="hp" aria-hidden="true"><label>Не заповнюйте це поле<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>';
  function hpValue(root) { var i = $('input[name="company"]', root); return i ? i.value : ''; }

  // Тексти розіграшу з даних (приз, коли оголосимо, вимкнено)
  function renderGiveawayTexts() {
    var root = $('#giveaway');
    if (!root) return;
    root.hidden = GIVEAWAY.enabled === false;
    $$('[data-gw="prize"]', root).forEach(function (el) { el.textContent = GIVEAWAY.prize || ''; });
    $$('[data-gw="announce"]', root).forEach(function (el) { el.textContent = GIVEAWAY.announce || ''; });
  }

  function initGiveaway() {
    var root = $('#giveaway');
    if (!root) return;
    renderGiveawayTexts();
    var cells = { d: $('[data-t="d"]', root), h: $('[data-t="h"]', root), m: $('[data-t="m"]', root), s: $('[data-t="s"]', root) };
    var btn = $('#giveaway-btn'), status = $('#giveaway-status');
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var timerId;
    var saved = store.get('th-giveaway', null);

    // Що показати під кнопкою: переможець > завершено > ви вже в грі > примітка до призу
    function renderStatus() {
      var w = GIVEAWAY.winner;
      var ended = GIVEAWAY_END - new Date() <= 0;
      status.classList.toggle('is-joined', !!saved && !w && !ended);
      btn.hidden = !!w || ended;
      if (w && w.name) status.textContent = 'Переможець: ' + w.name + (w.contact_masked ? ' (' + w.contact_masked + ')' : '') + '. Вітаємо!';
      else if (ended) status.textContent = 'Розіграш завершено. Переможця оголосимо в Instagram.';
      else if (saved) status.textContent = 'Ви вже берете участь як ' + saved.name + '. Удачі!';
      else status.textContent = GIVEAWAY.prize_note || '';
    }
    initGiveaway.refresh = function () {
      renderGiveawayTexts();
      GIVEAWAY_END = new Date(GIVEAWAY.ends_at || 0);
      tick();
      renderStatus();
    };

    function tick() {
      var diff = GIVEAWAY_END - new Date();
      if (diff <= 0) {
        clearInterval(timerId);
        Object.keys(cells).forEach(function (k) { cells[k].textContent = '00'; });
        renderStatus();
        return;
      }
      var s = Math.floor(diff / 1000);
      cells.d.textContent = pad(Math.floor(s / 86400));
      cells.h.textContent = pad(Math.floor(s % 86400 / 3600));
      cells.m.textContent = pad(Math.floor(s % 3600 / 60));
      cells.s.textContent = pad(s % 60);
    }
    tick();
    timerId = setInterval(tick, 1000);
    renderStatus();

    var ERR = {
      bad_name: ['name', 'Вкажіть ім’я, хоча б 2 літери'],
      bad_contact: ['contact', 'Потрібен телефон (+380...) або нік в Instagram (@nickname)'],
      closed: [null, 'Розіграш уже завершено.'],
      too_many: [null, 'Забагато заявок за хвилину. Спробуйте трохи пізніше.'],
      network: [null, 'Немає зв’язку. Перевірте інтернет і спробуйте ще раз.']
    };

    btn.addEventListener('click', function () {
      var live = window.TH && TH.mode === 'live';
      var el = document.createElement('div');
      el.className = 'overlay';
      el.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="gw-title">' +
        '<button type="button" class="modal__close" data-close aria-label="Закрити">' + icon('close') + '</button>' +
        '<div class="gw-body">' +
        '<p class="label">Розіграш</p><h2 id="gw-title">Сертифікат на' + NB + esc(GIVEAWAY.prize || '') + '</h2>' +
        '<form class="form" novalidate>' +
        field('gw-name', 'Ваше ім’я', 'text', 'Наприклад, Олена', 'name') +
        field('gw-contact', 'Телефон або Instagram', 'text', '+380 67 123 45 67 або @nickname', 'tel') +
        HP_FIELD +
        '<p class="step__error" role="alert" id="gw-error"></p>' +
        '<button type="submit" class="btn btn--block"><span class="btn__fill"></span><span class="btn__label">Взяти участь у' + NB + 'розіграші</span></button>' +
        '<p class="reassure">' + (live ? 'Ім’я та' + NB + 'контакт бачить лише адміністратор салону.' : 'Дані лишаються тільки у' + NB + 'вашому браузері: це демо-сайт.') + '</p>' +
        '</form></div></div>';
      openOverlay(el);
      var form = $('form', el);
      var submit = $('button[type="submit"]', form);
      var formErr = $('#gw-error', el);
      if (saved) { $('#gw-name', el).value = saved.name; $('#gw-contact', el).value = saved.contact; }

      function success(already) {
        renderStatus();
        $('.gw-body', el).innerHTML =
          '<div class="success" role="status">' + stampSVG() +
          '<p class="success__title">' + (already ? 'Ви вже в' + NB + 'грі' : 'Ви в' + NB + 'грі!') + '</p>' +
          '<p class="text">' + (already ? 'Цей контакт уже зареєстрований у' + NB + 'розіграші. ' : '') +
          'Переможця оберемо ' + esc(GIVEAWAY.announce || '') + ' наживо в' + NB + 'Instagram. Слідкуйте за' + NB + 'сторіс.</p>' +
          '<button type="button" class="btn btn--ghost" data-close><span class="btn__fill"></span><span class="btn__label">Повернутися на' + NB + 'сайт</span></button></div>';
        var b = $('[data-close]', el); if (b) b.focus();
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (submit.disabled) return;
        var name = $('#gw-name', el).value.trim();
        var contact = $('#gw-contact', el).value.trim();
        var ok = true;
        formErr.textContent = '';
        ok = setFieldError($('#gw-name', el), name.length >= 2 ? '' : 'Вкажіть ім’я, хоча б 2 літери') && ok;
        ok = setFieldError($('#gw-contact', el), validPhone(contact) || validInsta(contact) ? '' : 'Потрібен телефон (+380...) або нік в Instagram (@nickname)') && ok;
        if (!ok) return;
        var entry = { name: name, contact: contact, at: new Date().toISOString() };
        if (!live) {
          saved = entry; store.set('th-giveaway', saved); success(false);
          return;
        }
        submit.disabled = true;
        $('.btn__label', submit).textContent = 'Надсилаємо…';
        TH.joinGiveaway({ name: name, contact: contact, hp: hpValue(form) }).then(function (res) {
          saved = entry; store.set('th-giveaway', saved);
          success(res === 'already');
        }, function (err) {
          submit.disabled = false;
          $('.btn__label', submit).textContent = 'Взяти участь у' + NB + 'розіграші';
          var m = ERR[err.code] || [null, 'Не вдалося надіслати заявку. Спробуйте ще раз.'];
          if (m[0]) setFieldError($('#gw-' + m[0], el), m[1]);
          else formErr.textContent = m[1];
        });
      });
    });
  }

  function field(id, label, type, placeholder, autocomplete, extra) {
    return '<div class="field"><label class="field__label" for="' + id + '">' + label + '</label>' +
      '<input class="field__input" id="' + id + '" name="' + id + '" type="' + type + '" placeholder="' + esc(placeholder) + '" autocomplete="' + autocomplete + '"' + (extra || '') + '>' +
      '<p class="field__error" id="' + id + '-err" aria-live="polite"></p></div>';
  }
  function setFieldError(input, msg) {
    var wrap = input.closest('.field');
    var err = $('.field__error', wrap);
    wrap.classList.remove('is-invalid');
    if (msg) { void wrap.offsetWidth; wrap.classList.add('is-invalid'); }
    err.textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.setAttribute('aria-describedby', err.id);
    return !msg;
  }
  function validPhone(v) { var d = v.replace(/\D/g, ''); return /^380\d{9}$/.test(d) || /^0\d{9}$/.test(d); }
  function validInsta(v) { return /^@[a-zA-Z0-9._]{2,30}$/.test(v); }
  function stampSVG() {
    return '<svg class="stamp" viewBox="0 0 140 140" aria-hidden="true"><circle class="stamp__ring" cx="70" cy="70" r="60"/><path class="stamp__tick" d="M40 72l20 20 42-44"/></svg>';
  }

  /* =========================================================
     BOOKING
     ========================================================= */
  function initBooking() {
    var root = $('#booking');
    if (!root) return;
    var stage = $('#booking-stage', root);
    var receipt = $('#receipt');
    var progress = $$('.progress__step', root);
    var SLOTS = ['11:00', '13:00', '15:00', '17:00', '19:00'];
    var MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
    var MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
    var DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var minDate = new Date(today); minDate.setDate(minDate.getDate() + 1);
    var maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 60);

    var state = { step: 1, maxStep: 1, services: [], master: null, date: null, time: null, name: '', phone: '', comment: '', agree: false };
    var params = new URLSearchParams(window.location.search);
    var pre = params.get('master');
    if (pre && masterBySlug(pre)) state.master = pre;
    var view = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    var lastReceipt = '';

    function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function parseIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function niceDate(s) { var d = parseIso(s); return d.getDate() + NB + MONTHS_GEN[d.getMonth()] + ', ' + ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]; }
    function busy(dateStr, slot) {
      var key = dateStr + slot + (state.master || 'any');
      var h = 0; for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      return h % 7 < 2;
    }
    function total() { return state.services.reduce(function (sum, id) { var s = SERVICES.filter(function (x) { return x.id === id; })[0]; return sum + (s ? s.price : 0); }, 0); }

    /* --- receipt --- */
    function renderReceipt() {
      var rows = [];
      state.services.forEach(function (id) {
        var s = SERVICES.filter(function (x) { return x.id === id; })[0];
        if (s) rows.push('<div class="receipt__row" data-key="s-' + esc(id) + '"><span>' + esc(s.name) + '</span><span>від ' + price(s.price) + '</span></div>');
      });
      var m = state.master === 'any' ? { name: 'Будь-який вільний', nick: '' } : state.master ? masterBySlug(state.master) : null;
      var html =
        '<div class="receipt__head"><p class="receipt__brand">Tattoo House</p><p>' + esc([INFO.address, INFO.city].filter(Boolean).join(', ')) + '</p><p>ЧЕК ПОПЕРЕДНЬОГО ЗАПИСУ</p></div>' +
        '<hr class="receipt__sep">' +
        '<p class="receipt__label">Послуги</p>' +
        (rows.length ? rows.join('') : '<p class="receipt__empty">Ще нічого не обрано</p>') +
        '<hr class="receipt__sep">' +
        '<div class="receipt__row" data-key="m-' + (state.master || '') + '"><span>Майстер</span><span>' + (m ? esc(m.name) : '...') + '</span></div>' +
        '<div class="receipt__row" data-key="d-' + (state.date || '') + '"><span>Дата</span><span>' + (state.date ? niceDate(state.date) : '...') + '</span></div>' +
        '<div class="receipt__row" data-key="t-' + (state.time || '') + '"><span>Час</span><span>' + (state.time || '...') + '</span></div>' +
        (state.name ? '<div class="receipt__row" data-key="n-' + esc(state.name) + '"><span>Клієнт</span><span>' + esc(state.name) + '</span></div>' : '') +
        '<hr class="receipt__sep">' +
        '<div class="receipt__total"><span>РАЗОМ</span><strong>від ' + price(total()) + '</strong></div>' +
        '<p class="receipt__note">Точну ціну майстер назве після консультації: вона залежить від розміру та складності.</p>' +
        '<div class="receipt__barcode" aria-hidden="true"></div><p class="receipt__thanks">ДЯКУЄМО!</p>';
      var prevKeys = lastReceipt;
      receipt.innerHTML = html;
      $$('.receipt__row', receipt).forEach(function (r) {
        var k = r.getAttribute('data-key');
        if (prevKeys && prevKeys.indexOf('|' + k + '|') === -1 && !/-$/.test(k)) r.classList.add('is-new');
      });
      lastReceipt = '|' + $$('.receipt__row', receipt).map(function (r) { return r.getAttribute('data-key'); }).join('|') + '|';
    }

    /* --- progress --- */
    function renderProgress() {
      progress.forEach(function (b, i) {
        var n = i + 1;
        b.classList.toggle('is-current', n === state.step);
        b.classList.toggle('is-done', n < state.step || (n <= state.maxStep && n !== state.step));
        b.disabled = n > state.maxStep || state.step === 5;
        if (n === state.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
    progress.forEach(function (b, i) {
      b.addEventListener('click', function () { jump(i + 1); });
    });

    function navHTML(back, nextLabel) {
      return '<p class="step__error" role="alert"></p><div class="step__nav">' +
        (back ? '<button type="button" class="btn btn--ghost btn--sm" data-back><span class="btn__fill"></span><span class="btn__label">Назад</span></button>' : '<span></span>') +
        '<button type="button" class="btn btn--pulse" data-next><span class="btn__fill"></span><span class="btn__label">' + nextLabel + '</span>' + icon('arrow') + '</button></div>';
    }
    function stepError(msg) {
      var p = $('.step__error', stage);
      p.textContent = msg;
    }

    /* --- steps --- */
    function step1() {
      return '<div class="step__head"><p class="label">Крок 1 / 4</p><h2>Що робимо?</h2><p class="text">Можна обрати кілька послуг: наприклад, ескіз і' + NB + 'тату.</p></div>' +
        '<div class="options" role="group" aria-label="Послуги">' + SERVICES.map(function (s) {
          return '<label class="option"><input type="checkbox" name="service" value="' + esc(s.id) + '"' + (state.services.indexOf(s.id) > -1 ? ' checked' : '') + '>' +
            '<span class="option__box">' + icon(s.icon, 'option__icon') +
            '<span><span class="option__title">' + esc(s.name) + '</span><span class="option__sub">від ' + price(s.price) + esc(s.unit) + '</span></span>' +
            '<span class="option__mark" aria-hidden="true"></span></span></label>';
        }).join('') + '</div>' + navHTML(false, 'Обрати майстра');
    }
    function step2() {
      var any = '<label class="option"><input type="radio" name="master" value="any"' + (state.master === 'any' ? ' checked' : '') + '>' +
        '<span class="option__box"><span class="option__thumb option__thumb--empty">' + icon('star') + '</span>' +
        '<span><span class="option__title">Будь-який вільний</span><span class="option__sub">Підберемо майстра під ваш стиль</span></span>' +
        '<span class="option__mark" aria-hidden="true"></span></span></label>';
      return '<div class="step__head"><p class="label">Крок 2 / 4</p><h2>До кого записуємось?</h2></div>' +
        '<div class="options" role="radiogroup" aria-label="Майстри">' + any + MASTERS.map(function (m) {
          var thumb = m.photo ? '<img class="option__thumb" src="' + esc(m.photo) + '" alt="" width="44" height="56" loading="lazy">' : '<span class="option__thumb option__thumb--empty">' + icon('skull') + '</span>';
          return '<label class="option"><input type="radio" name="master" value="' + esc(m.slug) + '"' + (state.master === m.slug ? ' checked' : '') + '>' +
            '<span class="option__box">' + thumb +
            '<span><span class="option__title">' + esc(m.name) + nickq(m) + '</span><span class="option__sub">' + [esc(m.style), esc(m.price)].filter(Boolean).join(' / ') + '</span></span>' +
            '<span class="option__mark" aria-hidden="true"></span></span></label>';
        }).join('') + '</div>' + navHTML(true, 'Обрати дату');
    }
    function step3() {
      var hours = [INFO.hours, INFO.hours_note].filter(Boolean).map(esc).join('. ');
      return '<div class="step__head"><p class="label">Крок 3 / 4</p><h2>Коли вам зручно?</h2><p class="text">' + (hours ? hours + '. ' : '') + 'Сеанс починається в' + NB + 'обраний час.</p></div>' +
        '<p class="sr-only" id="cal-live" aria-live="polite"></p><div class="calendar"><div class="cal" id="cal"></div><div class="slots" id="slots"></div></div>' + navHTML(true, 'Залишити контакти');
    }
    function step4() {
      return '<div class="step__head"><p class="label">Крок 4 / 4</p><h2>Як з' + NB + 'вами зв’язатися?</h2></div>' +
        '<form class="form" id="contact-form" novalidate>' +
        field('bk-name', 'Ім’я', 'text', 'Як до вас звертатися', 'name') +
        field('bk-phone', 'Телефон', 'tel', '+380 67 123 45 67', 'tel', ' inputmode="tel"') +
        '<div class="field"><label class="field__label" for="bk-comment">Коментар (необов’язково)</label>' +
        '<textarea class="field__input" id="bk-comment" name="bk-comment" placeholder="Ідея, розмір, місце на тілі, референси"></textarea></div>' +
        '<div class="field"><label class="check"><input type="checkbox" id="bk-agree"><span>Мені є 18 років, я погоджуюсь на обробку даних для зв’язку щодо запису.</span></label>' +
        '<p class="field__error" id="bk-agree-err" aria-live="polite"></p></div>' + HP_FIELD +
        '</form>' + navHTML(true, 'Підтвердити запис');
    }

    function renderCalendar() {
      var cal = $('#cal', stage); if (!cal) return;
      var y = view.getFullYear(), mo = view.getMonth();
      var first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
      var offset = (first.getDay() + 6) % 7;
      var prevDisabled = new Date(y, mo, 1) <= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      var nextDisabled = new Date(y, mo + 1, 1) > maxDate;
      var html = '<div class="cal__head"><button type="button" class="cal__btn" data-cal="-1" aria-label="Попередній місяць"' + (prevDisabled ? ' disabled' : '') + '>' + icon('left') + '</button>' +
        '<p class="cal__title">' + MONTHS[mo] + ' ' + y + '</p>' +
        '<button type="button" class="cal__btn" data-cal="1" aria-label="Наступний місяць"' + (nextDisabled ? ' disabled' : '') + '>' + icon('right') + '</button></div>' +
        '<div class="cal__grid">' + DOW.map(function (d) { return '<span class="cal__dow">' + d + '</span>'; }).join('');
      for (var i = 0; i < offset; i++) html += '<span class="cal__day is-empty"></span>';
      for (var d = 1; d <= days; d++) {
        var date = new Date(y, mo, d), s = iso(date);
        var off = date < minDate || date > maxDate || date.getDay() === 1;
        html += '<button type="button" class="cal__day' + (state.date === s ? ' is-selected' : '') + '" data-date="' + s + '"' + (off ? ' disabled' : '') +
          ' aria-label="' + niceDate(s) + (off ? ', недоступно' : '') + '"' + (state.date === s ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
      }
      html += '</div><p class="cal__note">Понеділок вихідний. Запис відкритий на' + NB + '60' + NB + 'днів уперед.</p>';
      cal.innerHTML = html;
    }
    function renderSlots() {
      var box = $('#slots', stage); if (!box) return;
      if (!state.date) { box.innerHTML = '<p class="slots__title">Час</p><p class="slots__empty">Спершу оберіть день у' + NB + 'календарі.</p>'; return; }
      box.innerHTML = '<p class="slots__title">Вільний час на ' + niceDate(state.date) + '</p><div class="slots__grid">' +
        SLOTS.map(function (t) {
          var b = busy(state.date, t);
          return '<button type="button" class="slot' + (state.time === t ? ' is-selected' : '') + '" data-time="' + t + '"' + (b ? ' disabled aria-label="' + t + ', зайнято"' : '') + (state.time === t ? ' aria-pressed="true"' : '') + '>' + t + '</button>';
        }).join('') + '</div>';
    }

    function bindStep() {
      if (state.step === 1) {
        $$('input[name="service"]', stage).forEach(function (inp) {
          inp.addEventListener('change', function () {
            state.services = $$('input[name="service"]:checked', stage).map(function (i) { return i.value; });
            stepError(''); renderReceipt();
          });
        });
      }
      if (state.step === 2) {
        $$('input[name="master"]', stage).forEach(function (inp) {
          inp.addEventListener('change', function () {
            state.master = inp.value;
            if (state.time && state.date && busy(state.date, state.time)) state.time = null;
            stepError(''); renderReceipt();
          });
        });
      }
      if (state.step === 3) {
        if (state.date) { var sd = parseIso(state.date); view = new Date(sd.getFullYear(), sd.getMonth(), 1); }
        renderCalendar(); renderSlots();
        stage.addEventListener('click', onCalClick);
      }
      if (state.step === 4) {
        var nameI = $('#bk-name', stage), phoneI = $('#bk-phone', stage), comI = $('#bk-comment', stage), agreeI = $('#bk-agree', stage);
        nameI.value = state.name; phoneI.value = state.phone; comI.value = state.comment; agreeI.checked = state.agree;
        nameI.addEventListener('input', function () { state.name = nameI.value.trim(); renderReceipt(); });
        phoneI.addEventListener('input', function (e) {
          if (!/^delete/.test(e.inputType || '')) phoneI.value = maskPhone(phoneI.value);
          state.phone = phoneI.value;
        });
        phoneI.addEventListener('blur', function () { phoneI.value = maskPhone(phoneI.value); state.phone = phoneI.value; });
        comI.addEventListener('input', function () { state.comment = comI.value; });
        agreeI.addEventListener('change', function () { state.agree = agreeI.checked; });
        $('#contact-form', stage).addEventListener('submit', function (e) { e.preventDefault(); next(); });
      }
      var b = $('[data-back]', stage); if (b) b.addEventListener('click', function () { go(state.step - 1); });
      var n = $('[data-next]', stage); if (n) n.addEventListener('click', next);
    }

    function onCalClick(e) {
      var nav = e.target.closest('[data-cal]');
      if (nav) {
        var dir = nav.getAttribute('data-cal');
        view = new Date(view.getFullYear(), view.getMonth() + parseInt(dir, 10), 1);
        renderCalendar();
        var live = $('#cal-live', stage); if (live) live.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
        var t = $('[data-cal="' + dir + '"]', stage);
        if (t && t.disabled) t = $('[data-cal="' + (-dir) + '"]', stage);
        if (t) t.focus();
        return;
      }
      var day = e.target.closest('[data-date]');
      if (day && !day.disabled) {
        state.date = day.getAttribute('data-date');
        if (state.time && busy(state.date, state.time)) state.time = null;
        renderCalendar(); renderSlots(); renderReceipt(); stepError('');
        var sel = $('[data-date="' + state.date + '"]', stage); if (sel) sel.focus();
        return;
      }
      var slot = e.target.closest('[data-time]');
      if (slot && !slot.disabled) {
        state.time = slot.getAttribute('data-time'); renderSlots(); renderReceipt(); stepError('');
        var ss = $('[data-time="' + state.time + '"]', stage); if (ss) ss.focus();
      }
    }

    function maskPhone(v) {
      var d = v.replace(/\D/g, '');
      if ('380'.indexOf(d) === 0) return '';            /* only (part of) the prefix left: clear */
      if (d.indexOf('380') === 0) d = d.slice(3);
      else if (d.charAt(0) === '0') d = d.slice(1);
      d = d.slice(0, 9);
      var out = '+380';
      if (d.length) out += ' ' + d.slice(0, 2);
      if (d.length > 2) out += ' ' + d.slice(2, 5);
      if (d.length > 5) out += ' ' + d.slice(5, 7);
      if (d.length > 7) out += ' ' + d.slice(7, 9);
      return out;
    }

    function missing(n) {
      if (n === 1 && !state.services.length) return 'Оберіть хоча б одну послугу.';
      if (n === 2 && !state.master) return 'Оберіть майстра або варіант «Будь-який вільний».';
      if (n === 3 && !state.date) return 'Оберіть день у календарі.';
      if (n === 3 && !state.time) return 'Оберіть вільний час.';
      return '';
    }
    function jump(n) {
      if (n > state.maxStep || n === state.step || state.step === 5) return;
      for (var k = Math.min(state.step, n); k < n; k++) {
        var msg = missing(k);
        if (msg) { if (k !== state.step) go(k); stepError(msg); return; }
      }
      go(n);
    }
    function validate() {
      var msg = missing(state.step);
      if (msg) { stepError(msg); return false; }
      if (state.step === 4) {
        var ok = true;
        ok = setFieldError($('#bk-name', stage), state.name.length >= 2 ? '' : 'Вкажіть ім’я, хоча б 2 літери') && ok;
        ok = setFieldError($('#bk-phone', stage), validPhone(state.phone) ? '' : 'Потрібен номер у форматі +380 XX XXX XX XX') && ok;
        var agreeErr = $('#bk-agree-err', stage);
        agreeErr.textContent = state.agree ? '' : 'Підтвердіть, будь ласка, що вам є 18 років.';
        ok = state.agree && ok;
        if (!ok) { stepError('Перевірте поля вище.'); var bad = $('[aria-invalid="true"]', stage) || $('#bk-agree', stage); if (bad) bad.focus(); }
        return ok;
      }
      return true;
    }

    function next() {
      if (!validate()) return;
      if (state.step === 4) {
        for (var k = 1; k <= 3; k++) { var msg = missing(k); if (msg) { go(k); stepError(msg); return; } }
        confirm(); return;
      }
      go(state.step + 1);
    }

    function go(n, initial) {
      var back = n < state.step;
      stage.removeEventListener('click', onCalClick);
      state.step = n;
      state.maxStep = Math.max(state.maxStep, n);
      var html = [null, step1, step2, step3, step4][n]();
      stage.innerHTML = '<div class="step' + (back ? ' is-back' : '') + '">' + html + '</div>';
      bindStep(); renderProgress();
      if (initial) return;
      var h = $('h2', stage); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      var top = root.getBoundingClientRect().top + window.scrollY - 20;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    var BOOK_ERR = {
      bad_name: [4, 'Вкажіть ім’я, хоча б 2 літери', 'bk-name'],
      bad_phone: [4, 'Потрібен номер у форматі +380 XX XXX XX XX', 'bk-phone'],
      bad_comment: [4, 'Коментар задовгий: до 1000 символів.'],
      bad_date: [3, 'Цей день уже недоступний. Оберіть інший.'],
      bad_time: [3, 'Цей час уже недоступний. Оберіть інший.'],
      bad_services: [1, 'Список послуг щойно змінився. Оновіть сторінку й оберіть ще раз.'],
      bad_master: [2, 'Цей майстер зараз не приймає запис. Оберіть іншого.'],
      too_many: [4, 'З цього номера вже є кілька нових записів. Адміністратор зателефонує найближчим часом.'],
      network: [4, 'Немає зв’язку. Перевірте інтернет і натисніть ще раз: дані збережені.']
    };
    var sending = false;

    function confirm() {
      if (sending) return;
      var live = window.TH && TH.mode === 'live';
      if (!live) { showConfirmed('TH-' + String(Math.floor(10000 + Math.random() * 89999)), true); return; }
      var btn = $('[data-next]', stage);
      var label = btn && $('.btn__label', btn);
      sending = true;
      if (btn) { btn.disabled = true; label.textContent = 'Надсилаємо…'; }
      TH.createBooking({
        services: state.services, master: state.master, date: state.date, time: state.time,
        name: state.name, phone: state.phone, comment: state.comment, hp: hpValue(stage)
      }).then(function (res) {
        sending = false;
        showConfirmed(res && res.code ? res.code : '', false);
      }, function (err) {
        sending = false;
        if (btn) { btn.disabled = false; label.textContent = 'Підтвердити запис'; }
        var e = BOOK_ERR[err.code] || [4, 'Не вдалося надіслати запис. Спробуйте ще раз або зателефонуйте нам.'];
        if (e[0] !== 4) {
          if (e[0] === 3) state.time = null;
          go(e[0]); stepError(e[1]); renderReceipt();
          return;
        }
        if (e[2]) setFieldError($('#' + e[2], stage), e[1]);
        stepError(e[1]);
      });
    }

    function showConfirmed(id, demo) {
      if (demo) {
        var list = store.get('th-bookings', []);
        list.push({ id: id, services: state.services, master: state.master, date: state.date, time: state.time, name: state.name, phone: state.phone, comment: state.comment, total: total(), at: new Date().toISOString() });
        store.set('th-bookings', list);
      }
      state.step = 5; renderProgress();
      progress.forEach(function (b) { b.classList.add('is-done'); b.classList.remove('is-current'); });
      var m = state.master === 'any' ? null : masterBySlug(state.master);
      stage.innerHTML = '<div class="step confirm" role="status">' + stampSVG() +
        '<p class="success__title">Запис підтверджено</p>' +
        (id ? '<p class="confirm__num">Номер запису: ' + esc(id) + '</p>' : '') +
        '<p class="text">' + esc(state.name) + ', чекаємо вас ' + niceDate(state.date) + ' о' + NB + state.time + (m ? ' у' + NB + 'майстра ' + esc(m.name) + nickq(m) : '') + '. Адміністратор зателефонує напередодні, щоб підтвердити деталі.</p>' +
        (demo ? '<p class="reassure">Демо-сайт: запис зберігся лише у' + NB + 'вашому браузері, нікуди не' + NB + 'надсилався.</p>' : '') +
        '<div class="btn-row"><a class="btn" href="index.html"><span class="btn__fill"></span><span class="btn__label">Повернутися на' + NB + 'головну</span></a>' +
        '<a class="btn btn--ghost" href="gallery.html"><span class="btn__fill"></span><span class="btn__label">Надихнутися роботами</span></a></div></div>';
      var t = $('.success__title', stage); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
    }

    go(1, true);
    renderReceipt();
  }

  /* =========================================================
     BOOT
     ========================================================= */
  function renderData() {
    var m;
    if ((m = $('#services-mount'))) renderServices(m);
    if ((m = $('#works-mount'))) renderWorks(m, parseInt(m.getAttribute('data-limit') || '0', 10) || null);
    if ((m = $('#masters-mount'))) renderMastersPreview(m, parseInt(m.getAttribute('data-limit') || '4', 10));
    if ((m = $('#masters-full'))) renderMastersFull(m);
    if ((m = $('#reviews-mount'))) renderReviews(m);
    if ((m = $('#gallery-count'))) m.textContent = GALLERY.length;
    if ((m = $('#gallery-styles'))) m.textContent = GALLERY.map(function (g) { return g.style; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).length;
    if ((m = $('#gallery-masters'))) m.textContent = MASTERS.length;
    renderInfo();
    renderStats();
    observeReveals(document);
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectSprite();
    initSticker();
    initMenu();
    initTransitions();
    initFloatCta();

    var src = window.TH || { load: function () { return Promise.resolve(window.TH_SEED); } };
    src.load(function onFresh(d) {
      // свіжіші дані прийшли після показу (адмін щойно щось змінив): перемальовуємо блоки
      applyData(d);
      renderData();
      if (initGiveaway.refresh) initGiveaway.refresh();
    }).then(function (d) {
      applyData(d);
      renderData();
      initCounters();
      initGiveaway();
      initBooking();
      if (window.location.hash) {
        var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        if (target) setTimeout(function () { target.scrollIntoView({ block: 'start' }); }, 60);
      }
    });
  });
})();
