/*
 * Адмінка Tattoo House: кожен розділ + що зміни видно на сайті.
 *
 *   python3 serve.py 8765 &
 *   node tests/e2e/th-admin.mjs            проти моку Supabase (tests/e2e/mock-supabase.mjs), нічого не потрібно
 *   LIVE=1 node tests/e2e/th-admin.mjs     проти справжнього Supabase: потрібні config.js і TEST_ADMIN_* у .env
 *
 * У live-режимі тест створює рядки з позначкою "E2E" і прибирає їх у кінці.
 * Скриншоти розділів: tmp/screens/admin/ (360 і 1440 px).
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./cdp.mjs";
import { startMock, MOCK_ADMIN } from "./mock-supabase.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const LIVE = process.env.LIVE === "1";
const SHOTS = "tmp/screens/admin";
mkdirSync(SHOTS, { recursive: true });

function readEnv() {
  const env = {};
  if (!existsSync(".env")) return env;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

let creds;
let mock = null;
if (LIVE) {
  const env = readEnv();
  if (!env.TEST_ADMIN_EMAIL || !env.TEST_ADMIN_PASSWORD || !existsSync("config.js")) {
    console.error("LIVE=1: потрібні TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD у .env і config.js (python3 tools/make_config.py)");
    process.exit(2);
  }
  creds = { email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD };
} else {
  mock = await startMock(8766);
  creds = MOCK_ADMIN;
}

const b = await launch();
await b.reducedMotion(true);
await b.viewport(1280, 900);

if (mock) {
  // config.js -> адреса моку (справжній config.js не чіпаємо)
  const body = Buffer.from('window.TH_CONFIG = { supabaseUrl: "' + mock.url + '", supabaseAnonKey: "mock-anon" };').toString("base64");
  await b.send("Fetch.enable", { patterns: [{ urlPattern: "*/config.js*", requestStage: "Request" }] });
  b.on("Fetch.requestPaused", (p) => {
    b.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body }).catch(() => {});
  });
}

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log((ok ? "ok   " : "FAIL ") + name + (extra !== "" ? "  " + extra : ""));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCheck(name, expr, timeout = 15000) {
  try {
    await b.waitFor(expr, timeout);
    check(name, true);
  } catch (e) {
    check(name, false, String(e.message).split("\n")[0]);
  }
}
const errors = () => b.logs.filter((l) => !/favicon|Supabase не налаштовано|auth\/v1\/token/.test(l));

// Помічники в сторінці адмінки
const HELP = `window.__t = {
  dlg() { const d = [...document.querySelectorAll('dialog[open]')]; return d[d.length - 1] || null; },
  btn(text, root) {
    root = root || document;
    return [...root.querySelectorAll('button, a.btn')].find((x) => !x.disabled && (x.textContent.trim() === text || x.getAttribute('aria-label') === text)) || null;
  },
  click(text, root) { const x = __t.btn(text, root); if (!x) throw new Error('no button: ' + text); x.click(); return true; },
  field(label, root) {
    root = root || __t.dlg() || document;
    const l = [...root.querySelectorAll('label')].find((x) => x.textContent.trim() === label);
    if (!l) throw new Error('no field: ' + label);
    return document.getElementById(l.htmlFor);
  },
  set(label, value, root) {
    const i = __t.field(label, root);
    i.value = value;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  rows() { return [...document.querySelectorAll('.adm-view .adm-row')].map((r) => r.querySelector('.adm-row__title').firstChild.textContent); },
  toast() { const t = document.querySelector('.adm-toast'); return t ? t.textContent : ''; },
};`;

