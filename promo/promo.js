/*
 * Tattoo House: промо-відео для Instagram Reels (24 с, 1080×1920, 30 fps).
 * ---------------------------------------------------------------
 * Справжні сторінки сайту живуть у чотирьох <iframe> (той самий origin),
 * усе, що рухається, рахує одна функція render(t) від часу t у секундах:
 *   - GSAP-таймлайн (підписи, вікно, фінал) перемотується через tl.time(t);
 *   - доріжки (курсори, збірка блоків, скрол, hover, кліки) рахуються з t.
 * Тому будь-яку секунду можна показати знову і записати відео без ривків.
 *
 * Режими (параметри адреси):
 *   promo/index.html            прев'ю в реальному часі, повзунок унизу
 *   promo/index.html?t=12.5     стоп-кадр на 12.5 с (точний: прокручує всі кадри до нього)
 *   promo/index.html?record     для record.mjs: нічого не грає, кадри замовляє записувач
 */
'use strict';

/* =========================================================
   ЗМІНЮЙ ТУТ: тексти фіналу, нік, підписи
   ========================================================= */
const PROMO = {
  nick: '@_volodimir_23_',
  // фінальний заголовок: рядки через «|», «~» = нерозривний пробіл, «*слово» = червоне
  title: 'Замовляйте | у~мене *сайт',
  sub: 'Пишіть у~директ',
  cta: 'Написати',
  tilt: 'random',              // нахил наклейки-лого: 'random' (±4…11°) або число в градусах
  url: 'stailer42.github.io/tattoo-house/',   // текст в адресному рядку мокапа
  captions: {
    hookLabel: 'Сайт для тату-салону',
    hook: 'Збираю<br>сайт',
    blocks: 'Блоків на&nbsp;сторінці:',
    done: '<em>Готово.</em>',
    home: ['01 / Головна', 'Головна<br>сторінка', 'Плавні анімації <b>/</b> ефекти'],
    gallery: ['02 / Галерея', 'Галерея<br>робіт', 'Ефект при&nbsp;наведенні'],
    booking: ['03 / Запис', 'Онлайн-<br>запис', 'Чек рахує суму&nbsp;сам'],
    masters: ['04 / Майстри', 'Профілі<br>майстрів', 'Досвід, стиль і&nbsp;ціни'],
  },
};

/* =========================================================
   Константи кадру (ті самі числа, що в style.css)
   ========================================================= */
const FPS = 30;
const DURATION = 24;
const K = 1000 / 1440;                           // масштаб сайту у вікні
const VIEW = { x: 40, y: 560 + 46, w: 1000, h: 625, iw: 1440, ih: 900 };
const CENTER = [540, 918];

const QS = new URLSearchParams(location.search);
const MODE = QS.has('record') ? 'record' : QS.has('t') ? 'still' : 'preview';

const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const EASES = {};
const ease = (name) => EASES[name] || (EASES[name] = gsap.parseEase(name));
const frameNo = (t) => Math.round(t * FPS);

// детермінований «рандом», щоб кожен запис був однаковий
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = rng(2016);
const rr = (a, b) => a + rand() * (b - a);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, timeout, what) {
  const t0 = performance.now();
  for (;;) {
    let v; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > timeout) throw new Error('Не дочекався: ' + what);
    await sleep(50);
  }
}
function withTimeout(p, ms) { return Promise.race([p, sleep(ms)]); }

/* =========================================================
   IFRAME: завантаження, підготовка, віртуальний час
   ========================================================= */
const PAGES = ['index', 'gallery', 'booking', 'masters'];
const PAGE_FILE = { index: '', gallery: 'gallery.html', booking: 'booking.html', masters: 'masters.html' };
const READY_SEL = {
  index: ['#services-mount .service', '#works-mount .work', '#masters-mount .master', '#reviews-mount .review'],
  gallery: ['#works-mount .work'],
  booking: ['#booking-stage .option', '#receipt .receipt__head'],
  masters: ['#masters-full .master-card'],
};
const F = {};

// :hover сайту не спрацює без справжньої миші: копіюємо кожне правило з :hover у клас .ph
function hoverClone(doc) {
  let out = '';
  const walk = (rules, wrap) => {
    for (const r of rules) {
      if (r.selectorText && r.selectorText.includes(':hover')) {
        const sel = r.selectorText.split(',').filter((s) => s.includes(':hover')).map((s) => s.replace(/:hover/g, '.ph')).join(',');
        out += wrap(sel + '{' + r.style.cssText + '}') + '\n';
      } else if (r.cssRules && r.media) {
        walk(r.cssRules, (s) => wrap('@media ' + r.media.mediaText + '{' + s + '}'));
      }
    }
  };
  for (const sh of doc.styleSheets) {
    let rules;
    try { rules = sh.cssRules; } catch (e) { continue; }   // Google Fonts: інший origin
    walk(rules, (s) => s);
  }
  return out;
}

const FRAME_CSS = `
html { scroll-behavior: auto !important; scrollbar-width: none !important; }
html::-webkit-scrollbar { display: none; }
:focus, :focus-visible { outline: none !important; }
body, main { animation: none !important; }
.skip { display: none !important; }
`;

async function loadFrame(name, oldDoc) {
  const el = $('iframe[data-page="' + name + '"]');
  const doc = await waitFor(() => {
    const d = el.contentDocument;
    return d && d !== oldDoc && d.readyState === 'complete' && d.location.href !== 'about:blank' && d.body ? d : null;
  }, 30000, 'сторінка ' + name);
  const win = el.contentWindow;
  await waitFor(() => READY_SEL[name].every((s) => doc.querySelector(s)), 15000, 'дані на ' + name);

  if (!doc.getElementById('promo-css')) {
    const st = doc.createElement('style');
    st.id = 'promo-css';
    st.textContent = FRAME_CSS + hoverClone(doc);
    doc.head.appendChild(st);
  }
  doc.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in'));
  doc.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
  doc.querySelectorAll('iframe').forEach((i) => { i.loading = 'eager'; });
  await withTimeout(Promise.all([...doc.images].map((img) => img.decode().catch(() => {}))), 12000);
  await withTimeout(doc.fonts.ready, 8000);
  // вхідні анімації сайту (rise, stick, page-in) домотуємо до кінця, щоб виміряти блоки на місці
  doc.getAnimations().forEach((a) => {
    const timing = a.effect && a.effect.getComputedTiming();
    if (timing && timing.iterations !== Infinity) { try { a.finish(); } catch (e) { /* без кінця */ } }
  });
  return { name, el, win, doc, clock: null };
}

/*
 * Віртуальний час для сторінки: підміняємо годинники й таймери вікна iframe,
 * а CSS-анімації та transitions ставимо на паузу й виставляємо їм currentTime.
 * Тоді лічильники, друк чека, крутіння кола й hover ідуть рівно по 1/30 с на кадр,
 * скільки б браузер не думав над скриншотом.
 */
