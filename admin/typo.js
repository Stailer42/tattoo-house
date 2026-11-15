/*
 * Tattoo House: оформлення тексту, спільне для адмінки й тестів (з референсу admin-panel).
 *   THText.nbsp(text)           нерозривні пробіли після коротких слів і в числах
 *   THText.plural(n, forms)     "1 рік / 2 роки / 5 років"
 *   THText.formatPrice(n)       "1 200 ₴"
 *   THText.formatDuration(min)  "1 год 30 хв"
 *   THText.formatPhone(v, keepZeros)  { text: "+380 67 000 00 00", digits: "670000000" }
 *   THText.phoneHref(text)      "tel:+380000000000"
 * Працює і в браузері, і в Node (для тестів).
 */
(function (root) {
  const NB = " ";

  // слова, які не повинні залишатися в кінці рядка
  const SHORT = [
    "в", "у", "і", "й", "а", "та", "на", "з", "із", "зі", "до", "по", "за", "від", "що", "як", "не",
    "ні", "чи", "о", "без", "для", "про", "під", "над", "при", "я",
  ];
  // Без lookbehind (?<=...): старий Safari (iOS 16.3 і раніше) на ньому падає.
  // Символ перед словом захоплюємо групою, а другий прохід ловить слова підряд ("а і в"),
  // бо перший прохід "з'їдає" пробіл перед кожним другим із них.
  const shortRe = new RegExp("(^|[\\s(«\"„/])(" + SHORT.join("|") + ")[ \\t]+", "giu");
  const glueShort = (s) => s.replace(shortRe, "$1$2" + NB);

  function nbsp(text) {
    if (!text) return "";
    return glueShort(glueShort(String(text)))
      .replace(/(\d)[ \t]+(?=\d{3}(?!\d))/g, "$1" + NB) // 1 200
      .replace(/(\d)[ \t]+(?=[\p{L}₴%])/gu, "$1" + NB) // 40 хвилин, 900 ₴
      .replace(/[ \t]+(?=[—–] )/g, NB); // тире не переноситься на новий рядок
  }

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }

  // "1 200 ₴" з нерозривними пробілами
  function formatPrice(n) {
    return Number(n || 0).toLocaleString("uk-UA").replace(/\s/g, NB) + NB + "₴";
  }

  // "1 год 30 хв"
  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return [h ? h + " год" : "", m ? m + " хв" : ""].filter(Boolean).join(" ");
  }

  // Український номер: лишаємо 9 цифр після +380.
  // Для клієнтів зайвий "0" на початку прибираємо (067... → 67...).
  // keepZeros = true для демо-номерів салону виду +380 00 000 00 00.
  function formatPhone(value, keepZeros) {
    let d = String(value || "").replace(/\D/g, "");
    if (d.startsWith("380")) d = d.slice(3);
    else if (d.startsWith("80")) d = d.slice(2);
    if (!keepZeros) while (d.startsWith("0")) d = d.slice(1);
    d = d.slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return { text: "+380" + (parts.length ? " " + parts.join(" ") : ""), digits: d };
  }

  /*
   * Телефон, введений адміністратором: "067 123 45 67", "+380671234567", "80671234567",
   * а також демо-номери "+380 00 000 00 00". Повертає { ok, text: "+380 67 123 45 67" }.
   */
  function normalizePhone(value) {
    let d = String(value || "").replace(/\D/g, "");
    if (d.startsWith("380")) d = d.slice(3);
    else if (d.startsWith("80") && d.length === 11) d = d.slice(2);
    else if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
    if (d.length !== 9) return { ok: false, text: String(value || "").trim() };
    return { ok: true, text: "+380 " + d.slice(0, 2) + " " + d.slice(2, 5) + " " + d.slice(5, 7) + " " + d.slice(7, 9) };
  }

  function phoneHref(text) {
    return "tel:+" + String(text || "").replace(/\D/g, "");
  }

  const DAYS_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // тиждень з понеділка

  // [1,2,3,4,5,6] -> "Пн–Сб"; [1,3,5] -> "Пн, Ср, Пт"; [1,2,3,5,6] -> "Пн–Ср, Пт, Сб"
  function dayRanges(days) {
    const set = new Set((days || []).map(Number));
    const runs = [];
    let run = [];
    WEEK_ORDER.forEach((d) => {
      if (set.has(d)) run.push(d);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    return runs
      .map((r) => (r.length >= 3 ? DAYS_SHORT[r[0]] + "–" + DAYS_SHORT[r[r.length - 1]] : r.map((d) => DAYS_SHORT[d]).join(", ")))
      .join(", ");
  }

  const api = { NB, nbsp, plural, formatPrice, formatDuration, formatPhone, normalizePhone, phoneHref, dayRanges, DAYS_SHORT, WEEK_ORDER };
  root.THText = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