async function admin(hash, settle = 500) {
  await b.goto(BASE + "admin/" + (hash ? "#" + hash : ""), settle);
  await b.eval(HELP);
  if (hash) await b.waitFor(`(document.querySelector('.adm-view .adm-title') || {}).textContent && document.querySelector('.adm-view .adm-title').textContent.startsWith(${JSON.stringify(sectionTitle(hash))})`, 15000);
}
const TITLES = { bookings: "Записи", masters: "Майстри", gallery: "Галерея", giveaway: "Розіграш", services: "Послуги", reviews: "Відгуки", info: "Основна", settings: "Налаштування" };
const sectionTitle = (h) => TITLES[h];
async function go(hash) {
  await b.eval(`location.hash = ${JSON.stringify(hash)}`);
  // заголовок вкладки міняється до завантаження даних, тому чекаємо намальований розділ
  await b.waitFor(`(document.querySelector('.adm-view .adm-title') || {}).textContent && document.querySelector('.adm-view .adm-title').textContent.startsWith(${JSON.stringify(sectionTitle(hash))})`, 15000);
  await sleep(300);
  await b.eval(HELP);
}
async function waitToast(re, timeout = 10000) {
  await b.waitFor(`/${re}/.test(document.querySelector('.adm-toast') ? document.querySelector('.adm-toast').textContent : '')`, timeout);
  // гасимо знайдений тост: наступна дія має дочекатися СВОГО, а не побачити цей (він висить 3 с)
  await b.eval("document.querySelector('.adm-toast').textContent = ''");
}
async function confirmDialog(okText) {
  await b.waitFor(`__t.dlg() && __t.btn(${JSON.stringify(okText)}, __t.dlg())`);
  await b.eval(`__t.click(${JSON.stringify(okText)}, __t.dlg())`);
}
async function upload(selector, paths) {
  const { root } = await b.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await b.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  await b.send("DOM.setFileInputFiles", { nodeId, files: paths.map((p) => resolve(p)) });
}
async function shot(name) {
  for (const w of [360, 1440]) {
    await b.viewport(w, w < 600 ? 780 : 900);
    await sleep(250);
    const over = await b.eval("document.documentElement.scrollWidth - window.innerWidth");
    check("без горизонтального скролу: " + name + " " + w, over <= 0, over > 0 ? over + "px" : "");
    // відкритий діалог (шторка fixed) знімаємо в межах екрана, сторінку цілком
    await b.screenshot(SHOTS + "/" + name + "-" + w + ".png", !(await b.eval("!!document.querySelector('dialog[open]')")));
  }
  await b.viewport(1280, 900);
}
async function site(path, settle = 900) {
  await b.goto(BASE + path, settle);
}

/* ================= вхід ================= */
b.logs.length = 0;
await admin("");
await b.waitFor("!document.querySelector('[data-login]').hidden", 10000);
check("без входу видно лише форму входу", await b.eval("document.querySelector('[data-app]').hidden && !document.querySelector('[data-login]').hidden"));
await shot("login");
await b.eval(`(() => { document.getElementById('l-login').value = ${JSON.stringify(creds.email)}; document.getElementById('l-pass').value = 'wrong-password-1'; document.querySelector('[data-login-form]').requestSubmit(); })()`);
await b.waitFor("!document.querySelector('[data-login-error]').hidden && /Неправильний/.test(document.querySelector('[data-login-error]').textContent)", 10000);
check("неправильний пароль відхилено", true);
await b.eval(`(() => { document.getElementById('l-pass').value = ${JSON.stringify(creds.password)}; document.querySelector('[data-login-form]').requestSubmit(); })()`);
await b.waitFor("!document.querySelector('[data-app]').hidden", 10000);
check("вхід правильним паролем", true, await b.eval("document.querySelector('[data-user]').textContent"));
await b.eval(HELP);