function installClock(win) {
  const p0 = win.performance.now();
  const d0 = win.Date.now();
  // віртуальні id починаються з мільйона, щоб не плутатися з таймерами, заведеними до freeze()
  const c = { now: 0, timers: [], rafs: new Map(), seq: 1e6, reg: new WeakMap() };
  const nativeClearT = win.clearTimeout.bind(win), nativeClearI = win.clearInterval.bind(win);
  win.performance.now = () => p0 + c.now;
  win.Date.now = () => d0 + c.now;
  win.setTimeout = (fn, ms, ...a) => { const id = c.seq++; c.timers.push({ id, at: c.now + Math.max(0, +ms || 0), fn, a }); return id; };
  win.setInterval = (fn, ms, ...a) => { const id = c.seq++; const every = Math.max(10, +ms || 10); c.timers.push({ id, at: c.now + every, fn, a, every }); return id; };
  win.clearTimeout = win.clearInterval = (id) => {
    if (id < 1e6) { nativeClearT(id); nativeClearI(id); return; }
    const i = c.timers.findIndex((x) => x.id === id);
    if (i > -1) c.timers.splice(i, 1);
  };
  win.requestAnimationFrame = (fn) => { const id = c.seq++; c.rafs.set(id, fn); return id; };
  win.cancelAnimationFrame = (id) => { c.rafs.delete(id); };
  c.advance = (ms) => {
    if (ms < c.now) ms = c.now;               // назад віртуальний час не йде
    for (;;) {
      c.timers.sort((x, y) => x.at - y.at || x.id - y.id);
      const tm = c.timers[0];
      if (!tm || tm.at > ms) break;
      c.now = tm.at;
      if (tm.every) tm.at += tm.every; else c.timers.shift();
      try { if (typeof tm.fn === 'function') tm.fn(...tm.a); } catch (e) { console.error(e); }
    }
    c.now = ms;
    const cbs = [...c.rafs.values()];
    c.rafs.clear();
    cbs.forEach((cb) => { try { cb(p0 + ms); } catch (e) { console.error(e); } });
    for (const a of win.document.getAnimations()) {
      let r = c.reg.get(a);
      if (!r) {
        // нескінченні (крутіння кола, покачування артів) завжди з нульової фази, щоб кожен запис був однаковий
        const inf = a.effect && a.effect.getComputedTiming().iterations === Infinity;
        r = { start: ms, base: inf ? 0 : a.currentTime || 0 };
        c.reg.set(a, r); a.pause();
      }
      a.currentTime = r.base + (ms - r.start);
    }
  };
  return c;
}

let frozen = false;
function freeze() {
  if (frozen) return;
  frozen = true;
  PAGES.forEach((n) => { F[n].clock = installClock(F[n].win); });
}

// SVG-спрайт сайту (черепи, ріжки, блискавки) беремо з iframe, а не малюємо заново
function importSprite() {
  const sprite = [...F.index.doc.body.children].find((n) => n.tagName.toLowerCase() === 'svg' && n.querySelector('symbol'));
  if (sprite) document.body.insertBefore(document.importNode(sprite, true), document.body.firstChild);
}

/* =========================================================
   Геометрія: сторінка → кадр
   ========================================================= */
function docRect(f, el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top + f.win.scrollY, w: r.width, h: r.height };
}
const toStage = (x, y) => [VIEW.x + x * K, VIEW.y + y * K];
function liveCenter(name, getEl, ax = .5, ay = .5) {
  return () => {
    const f = F[name]; if (!f) return null;
    const el = typeof getEl === 'function' ? getEl() : f.doc.querySelector(getEl);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return toStage(r.left + r.width * ax, clamp(r.top + r.height * ay, 20, VIEW.ih - 30));
  };
}

// кусково-гладка функція: [[t, value, ease], ...]
function keyframes(points) {
  const k = points.map(([t, v, e]) => ({ t, v, e: ease(e || 'power2.inOut') }));
  return (t) => {
    if (t <= k[0].t) return k[0].v;
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i], b = k[i + 1];
      if (t <= b.t) return lerp(a.v, b.v, b.e(b.t === a.t ? 1 : (t - a.t) / (b.t - a.t)));
    }
    return k[k.length - 1].v;
  };
}

/* =========================================================
   Курсор: шлях з ключових точок; точка може бути функцією (живий елемент)
   ========================================================= */
class Path {
  constructor() { this.k = []; }
  add(t, p, e) { this.k.push({ t, p, e: ease(e || 'power2.inOut'), last: null }); return this; }
  sort() { this.k.sort((a, b) => a.t - b.t); return this; }
  val(i, t) {
    const kf = this.k[i];
    if (typeof kf.p !== 'function') return kf.p;
    const v = kf.p(t);
    if (v) kf.last = v;
    return kf.last || (i > 0 ? this.val(i - 1, t) : CENTER);
  }
  at(t) {
    const k = this.k;
    if (!k.length) return CENTER;
    if (t <= k[0].t) return this.val(0, t);
    for (let i = 0; i < k.length - 1; i++) {
      const b = k[i + 1];
      if (t <= b.t) {
        const a = k[i];
        const q = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        const e = b.e(q), pa = this.val(i, t), pb = this.val(i + 1, t);
        return [lerp(pa[0], pb[0], e), lerp(pa[1], pb[1], e)];
      }
    }
    return this.val(k.length - 1, t);
  }
  lastT() { return this.k.length ? this.k[this.k.length - 1].t : 0; }
  lastP() { return this.k.length ? this.k[this.k.length - 1].p : CENTER; }
}

const CURSOR_DEFS = [
  { devil: true, tag: 'арт', c: '#d90429', tc: '#fff' },
  { c: '#f2f2f2', tag: 'дизайн' },
  { c: '#ffb703', tag: 'код' },
  { c: '#22d3ee' },
  { c: '#a3e635', tag: 'анімація' },
  { c: '#ff4d6d', tc: '#fff' },
  { c: '#c084fc', tag: 'текст' },
  { c: '#fb923c' },
  { c: '#38bdf8', tag: 'фото' },
  { c: '#f2f2f2' },
  { c: '#facc15' },
  { c: '#f472b6' },
];
const cursors = [];

function makeCursor(def) {
  const el = document.createElement('div');
  el.className = 'cursor';
  el.style.setProperty('--c', def.c);
  if (def.tc) el.style.setProperty('--tc', def.tc);
  el.innerHTML = def.devil
    ? '<div class="cursor__devil"><img src="../assets/cursor/devil.svg" alt=""><img src="../assets/cursor/devil-hover.svg" alt=""></div>'
    : '<svg class="cursor__arrow" viewBox="0 0 36 36"><path d="M3 2.5 3 30.5 10.4 23.6 15.6 34.2 21 31.8 15.9 21.4 26 21.4Z"/></svg>';
  if (def.tag) el.insertAdjacentHTML('beforeend', '<span class="cursor__tag">' + def.tag + '</span>');
  $('#cursors').appendChild(el);
  // кінчик стрілки: (3, 2.5) у 36 → 40 px; у чортика ріг (3, 2) у 32 → 54 px
  const tip = def.devil ? [5 - 4, 3.4 - 4] : [3.3, 2.8];
  return { def, el, tip, path: new Path(), show: [], press: [], hoverAt: [] };
}

