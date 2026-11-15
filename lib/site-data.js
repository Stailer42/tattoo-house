/*
 * Tattoo House: дані для сторінок сайту.
 * ---------------------------------------------------------------
 * Читає видимі послуги, майстрів, фото, відгуки й налаштування з Supabase
 * через REST (без бібліотеки supabase-js, щоб сайт лишався легким).
 * Пише лише через RPC create_booking / join_giveaway (перевірки на сервері).
 *
 * Порядок даних для першого показу:
 *   1) кеш з localStorage (миттєво), потім тихе оновлення з мережі;
 *   2) немає кешу: чекаємо мережу до 3 с;
 *   3) мережа недоступна або Supabase не налаштовано: стартові дані з seed-data.js.
 * TH.mode: "live" (є config.js з ключами) або "demo" (без бази, форми зберігаються в браузері).
 */
(function () {
  'use strict';

  var cfg = window.TH_CONFIG || {};
  var SEED = window.TH_SEED || { services: [], masters: [], gallery: [], reviews: [], info: {}, giveaway: {} };
  var CACHE_KEY = 'th-site-cache-v1';
  var WAIT_MS = 3000;
  var live = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var base = live ? String(cfg.supabaseUrl).replace(/\/+$/, '') : '';

  function headers(json) {
    var h = { apikey: cfg.supabaseAnonKey };
    // старі anon-ключі (JWT) йдуть і в Authorization; нові sb_publishable_ лише в apikey
    if (/^eyJ/.test(cfg.supabaseAnonKey || '')) h.Authorization = 'Bearer ' + cfg.supabaseAnonKey;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function readCache() {
    try { var v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeCache(d) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) { /* сховище недоступне */ }
  }

  function merge(defaults, data) {
    var out = {}, k;
    for (k in defaults) out[k] = defaults[k];
    for (k in data || {}) if (data[k] !== undefined && data[k] !== null && data[k] !== '') out[k] = data[k];
    return out;
  }

  // Однакова форма даних незалежно від джерела
  function normalize(d) {
    var info = merge(SEED.info, d.info);
    info.stats = merge(SEED.info.stats || {}, (d.info || {}).stats);
    var gw = merge(SEED.giveaway, d.giveaway);
    // переможця й вимкнення беремо як є (null / false не можна підміняти стартовими)
    gw.winner = d.giveaway && 'winner' in d.giveaway ? d.giveaway.winner : SEED.giveaway.winner;
    if (d.giveaway && typeof d.giveaway.enabled === 'boolean') gw.enabled = d.giveaway.enabled;
    var vis = function (rows) { return (rows || []).filter(function (r) { return r.visible !== false; }); };
    return {
      services: vis(d.services), masters: vis(d.masters), gallery: vis(d.gallery), reviews: vis(d.reviews),
      info: info, giveaway: gw
    };
  }

  function get(path) {
    return fetch(base + '/rest/v1/' + path, { headers: headers(false), cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      return r.json();
    });
  }

  function fetchAll() {
    var q = '?select=*&visible=eq.true&order=sort.asc';
    return Promise.all([
      get('services' + q), get('masters' + q), get('gallery' + q), get('reviews' + q), get('settings?select=id,data')
    ]).then(function (r) {
      var settings = {};
      r[4].forEach(function (row) { settings[row.id] = row.data; });
      return normalize({ services: r[0], masters: r[1], gallery: r[2], reviews: r[3], info: settings.info, giveaway: settings.giveaway });
    });
  }

  /*
   * TH.load(onUpdate) -> Promise<data>
   * onUpdate(data) викликається, якщо пізніше прийшли свіжіші дані, ніж показані.
   */
  function load(onUpdate) {
    var seed = normalize(SEED);
    if (!live) return Promise.resolve(seed);

    var cached = readCache();
    var shown = null;
    var net = fetchAll().then(function (fresh) {
      writeCache(fresh);
      if (shown && JSON.stringify(shown) !== JSON.stringify(fresh) && onUpdate) onUpdate(fresh);
      return fresh;
    });
    net.catch(function (e) { console.warn('Tattoo House: дані з бази недоступні, показую збережені', e); });

    if (cached) {
      shown = cached;
      return Promise.resolve(cached);
    }
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; shown = seed; resolve(seed); } }, WAIT_MS);
      net.then(function (fresh) {
        if (done) return;
        done = true; clearTimeout(timer); shown = fresh; resolve(fresh);
      }, function () {
        if (done) return;
        done = true; clearTimeout(timer); shown = seed; resolve(seed);
      });
    });
  }

  // Виклик серверної функції. Помилка -> Error з code = текст exception у SQL (bad_phone, closed, ...)
  function rpc(name, args) {
    if (!live) return Promise.reject(Object.assign(new Error('demo'), { code: 'demo' }));
    return fetch(base + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers(true), body: JSON.stringify(args) })
      .then(function (r) {
        return r.text().then(function (t) {
          var body = null;
          try { body = t ? JSON.parse(t) : null; } catch (e) { body = t; }
          if (!r.ok) {
            var msg = body && body.message ? body.message : 'HTTP ' + r.status;
            throw Object.assign(new Error(msg), { code: msg });
          }
          return body;
        });
      }, function (e) {
        throw Object.assign(new Error('network'), { code: 'network', cause: e });
      });
  }

  window.TH = {
    get mode() { return live ? 'live' : 'demo'; },
    load: load,
    // запасні дані, якщо кеш чи відповідь бази виявились зіпсованими
    seed: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* немає сховища */ } return normalize(SEED); },
    createBooking: function (p) {
      return rpc('create_booking', {
        p_services: p.services, p_master: p.master, p_date: p.date, p_time: p.time,
        p_name: p.name, p_phone: p.phone, p_comment: p.comment || '', p_hp: p.hp || ''
      });
    },
    joinGiveaway: function (p) {
      return rpc('join_giveaway', { p_name: p.name, p_contact: p.contact, p_hp: p.hp || '' });
    }
  };
})();
