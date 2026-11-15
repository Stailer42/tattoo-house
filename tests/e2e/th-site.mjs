/*
 * Сайт: дані показуються, запис і розіграш проходять до кінця.
 *   python3 serve.py 8765 &
 *   node tests/e2e/th-site.mjs            демо-режим (без config.js) або live, якщо config.js є
 * У live-режимі запис і участь у розіграші реально пишуться в Supabase
 * (ім'я "E2E ...", їх прибирає th-admin.mjs або адмін вручну).
 */
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const b = await launch();
await b.reducedMotion(true);
await b.viewport(1280, 900);
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log((ok ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : ""));
};
const errors = () => b.logs.filter((l) => !/config\.js|Supabase не налаштовано/.test(l));

// ---------- головна ----------
b.logs.length = 0;
await b.goto(BASE + "index.html", 900);
const mode = await b.eval("window.TH ? TH.mode : 'none'");
console.log("mode:", mode);
const home = await b.eval(`JSON.stringify({
  services: document.querySelectorAll('#services-mount .service').length,
  works: document.querySelectorAll('#works-mount .work').length,
  masters: document.querySelectorAll('#masters-mount .master').length,
  reviews: document.querySelectorAll('#reviews-mount .review').length,
  phone: document.querySelector('[data-info="phone"]').textContent,
  tel: document.querySelector('[data-info-tel]').getAttribute('href'),
  ring: document.getElementById('ring-text').textContent,
  stat: document.querySelector('[data-stat="clients"]').getAttribute('data-count'),
  prize: document.querySelector('[data-gw="prize"]').textContent,
  giveawayHidden: document.getElementById('giveaway').hidden,
  ld: JSON.parse(document.getElementById('ld-json').textContent).telephone
})`);
const h = JSON.parse(home);
check("головна: послуги", h.services > 0, h.services);
check("головна: роботи (до 8)", h.works > 0 && h.works <= 8, h.works);
check("головна: майстри (до 4)", h.masters > 0 && h.masters <= 4, h.masters);
check("головна: відгуки (до 3)", h.reviews > 0 && h.reviews <= 3, h.reviews);
check("футер: телефон і tel:", /^\+380/.test(h.phone) && h.tel === "tel:+" + h.phone.replace(/\D/g, ""), h.phone + " " + h.tel);
check("кільце зі статистики", /ДОСВІДУ .* КЛІЄНТ.* GOOGLE .* МАЙСТ/.test(h.ring), h.ring);
check("лічильник клієнтів", Number(h.stat) > 0, h.stat);
check("приз розіграшу", h.prize.length > 0, h.prize);
check("JSON-LD телефон", /^\+380\d{9}$/.test(h.ld), h.ld);
check("консоль головної без помилок", !errors().length, errors().join(" | "));

// ---------- розіграш ----------
if (!h.giveawayHidden) {
  const btnHidden = await b.eval("document.getElementById('giveaway-btn').hidden");
  if (!btnHidden) {
    await b.eval("document.getElementById('giveaway-btn').click()");
    await b.waitFor("document.querySelector('.overlay #gw-name')");
    await b.eval(`(() => {
      document.getElementById('gw-name').value = 'E2E Тест';
      document.getElementById('gw-contact').value = '@e2e_test_' + Date.now().toString(36);
      document.querySelector('.overlay form').requestSubmit();
    })()`);
    await b.waitFor("document.querySelector('.overlay .success__title')", 10000);
    const status = await b.eval("document.getElementById('giveaway-status').textContent");
    check("розіграш: участь прийнята", /берете участь/.test(status), status);
    await b.eval("document.querySelector('.overlay [data-close]').click()");
  } else {
    console.log("skip розіграш: кнопка прихована (є переможець або завершено)");
  }
}

// ---------- майстри й галерея ----------
await b.goto(BASE + "masters.html", 600);
const mcount = await b.eval("document.querySelectorAll('#masters-full .master-card').length");
check("сторінка майстрів", mcount > 0, mcount);
await b.goto(BASE + "gallery.html", 600);
const g = JSON.parse(await b.eval(`JSON.stringify({ n: document.querySelectorAll('#works-mount .work').length, c: document.getElementById('gallery-count').textContent })`));
check("галерея: фото = лічильник", g.n > 0 && String(g.n) === g.c, JSON.stringify(g));
await b.eval("document.querySelector('#works-mount .work').click()");
await b.waitFor("document.querySelector('.lightbox .lightbox__img').src");
check("галерея: лайтбокс відкрився", true);

// ---------- запис ----------
b.logs.length = 0;
const firstMaster = await b.eval("(window.TH_SEED.masters[0] || {}).id");
await b.goto(BASE + "booking.html?master=" + firstMaster, 700);
await b.eval("document.querySelector('input[name=service]').click()");
await b.eval("document.querySelector('[data-next]').click()");
const preset = await b.eval(`(document.querySelector('input[name=master]:checked') || {}).value`);
check("запис: ?master= обирає майстра", preset === firstMaster, preset);
await b.eval("document.querySelector('[data-next]').click()");
await b.waitFor("document.querySelector('.cal__day:not([disabled]):not(.is-empty)')");
await b.eval("document.querySelector('.cal__day:not([disabled]):not(.is-empty)').click()");
let slot = await b.eval("!!document.querySelector('.slot:not([disabled])')");
for (let i = 0; !slot && i < 10; i++) {
  // день повністю зайнятий: беремо наступний
  await b.eval(`(() => { const d = [...document.querySelectorAll('.cal__day:not([disabled]):not(.is-empty)')]; const cur = document.querySelector('.cal__day.is-selected'); d[d.indexOf(cur) + 1].click(); })()`);
  slot = await b.eval("!!document.querySelector('.slot:not([disabled])')");
}
await b.eval("document.querySelector('.slot:not([disabled])').click()");
await b.eval("document.querySelector('[data-next]').click()");
await b.waitFor("document.getElementById('bk-name')");
await b.eval(`(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('bk-name', 'E2E Клієнт');
  set('bk-phone', '+380671234567');
  const a = document.getElementById('bk-agree'); a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-next]').click();
})()`);
await b.waitFor("document.querySelector('.confirm .success__title')", 10000);
const num = await b.eval("(document.querySelector('.confirm__num') || {}).textContent || ''");
check("запис: підтверджено з номером", /TH-\d{5}/.test(num), num);
const receipt = await b.eval("document.querySelector('.receipt__head').textContent");
check("чек: адреса з даних", /Львів/.test(receipt), receipt);
check("консоль запису без помилок", !errors().length, errors().join(" | "));

await b.close();
console.log(failed ? `\n${failed} FAIL` : "\nALL OK");
process.exit(failed ? 1 : 0);