/* =========================================================
   Побудова сцени
   ========================================================= */
let tl;
const pops = [];           // блоки, що «прилипають» під час збірки
const ghosts = [];         // каркаси, які тягнуть курсори
const hovers = [];         // {page, get, t0, t1}
const actions = [];        // {t, page, run}
const clicks = [];         // {t, cursor}
const arts = [];           // фонові арти
let scrollFns = {};
let counterEl = null;
let tilt = 0;

const SWITCHES = [
  { t: 9.45, from: 'index', to: 'gallery' },
  { t: 11.9, from: 'gallery', to: 'booking' },
  { t: 15.2, from: 'booking', to: 'masters' },
];

// нескінченні анімації сайту (покачування артів, коло) на нульову фазу: тоді розміри й координати
// блоків, які міряє build(), однакові в кожному запуску
function resetLoops(doc) {
  doc.getAnimations().forEach((a) => {
    const timing = a.effect && a.effect.getComputedTiming();
    if (timing && timing.iterations === Infinity) { a.pause(); a.currentTime = 0; }
  });
}

function build() {
  tl = gsap.timeline({ paused: true });
  const fi = F.index, d = fi.doc;
  PAGES.forEach((n) => resetLoops(F[n].doc));
  const maxY = d.scrollingElement.scrollHeight - VIEW.ih;
  const R = (sel, ctx) => (ctx || d).querySelector(sel);
  const yOf = (f, sel, off) => { const el = f.doc.querySelector(sel); return el ? Math.max(0, docRect(f, el).y + off) : 0; };

  /* ---------- скроли сторінок ---------- */
  const servicesY = yOf(fi, '#services .section-head', -40);
  const mastersY = yOf(fi, '#masters .section-head', -40);
  scrollFns.index = keyframes([
    [0, 0], [2.2, 0], [4.15, maxY, 'power1.in'], [4.25, maxY], [4.7, 0, 'power3.inOut'],
    [5.5, 0], [6.55, servicesY], [7.1, servicesY], [8.05, mastersY], [8.85, mastersY], [9.25, 0, 'power3.inOut'],
  ]);
  const gridY = yOf(F.gallery, '#works-mount', -30);
  scrollFns.gallery = keyframes([[0, 0], [9.8, 0], [10.7, gridY], [11.4, gridY], [11.7, 0, 'power3.inOut']]);
  const formY = yOf(F.booking, '#booking', -24);
  scrollFns.booking = keyframes([[0, 0], [12.3, 0], [12.7, formY], [14.75, formY], [15.05, 0, 'power3.inOut']]);
  const cardsY = yOf(F.masters, '#masters-full', -30);
  scrollFns.masters = keyframes([[0, 0], [15.55, 0], [16.5, cardsY]]);
  const sIndex = scrollFns.index;

  /* ---------- курсори ---------- */
  CURSOR_DEFS.forEach((def, i) => {
    const c = makeCursor(def);
    const ang = (i / CURSOR_DEFS.length) * Math.PI * 2 + .35;
    const off = [CENTER[0] + Math.cos(ang) * 1150, CENTER[1] + Math.sin(ang) * 1250];
    const stage = [CENTER[0] + Math.cos(ang) * 470, CENTER[1] + Math.sin(ang) * 420];
    c.path.add(0, off).add(.32 + i * .025, stage, 'power3.out');
    c.off = off;
    c.free = .32 + i * .025;
    c.show.push([0, i === 0 ? 17.1 : 4.85]);
    cursors.push(c);
  });

  /* ---------- збірка першого екрана ---------- */
  const B1 = [
    { sel: '.hero__bg', cur: 1, grab: .4, pop: .86, kind: 'fade', ghost: 'stretch', tag: 'фон' },
    { sel: '.nav-list--left', cur: 2, grab: .5, pop: .95, ghost: 'move', from: 'left', tag: 'меню' },
    { sel: '.nav-list--right', cur: 3, grab: .55, pop: 1.02, ghost: 'move', from: 'right', tag: 'меню' },
    { sel: '.brand', cur: 0, grab: .62, pop: 1.12, kind: 'stick', ghost: 'move', from: 'top', tag: 'лого' },
    { sel: '.brand-title', cur: 4, grab: .72, pop: 1.22, ghost: 'move', from: 'top', tag: 'назва' },
    { sel: '.hero .label', cur: 5, grab: .8, pop: 1.3, ghost: 'move', from: 'left' },
    { sel: '.hero h1', cur: 6, grab: .86, pop: 1.42, ghost: 'move', from: 'left', tag: 'заголовок' },
    { sel: '.hero .lead', cur: 7, grab: .98, pop: 1.56, ghost: 'move', from: 'bottom', tag: 'текст' },
    { sel: '.hero__text > .rise.d5', cur: 8, grab: 1.08, pop: 1.7, ghost: 'move', from: 'bottom', tag: 'кнопки' },
    { sel: '.hero .orbit', cur: 9, grab: 1.14, pop: 1.86, kind: 'orbit', ghost: 'move', from: 'right', tag: 'коло' },
    { sel: '.hero > .art', cur: 10, grab: 1.5, pop: 1.98, kind: 'art' },
    { sel: '.btn-row__art', cur: 11, grab: 1.6, pop: 2.06, kind: 'art' },
  ];
  B1.forEach((task) => {
    const el = R(task.sel);
    if (!el) return;
    const r = docRect(fi, el);
    const c = cursors[task.cur];
    const p = addPop(el, r, task.pop, task.kind);
    if (task.ghost === 'stretch') {
      const grabP = [VIEW.x + 70, VIEW.y + 50];
      const dropP = [VIEW.x + r.w * K, VIEW.y + Math.min(r.h, VIEW.ih) * K];
      c.path.add(task.grab, grabP, 'power3.out').add(task.pop, dropP, 'back.out(1.3)');
      ghosts.push({ cur: c, kind: 'stretch', t0: task.grab, t1: task.pop, tag: task.tag });
    } else {
      const anchor = [r.x + r.w * rr(.3, .7), r.y + Math.min(r.h, 400) * rr(.35, .65)];
      const target = toStage(anchor[0], anchor[1]);
      const away = { left: [-640, rr(-60, 60)], right: [640, rr(-60, 60)], top: [rr(-80, 80), -420], bottom: [rr(-80, 80), 460] }[task.from || 'bottom'];
      const grabP = [target[0] + away[0], target[1] + away[1]];
      c.path.add(task.grab, grabP, 'power3.out').add(task.pop, target, task.ghost ? 'back.out(1.4)' : 'power3.out');
      if (task.ghost) {
        ghosts.push({ cur: c, kind: 'move', t0: task.grab, t1: task.pop, tag: task.tag,
          w: r.w * K, h: Math.min(r.h, VIEW.ih) * K, ax: (anchor[0] - r.x) * K, ay: (anchor[1] - r.y) * K });
      }
    }
    c.free = task.pop + .06;
    p.cur = c;
  });

  /* ---------- збірка решти сторінки на швидкому скролі ---------- */
  const B2_SEL = [
    '#merits > .art', '#merits .section-head > *', '#merits .stat', '#merits .review',
    'main > .wire',
    '#services > .art', '#services .section-head > *', '#services .service', '#services .section-foot',
    '#works > .art', '#works .section-head > *', '#works .work', '#works .section-foot',
    '#masters > .art', '#masters .section-head > *', '#masters .master', '#masters .section-foot',
    '.giveaway > .art', '.giveaway__intro', '.giveaway__panel',
    '.emotion > .art', '.emotion__big', '.emotion__words', '.emotion > .container > .text', '.emotion .section-foot',
    '.site-footer > .art', '.site-footer__grid > *',
  ].join(',');
  const GHOST_SEL = '.section-head > div, .giveaway__panel, .emotion__big, .site-footer__grid > div';
  const enterT = (y) => {
    for (let t = 2.2; t <= 4.15; t += 1 / 120) if (sIndex(t) + VIEW.ih * .82 >= y) return t;
    return 4.15;
  };
  const tasks = [...d.querySelectorAll(B2_SEL)].map((el) => {
    const r = docRect(fi, el);
    const isArt = el.classList.contains('art');
    return { el, r, t: Math.max(2.2, enterT(r.y + 30)), kind: isArt ? 'art' : 'pop', ghost: el.matches(GHOST_SEL),
      tag: el.matches('.section-head > div') ? 'секція' : el.matches('.site-footer__grid > div') ? 'футер' : 'блок' };
  }).sort((a, b) => a.t - b.t);
  let prevT = 0;
  tasks.forEach((task) => {                     // сусіди в ряду з'являються легкою драбинкою
    task.t = Math.min(4.12, Math.max(task.t, prevT + .03));
    prevT = task.t;
  });
  tasks.forEach((task) => {
    const p = addPop(task.el, task.r, task.t, task.kind);
    if (task.kind === 'art') return;
    // вільний курсор, який встигає; каркаси секцій беруть навіть той, що трохи запізнюється
    const c = cursors.slice().sort((a, b) => a.free - b.free)[0];
    if (!task.ghost && c.free > task.t - .14) return;
    const arrive = Math.max(task.t, c.free + .16);
    const depart = Math.max(c.free, arrive - .34);
    const ax = rr(.25, .7), ay = rr(.25, .6);
    const r = task.r;
    // поки летить, курсор веде блок; після «прилипання» лишається на місці, а сторінка їде далі
    const target = (t) => toStage(r.x + r.w * ax, clamp(r.y + Math.min(r.h, 500) * ay - sIndex(Math.min(t, arrive)), 60, VIEW.ih - 60));
    c.path.add(depart, c.path.lastP()).add(arrive, target, task.ghost ? 'back.out(1.3)' : 'power3.out');
    if (task.ghost) {
      ghosts.push({ cur: c, kind: 'move', t0: depart, t1: arrive, tag: task.tag,
        w: r.w * K, h: Math.min(r.h, 500) * K, ax: r.w * ax * K, ay: Math.min(r.h, 500) * ay * K });
    }
    c.free = arrive + .05;
    p.cur = c;
  });

  /* ---------- курсори розлітаються, чортик лишається ---------- */
  cursors.forEach((c, i) => {
    const hold = Math.max(c.free, 4.25 + i * .015);
    c.path.add(hold, c.path.lastP());
    if (i === 0) c.path.add(Math.max(4.9, hold + .2), [VIEW.x + VIEW.w * .55, VIEW.y + VIEW.h * .55], 'power3.inOut');
    else c.path.add(Math.max(4.78, hold + .15), c.off, 'power2.in');
  });

  buildShowcase();
  buildCaptions();
  buildFinal();

  /* ---------- вікно: «порожнє полотно», спалах «готово» ---------- */
  tl.fromTo('#canvas-grid', { autoAlpha: 1 }, { autoAlpha: 0, duration: .9, ease: 'power1.in' }, 1.1);
  tl.fromTo('#flash', { opacity: 0 }, { opacity: .85, duration: .06, ease: 'none' }, 4.72);
  tl.fromTo('#flash', { opacity: .85 }, { opacity: 0, duration: .32, ease: 'power2.out', immediateRender: false }, 4.78);
  tl.fromTo('#win', { scale: 1 }, { scale: 1.035, duration: .08, yoyo: true, repeat: 1, ease: 'power1.out', immediateRender: false }, 4.72);

  /* ---------- фон ---------- */
  const ART_HOOK = [
    ['skull', -120, 1440, 520, false, -12], ['horns', 790, 40, 300, true, 14], ['bolt', 18, 250, 190, true, -20],
    ['flame', 860, 1320, 260, true, 10], ['dagger', 70, 1560, 220, true, 28], ['star', 930, 470, 90, true, 0], ['star', 120, 1250, 70, false, 0],
  ];
  const ART_FINAL = [
    ['skull', -200, 1240, 720, true, -14], ['horns', 690, -60, 430, true, 16], ['flame', -70, 40, 330, true, -10],
    ['bolt', 850, 860, 260, true, 18], ['dagger', 820, 1470, 320, true, 30], ['star', 110, 690, 110, true, 0],
    ['star', 950, 640, 80, false, 0], ['spikes', 40, 1540, 220, false, -8], ['star', 470, 1640, 70, true, 0],
  ];
  ART_HOOK.forEach((a, i) => arts.push(makeArt('#arts', a, i, 0)));
  ART_FINAL.forEach((a, i) => arts.push(makeArt('#final-arts', a, i + 20, 17.3 + i * .05)));
  tl.fromTo('#arts', { autoAlpha: 1 }, { autoAlpha: 0, duration: .3, immediateRender: false }, 17.15);
  tl.fromTo('#glow', { scale: 1, opacity: 1 }, { scale: 1.3, opacity: 1.0, duration: .7, ease: 'power2.out', immediateRender: false }, 17.2);
  cursors.forEach((c) => c.path.sort());
}