/* ================= майстри ================= */
await go("masters");
const mastersBefore = (await b.eval("__t.rows()")).length;
check("майстри: список завантажено", mastersBefore > 0, mastersBefore);
await shot("masters");
await b.eval("__t.click('Додати майстра')");
await b.waitFor("__t.dlg()");
await b.eval(`(() => {
  __t.set("Ім'я та прізвище", 'E2E Майстер');
  __t.set("Псевдо, необов'язково", 'Тест');
  __t.set('Стиль', 'Графіка');
  __t.set('Теги через кому', 'Графіка, Тест');
  __t.set('Досвід, років', '3');
  __t.set('Вартість роботи', 'від 900 ₴');
  __t.set('Опис', 'Тестовий майстер для автоматичної перевірки адмінки.');
})()`);
await upload("dialog[open] input[type=file]", ["assets/masters/master-1.jpg"]);
await b.waitFor("__t.dlg().querySelector('.adm-frame img[src^=\"blob:\"]')", 10000);
await shot("masters-dialog");
await b.eval("__t.click('Додати майстра', __t.dlg())");
await waitToast("додано");
await waitCheck("майстри: новий з'явився в списку", "__t.rows().includes('E2E Майстер')");

await site("masters.html", 1200);
await b.waitFor("document.querySelector('#masters-full article#e2e')", 10000);
const e2ePhoto = await b.eval("document.querySelector('#masters-full article#e2e img').src");
check("сайт: новий майстер на masters.html з фото зі сховища", /\/storage\/v1\/object\/public\/photos\/masters\//.test(e2ePhoto), e2ePhoto);
check("сайт: псевдо й ціна майстра", await b.eval("/«Тест»/.test(document.querySelector('#e2e h2').textContent) && /900/.test(document.querySelector('#e2e').textContent)"));
const imgOk = await b.eval("new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = document.querySelector('#e2e img').src; })");
check("сайт: фото майстра реально відкривається", imgOk);

await admin("masters");
await b.eval(`__t.click('Сховати з сайту: E2E Майстер')`);
await waitToast("сховано");
await site("masters.html", 1200);
await b.waitFor("!document.querySelector('#masters-full article#e2e')", 10000);
check("сайт: схований майстер зник", true);

await admin("masters");
await b.eval(`[...document.querySelectorAll('.adm-row__main')].find((x) => /E2E Майстер/.test(x.textContent)).click()`);
await b.waitFor("__t.dlg()");
await b.eval("__t.click('Видалити', __t.dlg())");
await confirmDialog("Видалити");
await waitToast("видалено");
await waitCheck("майстри: видалено", "__t.rows().length && !__t.rows().includes('E2E Майстер')");
if (mock) check("майстри: файл фото прибрано зі сховища", ![...mock.files.keys()].some((k) => k.startsWith("masters/")));

/* ================= галерея ================= */
await go("gallery");
const galBefore = (await b.eval("__t.rows()")).length;
await upload(".adm-view input[type=file]", ["assets/tattoos/tattoo-01.jpg", "assets/tattoos/tattoo-02.jpg"]);
await b.waitFor("__t.dlg() && __t.dlg().querySelectorAll('.adm-upload').length === 2", 15000);
await b.eval("__t.click('Додати в галерею', __t.dlg())");
await b.waitFor("__t.dlg().querySelector('.is-invalid')");
check("галерея: без опису фото не зберігається", true);
await b.eval(`(() => { const d = __t.dlg(); const ins = [...d.querySelectorAll('.adm-upload input[type=text], .adm-upload input:not([type])')]; })()`);
await b.eval(`(() => {
  const d = __t.dlg();
  const labels = [...d.querySelectorAll('label')].filter((l) => l.textContent.trim() === 'Що на фото');
  labels.forEach((l, i) => { const inp = document.getElementById(l.htmlFor); inp.value = 'E2E фото ' + (i + 1); inp.dispatchEvent(new Event('input', { bubbles: true })); });
  const st = [...d.querySelectorAll('label')].filter((l) => l.textContent.trim() === 'Стиль');
  st.forEach((l) => { document.getElementById(l.htmlFor).value = 'E2E-стиль'; });
})()`);
await shot("gallery-upload");
await b.eval("__t.click('Додати в галерею', __t.dlg())");
await waitToast("Додано фото: 2", 20000);
await waitCheck("галерея: 2 нові фото першими", `__t.rows().length === ${galBefore + 2} && __t.rows()[0] === "E2E фото 1" && __t.rows()[1] === "E2E фото 2"`);
await shot("gallery");
await site("gallery.html", 1200);
await b.waitFor(`document.getElementById('gallery-count').textContent === '${galBefore + 2}'`, 10000);
check("сайт: галерея показує нові фото першими", await b.eval("document.querySelector('#works-mount .work img').alt === 'E2E фото 1'"));
for (const n of [1, 2]) {
  await admin("gallery");
  await b.eval(`[...document.querySelectorAll('.adm-row__main')].find((x) => /E2E фото ${n}/.test(x.textContent)).click()`);
  await b.waitFor("__t.dlg()");
  await b.eval("__t.click('Видалити', __t.dlg())");
  await confirmDialog("Видалити");
  await waitToast("видалено");
}
await waitCheck("галерея: тестові фото видалено", `__t.rows().length === ${galBefore}`);
if (mock) check("галерея: файли прибрано зі сховища", ![...mock.files.keys()].some((k) => k.startsWith("gallery/")));

/* ================= послуги ================= */
await go("services");
await shot("services");
const svcName = await b.eval("__t.rows()[0]");
const svcOld = await b.eval("document.querySelector('.adm-view .adm-row__meta').textContent");
await b.eval("document.querySelector('.adm-view .adm-row__main').click()");
await b.waitFor("__t.dlg()");
const oldPrice = await b.eval("__t.field('Ціна від, ₴').value");
await b.eval("__t.set('Ціна від, ₴', 'abc')");
await b.eval("__t.click('Зберегти', __t.dlg())");
await b.waitFor("__t.dlg().querySelector('.is-invalid')");
check("послуги: нечислова ціна відхилена", true);
await b.eval("__t.set('Ціна від, ₴', '1777')");
await shot("services-dialog");
await b.eval("__t.click('Зберегти', __t.dlg())");
await waitToast("збережено");
await site("booking.html", 1200);
await b.waitFor("/1\\s777/.test(document.querySelector('.options').textContent)", 10000);
check("сайт: нова ціна в кроці 1 запису", true, svcName + " " + svcOld + " -> 1 777");

/* ================= запис із сайту -> адмінка ================= */
await b.eval("document.querySelector('input[name=service]').click()");
await b.waitFor("/1\\s777/.test(document.querySelector('.receipt__total').textContent)");
check("сайт: чек рахує нову ціну", true);
await b.eval("document.querySelector('[data-next]').click()");
await b.eval("document.querySelector('input[name=master][value=any]').click()");
await b.eval("document.querySelector('[data-next]').click()");
await b.waitFor("document.querySelector('.cal__day:not([disabled]):not(.is-empty)')");
await b.eval("document.querySelector('.cal__day:not([disabled]):not(.is-empty)').click()");
for (let i = 0; i < 10 && !(await b.eval("!!document.querySelector('.slot:not([disabled])')")); i++) {
  await b.eval(`(() => { const d = [...document.querySelectorAll('.cal__day:not([disabled]):not(.is-empty)')]; d[d.indexOf(document.querySelector('.cal__day.is-selected')) + 1].click(); })()`);
}
await b.eval("document.querySelector('.slot:not([disabled])').click()");
await b.eval("document.querySelector('[data-next]').click()");
await b.waitFor("document.getElementById('bk-name')");
await b.eval(`(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('bk-name', 'E2E Клієнт'); set('bk-phone', '+380671112233'); set('bk-comment', 'Тестовий запис, видалити');
  const a = document.getElementById('bk-agree'); a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-next]').click();
})()`);
await b.waitFor("document.querySelector('.confirm .success__title')", 15000);
const code = (await b.eval("document.querySelector('.confirm__num').textContent")).replace(/.*(TH-\d+).*/, "$1");
check("сайт: запис надіслано, номер від сервера", /^TH-\d{5}$/.test(code), code);
check("сайт: без позначки «демо» в live-режимі", !(await b.eval("/Демо-сайт/.test(document.querySelector('.confirm').textContent)")));

await admin("bookings", 800);
await b.waitFor(`[...document.querySelectorAll('.adm-tr')].some((r) => r.textContent.includes(${JSON.stringify(code)}))`, 10000);
check("адмінка: запис видно в списку", true, code);
check("адмінка: бейдж нових записів", Number(await b.eval("document.querySelector('[data-badge=bookings]').textContent")) >= 1);
check("адмінка: сума з новою ціною", await b.eval(`/1\\s777/.test([...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})).textContent)`));
await shot("bookings");
await b.eval(`__t.set('Пошук', ${JSON.stringify(code)}, document.querySelector('.adm-view'))`);
check("адмінка: пошук за кодом", (await b.eval("document.querySelectorAll('.adm-tr').length")) === 1);
await b.eval(`[...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})).querySelector('.adm-table__open').click()`);
await b.waitFor("__t.dlg()");
await shot("bookings-dialog");
await b.eval("__t.set('Нотатка адміністратора', 'E2E: передзвонити')");
await b.eval("__t.click('Підтвердити запис', __t.dlg())");
await waitToast("підтверджено");
await waitCheck("адмінка: статус «Підтверджена»", `/Підтверджена/.test(([...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})) || {}).textContent || '')`);
await b.eval(`[...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})).querySelector('.adm-table__open').click()`);
await b.waitFor("__t.dlg()");
check("адмінка: нотатка збереглась", (await b.eval("__t.field('Нотатка адміністратора').value")) === "E2E: передзвонити");
await b.eval("__t.click('Скасувати запис', __t.dlg())");
await confirmDialog("Скасувати запис");
await waitToast("скасовано");
await waitCheck("адмінка: статус «Скасована»", `/Скасована/.test(([...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})) || {}).textContent || '')`);
await b.eval(`[...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(code)})).querySelector('.adm-table__open').click()`);
await b.waitFor("__t.dlg()");
await b.eval("__t.click('Видалити', __t.dlg())");
await confirmDialog("Видалити");
await waitToast("видалено");
await waitCheck("адмінка: тестовий запис видалено", `!document.querySelector('.adm-view').textContent.includes(${JSON.stringify(code)})`);

// повертаємо ціну послуги
await go("services");
await b.eval(`[...document.querySelectorAll('.adm-row__main')].find((x) => x.textContent.includes(${JSON.stringify(svcName)})).click()`);
await b.waitFor("__t.dlg()");
await b.eval(`__t.set('Ціна від, ₴', ${JSON.stringify(oldPrice)})`);
await b.eval("__t.click('Зберегти', __t.dlg())");
await waitToast("збережено");

/* ================= розіграш ================= */
const igA = "@e2e_a_" + Date.now().toString(36);
await site("index.html", 1200);
const gwOpen = await b.eval("!document.getElementById('giveaway').hidden && !document.getElementById('giveaway-btn').hidden");
check("сайт: розіграш відкритий", gwOpen);
if (gwOpen) {
  for (const [name, contact, expect] of [["E2E Перший", igA, "Ви в"], ["E2E Дубль", igA.toUpperCase(), "вже в"]]) {
    await b.eval("localStorage.removeItem('th-giveaway')");
    await site("index.html", 900);
    await b.eval("document.getElementById('giveaway-btn').click()");
    await b.waitFor("document.querySelector('.overlay #gw-name')");
    await b.eval(`(() => { document.getElementById('gw-name').value = ${JSON.stringify(name)}; document.getElementById('gw-contact').value = ${JSON.stringify(contact)}; document.querySelector('.overlay form').requestSubmit(); })()`);
    await b.waitFor("document.querySelector('.overlay .success__title')", 10000);
    check("сайт: розіграш " + name, (await b.eval("document.querySelector('.overlay .success__title').textContent")).includes(expect));
  }
}
await admin("giveaway", 800);
await b.waitFor(`document.querySelector('.adm-view').textContent.includes(${JSON.stringify(igA)})`, 10000);
check("адмінка: учасник у списку, дубль не додано", (await b.eval(`[...document.querySelectorAll('.adm-tr')].filter((r) => r.textContent.includes('E2E')).length`)) === 1);
await shot("giveaway");
// налаштування: приз
const prizeOld = await b.eval("__t.field('Сума сертифіката', document.querySelector('.adm-view')).value");
await b.eval("__t.set('Сума сертифіката', '7 000 ₴', document.querySelector('.adm-view'))");
await b.eval("__t.click('Зберегти налаштування')");
await waitToast("збережено");
await site("index.html", 1200);
await b.waitFor("/7.000/.test(document.querySelector('[data-gw=prize]').textContent)", 10000);
check("сайт: новий приз у заголовку", true);
if (!LIVE) {
  // у live переможця не обираємо: там можуть бути справжні учасники
  await admin("giveaway", 800);
  await b.eval("__t.click('Обрати переможця')");
  await confirmDialog("Обрати переможця");
  await waitToast("Переможець");
  check("адмінка: картка переможця", await b.eval("!!document.querySelector('.adm-winner')"));
  await site("index.html", 1200);
  await b.waitFor("/Переможець: E2E/.test(document.getElementById('giveaway-status').textContent)", 10000);
  check("сайт: переможець із прихованим контактом", await b.eval("/@e2e\\*\\*\\*/.test(document.getElementById('giveaway-status').textContent) && document.getElementById('giveaway-btn').hidden"), await b.eval("document.getElementById('giveaway-status').textContent"));
  await admin("giveaway", 800);
  await b.eval("__t.click('Скинути розіграш')");
  await confirmDialog("Скинути");
  await waitToast("скинуто");
  await waitCheck("адмінка: розіграш скинуто", "document.querySelectorAll('.adm-tr').length === 0 && !document.querySelector('.adm-winner')");
} else {
  await admin("giveaway", 800);
  await b.eval(`[...document.querySelectorAll('.adm-tr')].find((r) => r.textContent.includes(${JSON.stringify(igA)})).querySelector('.adm-table__open').click()`);
  await confirmDialog("Видалити учасника");
  await waitToast("видалено");
  check("адмінка: тестового учасника видалено", true);
}
await b.eval(`__t.set('Сума сертифіката', ${JSON.stringify(prizeOld)}, document.querySelector('.adm-view'))`);
await b.eval("__t.click('Зберегти налаштування')");
await waitToast("збережено");

/* ================= основна інформація ================= */
await go("info");
await shot("info");
const phoneOld = await b.eval("__t.field('Телефон', document.querySelector('.adm-view')).value");
const clientsOld = await b.eval("__t.field('Задоволених клієнтів', document.querySelector('.adm-view')).value");
await b.eval("__t.set('Телефон', '12345', document.querySelector('.adm-view')); __t.field('Телефон', document.querySelector('.adm-view')).form.requestSubmit()");
await b.waitFor("__t.field('Телефон', document.querySelector('.adm-view')).closest('.field').classList.contains('is-invalid')");
check("інфо: неправильний телефон відхилено", true);
await b.eval("__t.set('Телефон', '067 111 22 33', document.querySelector('.adm-view')); __t.field('Телефон', document.querySelector('.adm-view')).form.requestSubmit()");
await waitToast("Збережено");
check("інфо: телефон нормалізовано", (await b.eval("__t.field('Телефон', document.querySelector('.adm-view')).value")) === "+380 67 111 22 33");
await b.eval("__t.set('Задоволених клієнтів', '6100', document.querySelector('.adm-view')); __t.field('Задоволених клієнтів', document.querySelector('.adm-view')).form.requestSubmit()");
await waitToast("Збережено");
await site("index.html", 1200);
await b.waitFor("document.querySelector('[data-info=phone]').textContent === '+380 67 111 22 33'", 10000);
check("сайт: телефон у футері й tel:", await b.eval("document.querySelector('[data-info-tel]').getAttribute('href') === 'tel:+380671112233'"));
check("сайт: лічильник і кільце", await b.eval("document.querySelector('[data-stat=clients]').getAttribute('data-count') === '6100' && /6100\\+ КЛІЄНТІВ/.test(document.getElementById('ring-text').textContent)"));
await admin("info");
await b.eval(`__t.set('Телефон', ${JSON.stringify(phoneOld)}, document.querySelector('.adm-view')); __t.field('Телефон', document.querySelector('.adm-view')).form.requestSubmit()`);
await waitToast("Збережено");
await b.eval(`__t.set('Задоволених клієнтів', ${JSON.stringify(clientsOld)}, document.querySelector('.adm-view')); __t.field('Задоволених клієнтів', document.querySelector('.adm-view')).form.requestSubmit()`);
await waitToast("Збережено");

/* ================= відгуки ================= */
await go("reviews");
await shot("reviews");
await b.eval("__t.click('Додати відгук')");
await b.waitFor("__t.dlg()");
await b.eval(`(() => { __t.set("Ім'я клієнта", 'E2E Відгук'); __t.set('Текст відгуку', 'Тестовий відгук для перевірки адмінки, видалити.'); })()`);
await b.eval("__t.click('Додати відгук', __t.dlg())");
await waitToast("додано");
await site("index.html", 1200);
await b.waitFor("/E2E Відгук/.test(document.querySelector('#reviews-mount .review').textContent)", 10000);
check("сайт: новий відгук першим", true);
await admin("reviews");
await b.eval(`[...document.querySelectorAll('.adm-row__main')].find((x) => /E2E Відгук/.test(x.textContent)).click()`);
await b.waitFor("__t.dlg()");
await b.eval("__t.click('Видалити', __t.dlg())");
await confirmDialog("Видалити");
await waitToast("видалено");

/* ================= налаштування ================= */
await go("settings");
await shot("settings");
const NEWPASS = creds.password + "-x9";
const changePass = async (from, to) => {
  await b.eval(`(() => { const v = document.querySelector('.adm-view'); __t.set('Поточний пароль', ${JSON.stringify(from)}, v); __t.set('Новий пароль', ${JSON.stringify(to)}, v); __t.set('Новий пароль ще раз', ${JSON.stringify(to)}, v); __t.click('Змінити пароль'); })()`);
};
await changePass("not-the-password", NEWPASS);
await b.waitFor("/не підходить/.test(document.querySelector('.adm-view').textContent)", 10000);
check("пароль: неправильний поточний відхилено", true);
await changePass(creds.password, NEWPASS);
await waitToast("Пароль змінено", 15000);
await b.eval("__t.click('Вийти', document.querySelector('.adm-side'))");
await b.waitFor("!document.querySelector('[data-login]').hidden");
await b.eval(`(() => { document.getElementById('l-login').value = ${JSON.stringify(creds.email)}; document.getElementById('l-pass').value = ${JSON.stringify(NEWPASS)}; document.querySelector('[data-login-form]').requestSubmit(); })()`);
await b.waitFor("!document.querySelector('[data-app]').hidden", 10000);
check("пароль: вхід з новим паролем", true);
await go("settings");
await changePass(NEWPASS, creds.password);
await waitToast("Пароль змінено", 15000);
check("пароль: повернуто старий", true);

/* ================= «Ще» на телефоні ================= */
await b.viewport(360, 780);
await b.eval("document.querySelector('[data-more]').click()");
await b.waitFor("__t.dlg() && __t.dlg().querySelectorAll('.adm-more a').length === 8");
check("телефон: шторка «Ще» з усіма розділами", true);
await b.screenshot(SHOTS + "/more-360.png", false);
await b.viewport(1280, 900);

check("консоль адмінки без помилок", !errors().length, errors().slice(0, 5).join(" | "));

await b.close();
if (mock) await mock.close();
console.log(failed ? `\n${failed} FAIL` : "\nALL OK");
process.exit(failed ? 1 : 0);