function addPop(el, r, t0, kind) {
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const dur = { stick: .62, orbit: .55, fade: .3, art: .4 }[kind] || .3;
  const p = { el, r, t0, dur, kind: kind || 'pop', natural: parseFloat(cs.opacity) || 1, state: '' };
  if (kind !== 'art' && r.w * K > 24 && r.h * K > 14) {
    p.snap = document.createElement('div');
    p.snap.className = 'snap';
    p.snap.style.display = 'none';
    $('#fx').appendChild(p.snap);
  }
  pops.push(p);
  return p;
}

function makeArt(parent, [id, x, y, size, red, rot], i, t0) {
  const el = document.createElement('div');
  el.className = 'art' + (red ? ' art--red' : '');
  el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--size:' + size + 'px';
  el.innerHTML = '<svg aria-hidden="true"><use href="#i-' + id + '"></use></svg>';
  $(parent).appendChild(el);
  return { el, rot, t0, phase: i * 1.7, period: 5 + (i % 4) * 1.3 };
}

/* ---------- 5–17 с: показ сторінок одним курсором ---------- */
function buildShowcase() {
  const dev = cursors[0];
  const P = dev.path;
  const ix = (sel, ax, ay) => liveCenter('index', sel, ax, ay);
  const go = (t, target, e, hold) => { P.add(t, target, e); if (hold) P.add(t + hold, target); };
  const hover = (page, get, t0, t1) => hovers.push({ page, get: typeof get === 'function' ? get : () => F[page].doc.querySelector(get), t0, t1 });
  const click = (t, page, run) => { clicks.push({ t, cursor: dev }); dev.press.push(t); if (run) actions.push({ t, page, run }); };
  const bk = () => F.booking.doc;
  const bAll = (sel) => [...bk().querySelectorAll(sel)];

  // головна
  go(5.25, ix('.hero .btn--pulse', .45, .5), 'power3.out', .3);
  hover('index', '.hero .btn--pulse', 5.25, 5.6);
  go(6.55, ix('#services .service:nth-child(2)', .5, .45), 'power2.inOut', .5);
  hover('index', '#services .service:nth-child(2)', 6.55, 7.1);
  go(8.05, ix('#masters-mount .master:nth-child(1) .master__photo', .5, .45), 'power2.inOut', .35);
  hover('index', '#masters-mount .master:nth-child(1)', 8.0, 8.45);
  go(8.55, ix('#masters-mount .master:nth-child(2) .master__photo', .5, .45), 'power2.inOut', .3);
  hover('index', '#masters-mount .master:nth-child(2)', 8.5, 8.9);
  go(9.32, ix('.nav-list a[href="gallery.html"]', .5, .6), 'power3.inOut', .13);
  hover('index', '.nav-list a[href="gallery.html"]', 9.3, 9.5);
  click(9.42, 'index');

  // галерея
  const gx = (sel, ax, ay) => liveCenter('gallery', sel, ax, ay);
  go(9.85, [VIEW.x + VIEW.w * .5, VIEW.y + VIEW.h * .55], 'power2.out');
  go(10.68, gx('#works-mount .work:nth-child(2)', .5, .5), 'power2.inOut', .3);
  hover('gallery', '#works-mount .work:nth-child(2)', 10.66, 11.02);
  go(11.08, gx('#works-mount .work:nth-child(3)', .5, .5), 'power2.inOut', .3);
  hover('gallery', '#works-mount .work:nth-child(3)', 11.04, 11.42);
  go(11.78, gx('.nav-list a[href="booking.html"]', .5, .6), 'power3.inOut', .1);
  hover('gallery', '.nav-list a[href="booking.html"]', 11.74, 11.95);
  click(11.87, 'gallery');

  // запис: справжні кліки по формі, чек рахує сам
  const bx = (getEl) => liveCenter('booking', getEl, .5, .5);
  const opt = (i) => () => bAll('#booking-stage .option')[i];
  const nextBtn = () => bk().querySelector('#booking-stage [data-next]');
  const day = () => bAll('#booking-stage button.cal__day:not(:disabled)')[2] || bAll('#booking-stage button.cal__day:not(:disabled)')[0];
  const slot = () => bAll('#booking-stage .slot:not(:disabled)')[1] || bAll('#booking-stage .slot:not(:disabled)')[0];
  const press = (el) => { const e = el(); if (e) e.click(); };
  go(12.3, [VIEW.x + VIEW.w * .45, VIEW.y + VIEW.h * .5], 'power2.out');
  const steps = [
    [12.72, opt(0)], [13.04, opt(3)], [13.38, nextBtn], [13.8, opt(1)], [14.12, nextBtn], [14.45, day], [14.68, slot],
  ];
  steps.forEach(([t, getEl], i) => {
    go(t - .02, bx(getEl), i ? 'power2.inOut' : 'power3.out', .06);
    hover('booking', getEl, t - .14, t + .08);
    click(t + .02, 'booking', () => press(getEl));
  });
  go(15.06, liveCenter('booking', '.nav-list a[href="masters.html"]', .5, .6), 'power3.inOut', .1);
  hover('booking', '.nav-list a[href="masters.html"]', 15.02, 15.25);
  click(15.17, 'booking');

  // майстри
  go(15.65, [VIEW.x + VIEW.w * .5, VIEW.y + VIEW.h * .55], 'power2.out');
  go(16.3, liveCenter('masters', '#masters-full .master-card:nth-child(1) .master__photo', .55, .4), 'power2.inOut', .7);
  hover('masters', '#masters-full .master-card:nth-child(1)', 16.25, 17.2);
}

/* ---------- підписи над і під вікном ---------- */
function cap(slot, html, t0, t1) {
  const el = document.createElement('div');
  el.className = 'cap';
  el.innerHTML = html;
  $(slot).appendChild(el);
  tl.fromTo(el, { autoAlpha: 0, y: 46, filter: 'blur(14px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: .5, ease: 'expo.out' }, t0);
  tl.fromTo(el, { autoAlpha: 1, y: 0, filter: 'blur(0px)' }, { autoAlpha: 0, y: -40, filter: 'blur(10px)', duration: .26, ease: 'power2.in', immediateRender: false }, t1 - .26);
  return el;
}
function buildCaptions() {
  const C = PROMO.captions;
  const top = (label, big) => '<p class="cap__label">' + label + '</p><p class="cap__big">' + big + '</p>';
  const small = (s) => '<p class="cap__small">' + s + '</p>';
  cap('#cap-top', top(C.hookLabel, C.hook), .2, 4.6);
  const counter = cap('#cap-bottom', small(C.blocks + ' <b class="js-n">0</b>'), .55, 4.6);
  counterEl = counter.querySelector('.js-n');
  cap('#cap-top', top(C.hookLabel, C.done), 4.8, 5.55);
  const page = (c, t0, t1) => { cap('#cap-top', top(c[0], c[1]), t0, t1); cap('#cap-bottom', small(c[2]), t0 + .3, t1); };
  page(C.home, 5.55, 9.42);
  page(C.gallery, 9.6, 11.86);
  page(C.booking, 12.05, 15.16);
  page(C.masters, 15.35, 17.02);
}

/* ---------- 17–24 с: фінал ---------- */
function buildFinal() {
  tilt = PROMO.tilt === 'random' ? (4 + Math.random() * 7) * (Math.random() < .5 ? -1 : 1) : Number(PROMO.tilt) || 0;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  $('#final-title').innerHTML = PROMO.title.split('|').map((line) => line.trim().split(/\s+/).map((w) => {
    const red = w.startsWith('*');
    return '<span class="w' + (red ? ' w--red' : '') + '">' + esc(w.replace(/^\*/, '')).replace(/~/g, '&nbsp;') + '</span>';
  }).join(' ')).join('<br>');
  $('#final-sub').innerHTML = esc(PROMO.sub).replace(/~/g, '&nbsp;');
  $('#final-nick').textContent = PROMO.nick;
  $('#final-cta-label').textContent = PROMO.cta;

  tl.set('#final', { visibility: 'visible' }, 17.25);
  // вікно: глітч і різке стискання
  tl.fromTo('#win', { scale: 1, rotation: 0, autoAlpha: 1 }, { scale: .04, rotation: -9, autoAlpha: 0, duration: .3, ease: 'power3.in', immediateRender: false }, 17.14);
  tl.fromTo('#flash', { opacity: 0 }, { opacity: .7, duration: .05, ease: 'none', immediateRender: false }, 17.38);
  tl.fromTo('#flash', { opacity: .7 }, { opacity: 0, duration: .28, ease: 'power2.out', immediateRender: false }, 17.43);
  tl.fromTo('#final-sub', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: .45, ease: 'expo.out' }, 19.35);
  tl.fromTo('#final-cta', { autoAlpha: 0, scale: .5 }, { autoAlpha: 1, scale: 1, duration: .45, ease: 'back.out(2)' }, 20.0);

  // іскри біля кнопки
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    $('#sparks').appendChild(s);
  }

  // три курсори підлітають до кнопки, чортик «натискає»
  // точки підібрані так, щоб курсори й ярлики не закривали кнопку й нік
  const finals = [[1, [-80, 1700], [250, 1418], 20.2, 20.8], [4, [1200, 1600], [790, 1428], 20.35, 20.95], [8, [1200, 1150], [800, 1256], 20.5, 21.1]];
  finals.forEach(([ci, from, to, t0, t1]) => {
    const c = cursors[ci];
    c.path.add(t0 - .01, from).add(t1, to, 'back.out(1.6)');
    c.show.push([t0 - .01, DURATION + 1]);
  });
  const dev = cursors[0];
  dev.path.add(17.0, dev.path.lastP()).add(20.55, [1180, 1760]).add(21.3, [700, 1384], 'power3.out');
  dev.show.push([20.55, DURATION + 1]);
  dev.press.push(21.48);
  clicks.push({ t: 21.48, cursor: dev });
}

/* =========================================================
   Рендер одного моменту часу
   ========================================================= */
let lastT = -1;
const ran = new Set();
let bookingResetting = false;

function render(t) {
  t = clamp(t, 0, DURATION);
  if (t < lastT - 1e-6 && !frozen) onRewind(t);
  tl.time(t);
  runActions(t);
  applyPages(t);
  applyPops(t);
  applyHovers(t);
  if (frozen) PAGES.forEach((n) => F[n].clock.advance(Math.round(t * 1000)));
  applyScroll(t);
  applyCursors(t);
  applyGhosts(t);
  applySnaps(t);
  applyRipples(t);
  applyArts(t);
  applyFinal(t);
  applyWinGlitch(t);
  applyCounter(t);
  lastT = t;
}

function runActions(t) {
  actions.forEach((a, i) => {
    if (ran.has(i) || a.t > t) return;
    if (a.page === 'booking' && bookingResetting) return;
    ran.add(i);
    try { a.run(); } catch (e) { console.error(e); }
  });
}

// у прев'ю при перемотуванні назад форму запису перезавантажуємо і проходимо кроки знову
function onRewind(t) {
  const undone = actions.some((a, i) => ran.has(i) && a.t > t);
  if (!undone || bookingResetting) return;
  bookingResetting = true;
  ran.clear();
  const old = F.booking.doc;
  F.booking.win.location.reload();
  loadFrame('booking', old)
    .then((f) => { F.booking = f; })
    .catch((e) => console.error(e))
    .finally(() => { bookingResetting = false; lastT = -1; });
}

function applyScroll(t) {
  PAGES.forEach((n) => {
    const y = Math.round(scrollFns[n](t));
    const w = F[n].win;
    if (Math.abs(w.scrollY - y) > .5) {
      w.scrollTo(0, y);
      // сайт реагує на scroll (плаваюча кнопка «Записатися»); браузер шле подію лише з наступним
      // справжнім кадром, тому шлемо її одразу: стан сторінки не залежить від швидкості запису
      w.dispatchEvent(new w.Event('scroll'));
    }
  });
}

function activePage(t) {
  let p = 'index';
  SWITCHES.forEach((s) => { if (t >= s.t) p = s.to; });
  return p;
}
function applyPages(t) {
  // як перехід між сторінками на сайті: стара тьмяніє й розмивається, нова випливає
  const st = {};
  PAGES.forEach((n) => { st[n] = { o: 0, b: 0, y: 0 }; });
  st.index = { o: 1, b: 0, y: 0 };
  SWITCHES.forEach((s) => {
    if (t < s.t) return;
    const qo = clamp((t - s.t) / .3);
    st[s.from] = { o: 1 - qo, b: 6 * qo, y: -10 * qo };
    const e = ease('expo.out')(clamp((t - s.t - .15) / .5));
    st[s.to] = { o: e, b: 10 * (1 - e), y: 14 * (1 - e) };
  });
  PAGES.forEach((n) => {
    const s = st[n], el = F[n].el;
    el.classList.toggle('is-active', s.o > .001);
    el.style.opacity = s.o.toFixed(3);
    el.style.filter = s.b > .05 ? 'blur(' + s.b.toFixed(2) + 'px)' : '';
    el.style.translate = s.y ? '0 ' + s.y.toFixed(2) + 'px' : '';
  });
  $('#win-url').textContent = PROMO.url + PAGE_FILE[activePage(t)];
}

const POP_PROPS = ['opacity', 'scale', 'translate', 'rotate', 'transition', 'text-shadow'];
function applyPops(t) {
  const fi = frameNo(t);
  pops.forEach((p) => {
    const s = p.el.style;
    const q = (t - p.t0) / p.dur;
    if (q >= 1) {
      if (p.state !== 'done') { POP_PROPS.forEach((k) => s.removeProperty(k)); p.state = 'done'; }
      return;
    }
    if (q <= 0) {
      if (p.state !== 'hidden') {
        POP_PROPS.forEach((k) => s.removeProperty(k));
        s.setProperty('transition', 'none', 'important');
        s.setProperty('opacity', '0', 'important');
        p.state = 'hidden';
      }
      return;
    }
    p.state = 'anim';
    s.setProperty('transition', 'none', 'important');
    let op = p.natural * clamp(q / .3), sc = 1, tx = 0, ty = 0, rot = 0;
    if (p.kind === 'stick') {
      // як @keyframes stick на сайті: зверху, з обертанням, з відскоком
      const k = [[0, -40, -30, 1.7], [.55, 0, 4, .92], [.75, 0, -2, 1.03], [1, 0, 0, 1]];
      let i = 0; while (i < k.length - 2 && q > k[i + 1][0]) i++;
      const a = k[i], b = k[i + 1], e = ease('power2.out')(clamp((q - a[0]) / (b[0] - a[0])));
      ty = lerp(a[1], b[1], e); rot = lerp(a[2], b[2], e); sc = lerp(a[3], b[3], e);
      op = clamp(q / .4);
    } else if (p.kind === 'orbit') {
      const e = ease('back.out(1.6)')(q);
      sc = lerp(.35, 1, e); rot = lerp(-120, 0, e);
    } else if (p.kind === 'art') {
      const e = ease('back.out(2)')(q);
      sc = lerp(0, 1, e); rot = lerp(-45, 0, e);
    } else if (p.kind === 'fade') {
      op = p.natural * ease('power2.out')(q);
    } else {
      const e = ease('back.out(2.2)')(q);
      sc = lerp(1.12, 1, e); ty = lerp(18, 0, e);
    }
    const glitch = p.kind !== 'fade' && p.kind !== 'art' && q > .28 && q < .52;
    if (glitch) tx = fi % 2 ? 7 : -7;
    s.setProperty('opacity', op.toFixed(3), 'important');
    s.setProperty('scale', sc.toFixed(4), 'important');
    s.setProperty('translate', tx.toFixed(1) + 'px ' + ty.toFixed(1) + 'px', 'important');
    s.setProperty('rotate', rot.toFixed(2) + 'deg', 'important');
    if (glitch) s.setProperty('text-shadow', '3px 0 #ff1f45, -3px 0 #f2f2f2', 'important');
    else s.removeProperty('text-shadow');
  });
}

function applySnaps(t) {
  const sY = scrollFns.index(t);
  pops.forEach((p) => {
    if (!p.snap) return;
    const q = (t - (p.t0 + p.dur * .42)) / .24;
    const on = q >= 0 && q <= 1 && activePage(t) === 'index';
    if (!on) { if (p.snapOn) { p.snap.style.display = 'none'; p.snapOn = false; } return; }
    p.snapOn = true;
    const s = p.snap.style;
    s.display = 'block';
    s.width = (p.r.w * K).toFixed(1) + 'px';
    s.height = (p.r.h * K).toFixed(1) + 'px';
    s.transform = 'translate(' + (p.r.x * K).toFixed(1) + 'px,' + ((p.r.y - sY) * K).toFixed(1) + 'px) scale(' + (1 + .035 * q).toFixed(4) + ')';
    s.opacity = (q < .12 ? 1 : 1 - (q - .12) / .88).toFixed(3);
  });
}

function applyHovers(t) {
  const want = new Map();
  hovers.forEach((h) => {
    if (h.page === 'booking' && bookingResetting) return;
    let el; try { el = h.get(); } catch (e) { el = null; }
    if (!el) return;
    const on = t >= h.t0 && t < h.t1;
    want.set(el, (want.get(el) || false) || on);
  });
  want.forEach((on, el) => { if (el.classList.contains('ph') !== on) el.classList.toggle('ph', on); });
}

function applyCursors(t) {
  const hoverOn = hovers.some((h) => t >= h.t0 && t < h.t1);
  cursors.forEach((c) => {
    const vis = c.show.some(([a, b]) => t >= a && t < b);
    c.el.style.opacity = vis ? '1' : '0';
    if (!vis) return;
    const [x, y] = c.path.at(t);
    let sc = 1;
    c.press.forEach((tp) => { const q = (t - tp + .08) / .2; if (q > 0 && q < 1) sc = Math.min(sc, 1 - .18 * Math.sin(Math.PI * q)); });
    c.el.style.transform = 'translate(' + (x - c.tip[0]).toFixed(1) + 'px,' + (y - c.tip[1]).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
    if (c.def.devil) c.el.classList.toggle('is-hover', hoverOn && t < 17);
  });
}

function applyGhosts(t) {
  ghosts.forEach((g) => {
    if (!g.el) {
      g.el = document.createElement('div');
      g.el.className = 'ghost';
      g.el.style.setProperty('--c', g.cur.def.c);
      g.el.innerHTML = (g.tag ? '<span class="ghost__tag">' + g.tag + '</span>' : '') + '<i class="ghost__h"></i><i class="ghost__h"></i><i class="ghost__h"></i><i class="ghost__h"></i>';
      if (!g.tag) g.el.insertAdjacentHTML('afterbegin', '<span></span>');
      $('#ghosts').appendChild(g.el);
    }
    const s = g.el.style;
    const fadeIn = clamp((t - g.t0) / .08), fadeOut = 1 - clamp((t - g.t1) / .14);
    const o = t < g.t0 || t > g.t1 + .14 ? 0 : Math.min(fadeIn, fadeOut);
    s.opacity = o.toFixed(3);
    if (!o) return;
    const [cx, cy] = g.cur.path.at(Math.min(t, g.t1));
    if (g.kind === 'stretch') {
      s.width = Math.max(40, cx - VIEW.x).toFixed(1) + 'px';
      s.height = Math.max(30, cy - VIEW.y).toFixed(1) + 'px';
      s.transform = 'translate(' + VIEW.x + 'px,' + VIEW.y + 'px)';
    } else {
      s.width = g.w.toFixed(1) + 'px';
      s.height = g.h.toFixed(1) + 'px';
      s.transform = 'translate(' + (cx - g.ax).toFixed(1) + 'px,' + (cy - g.ay).toFixed(1) + 'px)';
    }
  });
}

function applyRipples(t) {
  clicks.forEach((c) => {
    if (!c.el) {
      c.el = document.createElement('div');
      c.el.className = 'ripple';
      $('#ripples').appendChild(c.el);
      c.pos = null;
    }
    const q = (t - c.t) / .42;
    if (q < 0 || q > 1) { c.el.style.opacity = '0'; return; }
    const [x, y] = c.cursor.path.at(c.t);
    c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (.3 + 1.4 * ease('expo.out')(q)).toFixed(3) + ')';
    c.el.style.opacity = (1 - q).toFixed(3);
  });
}

function applyArts(t) {
  const tt = Math.min(t, 22);
  const settle = 1 - clamp((t - 20.5) / 1.5);   // до 22 с усе завмирає
  arts.forEach((a) => {
    const w = (Math.PI * 2 * tt) / a.period + a.phase;
    let sc = 1, op = 1;
    if (a.t0) { const q = clamp((t - a.t0) / .6); sc = lerp(.4, 1, ease('back.out(1.6)')(q)); op = q; }
    const amp = a.t0 ? settle : 1;
    a.el.style.transform = 'translateY(' + (14 * Math.sin(w) * amp).toFixed(2) + 'px) rotate(' + (a.rot + 4 * Math.sin(w * .8) * amp).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
    if (a.t0) a.el.style.visibility = op > 0 ? 'visible' : 'hidden';
    if (a.t0) a.el.style.filter = op < 1 ? 'opacity(' + op.toFixed(3) + ')' : '';
  });
}

function applyWinGlitch(t) {
  const win = $('#win');
  const on = t >= 17.0 && t < 17.16;
  if (on) {
    const j = [[14, -4], [-18, 3], [10, 5], [-8, -3], [16, 0]][frameNo(t) % 5];
    win.style.translate = j[0] + 'px ' + j[1] + 'px';
    win.style.filter = 'drop-shadow(-12px 0 #d90429) drop-shadow(12px 0 rgba(242,242,242,.8))';
  } else if (win.style.translate) {
    win.style.translate = '';
    win.style.filter = '';
  }
}

function applyCounter(t) {
  if (!counterEl) return;
  const n = pops.filter((p) => t >= p.t0 + p.dur * .4 && p.kind !== 'art').length;
  if (counterEl.textContent !== String(n)) counterEl.textContent = n;
}

function applyFinal(t) {
  if (t < 17.2) return;
  // наклейка-лого: як .brand__sticker на сайті, під випадковим нахилом
  const st = $('#sticker').style;
  const q = clamp((t - 17.5) / .8);
  const k = [[0, -70, tilt - 30, 1.7], [.55, 0, tilt + 4, .92], [.75, 0, tilt - 2, 1.03], [1, 0, tilt, 1]];
  let i = 0; while (i < k.length - 2 && q > k[i + 1][0]) i++;
  const a = k[i], b = k[i + 1], e = ease('power2.out')(clamp((q - a[0]) / (b[0] - a[0])));
  st.opacity = clamp(q / .35).toFixed(3);
  st.transform = 'translateY(' + lerp(a[1], b[1], e).toFixed(2) + 'px) rotate(' + lerp(a[2], b[2], e).toFixed(2) + 'deg) scale(' + lerp(a[3], b[3], e).toFixed(4) + ')';

  // заголовок: слова «гупають» по черзі
  document.querySelectorAll('#final-title .w').forEach((w, j) => {
    const qw = clamp((t - (18.3 + j * .24)) / .34);
    const ew = ease('power3.out')(qw);
    w.style.opacity = clamp(qw / .25).toFixed(3);
    w.style.transform = 'scale(' + lerp(1.8, 1, ew).toFixed(4) + ') rotate(' + lerp(-8, 0, ew).toFixed(2) + 'deg)';
  });

  // нік
  const qn = clamp((t - 19.62) / .36);
  const nk = $('#final-nick').style;
  nk.opacity = clamp(qn / .25).toFixed(3);
  nk.transform = 'scale(' + lerp(1.5, 1, ease('power3.out')(qn)).toFixed(4) + ')';

  // кнопка: три пульси з іскрами, до 22 с усе стихає
  const PULSES = [20.45, 21.0, 21.55];
  let sc = 1, glow = 0;
  PULSES.forEach((tp) => { const qp = (t - tp) / .4; if (qp > 0 && qp < 1) { const s = Math.sin(Math.PI * qp); sc = 1 + .06 * s; glow = s; } });
  const btn = $('.final__btn').style;
  btn.transform = 'scale(' + sc.toFixed(4) + ')';
  btn.filter = glow > .01 ? 'drop-shadow(0 0 ' + (30 * glow).toFixed(1) + 'px rgba(255,31,69,.85))' : '';
  const sparks = document.querySelectorAll('.spark');
  const BURSTS = [20.45, 21.0, 21.48];
  sparks.forEach((sp, j) => {
    let shown = false;
    BURSTS.forEach((tb, bi) => {
      const qs = (t - tb) / .45;
      if (qs < 0 || qs > 1) return;
      shown = true;
      const ang = (j / sparks.length) * Math.PI * 2 + bi * .4;
      const r = 1 + .55 * ease('expo.out')(qs);
      const x = 540 + Math.cos(ang) * 290 * r, y = 1346 + Math.sin(ang) * 100 * r;
      sp.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (ang * 180 / Math.PI + 90).toFixed(1) + 'deg)';
      sp.style.opacity = (1 - qs).toFixed(3);
    });
    if (!shown) sp.style.opacity = '0';
  });
}

/* =========================================================
   Старт
   ========================================================= */
function fit() {
  const s = Math.min(innerWidth / 1080, (innerHeight - 56) / 1920);
  document.documentElement.style.setProperty('--fit', String(s));
}

function startPreview() {
  const bar = $('#scrub'), range = $('#scrub-range'), out = $('#scrub-time'), btn = $('#scrub-play');
  bar.hidden = false;
  let playing = true, cur = 0, t0 = performance.now();
  const ui = () => { range.value = cur; out.textContent = cur.toFixed(2) + ' с'; btn.textContent = playing ? 'Пауза' : 'Грати'; };
  const set = (v) => { cur = clamp(v, 0, DURATION); render(cur); ui(); };
  const toggle = () => { playing = !playing; t0 = performance.now() - cur * 1000; ui(); };
  btn.addEventListener('click', toggle);
  range.addEventListener('input', () => { playing = false; set(parseFloat(range.value)); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      e.preventDefault(); playing = false;
      set(cur + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 1 / FPS));
    }
  });
  (function loop(now) {
    if (playing) { cur = ((now - t0) / 1000) % DURATION; render(cur); ui(); }
    requestAnimationFrame(loop);
  })(performance.now());
}

async function boot() {
  if (MODE !== 'preview') document.body.classList.add('is-record');
  fit();
  addEventListener('resize', fit);
  // шрифти вантажимо під усі реальні тексти, щоб гліфи не довантажувались посеред запису
  const allText = [PROMO.title, PROMO.sub, PROMO.nick, PROMO.cta, PROMO.url, JSON.stringify(PROMO.captions), 'іїєґ 0123456789'].join(' ').replace(/<[^>]+>|&nbsp;|[~*|]/g, ' ');
  await Promise.all([
    document.fonts.load('96px "Rubik Dirt"', allText),
    document.fonts.load('600 40px Oswald', allText),
    document.fonts.load('400 20px Oswald', allText),
  ]);
  for (const n of PAGES) F[n] = await loadFrame(n);
  importSprite();
  build();
  await withTimeout(document.fonts.ready, 5000);
  document.body.classList.add('is-ready');
  if (MODE !== 'preview') freeze();
  else PAGES.forEach((n) => F[n].doc.getAnimations().forEach((a) => { if (a.playState === 'paused') a.play(); }));
  if (MODE === 'still') {
    const target = parseFloat(QS.get('t')) || 0;
    for (let f = 0; f <= Math.round(target * FPS); f++) render(Math.min(target, f / FPS));
  } else {
    render(0);
  }
  if (MODE === 'preview') startPreview();
  return true;
}

window.promo = { render, freeze, fps: FPS, duration: DURATION, config: PROMO, debug: { pops, cursors, scrollFns } };
window.promo.ready = boot().catch((e) => {
  console.error(e);
  $('#loading').textContent = 'Помилка: ' + e.message;
  throw e;
});
