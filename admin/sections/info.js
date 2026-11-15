/*
 * Розділ «Основна інформація»: адреса, телефон, графік, соцмережі, статистика заслуг.
 * Сайт: футер і іконка телефону на всіх сторінках, карта, адреса в чеку, графік у кроці 3 запису,
 * 4 лічильники й кільце на головній, JSON-LD для Google.
 * Рядок-одинак settings.info, кожна панель зберігається окремо (savePart із референсу).
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  let info = null;
  let root = null;

  THAdmin.register("info", {
    async render(box) {
      root = box;
      info = await THDB.single("info");
      paint();
    },
  });

  const plain = (s) => String(s || "").replace(/ /g, " ");
  const clean = (v) => T.nbsp(String(v || "").trim().replace(/\s+/g, " "));

  // перечитуємо свіжу версію, щоб не затерти зміни з іншої вкладки чи пристрою
  async function savePart(patch, msg) {
    const fresh = await THDB.single("info");
    info = { ...fresh, ...patch };
    await THDB.saveSingle("info", info);
    UI.toast(msg || "Збережено. На сайті зміни видно після оновлення сторінки.");
  }

  function paint() {
    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Основна інформація", "Контакти й цифри, які бачать відвідувачі у футері кожної сторінки й на головній.", [
        h("a", { class: "btn btn--ghost btn--sm", href: "../index.html#merits", target: "_blank", rel: "noopener" },
          h("span", { class: "btn__fill" }), UI.icon("external"), h("span", { class: "btn__label", text: "Подивитися на сайті" })),
      ]),
      h("div", { class: "adm-grid adm-grid--even" },
        addressPanel(),
        phonePanel(),
        hoursPanel(),
        socialsPanel(),
        statsPanel()
      ),
    ]);
  }

  // універсальна форма-панель
  function panelForm(title, note, fields, onSave) {
    const btn = UI.button({ label: "Зберегти", variant: "solid", small: true, type: "submit" });
    const form = h("form", { class: "form adm-form", novalidate: true },
      note ? h("p", { class: "adm-note", text: note }) : null,
      fields.map((f) => f.el),
      btn
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      fields.forEach((f) => f.setError && f.setError(null));
      btn.disabled = true;
      try {
        await onSave();
      } catch (err) {
        if (err && err.validation) {
          err.field.setError(err.message);
          err.field.input.focus();
        } else {
          console.error(err);
          UI.toast("Не вдалося зберегти: " + ((err && err.message) || "помилка бази"), "error");
        }
      }
      btn.disabled = false;
    });
    return UI.panel(title, form);
  }

  const invalid = (field, message) => Object.assign(new Error(message), { validation: true, field });

  function addressPanel() {
    const address = UI.field({ label: "Вулиця й будинок", value: plain(info.address), placeholder: "вул. Городоцька, 47" });
    const city = UI.field({ label: "Місто", value: plain(info.city), placeholder: "Львів" });
    const note = UI.field({ label: "Як знайти, необов'язково", value: plain(info.address_note), placeholder: "Вхід з вулиці, чорні двері з неоном" });
    const map = UI.field({ label: "Адреса для карти", value: plain(info.map_query), placeholder: "Horodotska St 47, Lviv, Ukraine", hint: "Як шукати в Google Maps. Порожньо = вулиця + місто" });
    return panelForm("Адреса", null, [address, city, note, map], async () => {
      if (address.value().trim().length < 3) throw invalid(address, "Вкажіть адресу");
      if (city.value().trim().length < 2) throw invalid(city, "Вкажіть місто");
      await savePart({ address: address.value().trim().replace(/\s+/g, " "), city: city.value().trim(), address_note: clean(note.value()), map_query: map.value().trim() });
    });
  }

  function phonePanel() {
    const phone = UI.field({ label: "Телефон", type: "tel", inputmode: "tel", value: plain(info.phone), placeholder: "+380 32 247 47 47" });
    const note = UI.field({ label: "Підпис під телефоном", value: plain(info.phone_note), placeholder: "Дзвінки щодня з 11:00" });
    return panelForm("Телефон", "Цей номер стоїть у футері, в іконці телефону в шапці й у даних для Google.", [phone, note], async () => {
      const p = T.normalizePhone(phone.value());
      if (!p.ok) throw invalid(phone, "Номер у форматі +380 XX XXX XX XX");
      phone.input.value = p.text;
      await savePart({ phone: p.text, phone_note: clean(note.value()) });
    });
  }

  function hoursPanel() {
    const hours = UI.field({ label: "Графік", value: plain(info.hours), placeholder: "Вт–Нд: 11:00–21:00" });
    const note = UI.field({ label: "Підпис під графіком", value: plain(info.hours_note), placeholder: "Понеділок вихідний" });
    const oh = UI.field({ label: "Графік для Google (латиницею)", value: info.opening_hours || "", placeholder: "Tu-Su 11:00-21:00", hint: "Дні: Mo Tu We Th Fr Sa Su. Наприклад: Mo-Fr 10:00-20:00" });
    return panelForm("Графік роботи",
      "Текст графіка показується у футері й у кроці 3 запису. Увага: календар запису й далі закриває понеділок і пропонує 11:00, 13:00, 15:00, 17:00, 19:00.",
      [hours, note, oh], async () => {
        if (hours.value().trim().length < 3) throw invalid(hours, "Вкажіть графік");
        const o = oh.value().trim();
        if (o && !/^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* \d{2}:\d{2}-\d{2}:\d{2}$/.test(o)) {
          throw invalid(oh, "Формат: Tu-Su 11:00-21:00");
        }
        await savePart({ hours: hours.value().trim().replace(/\s+/g, " "), hours_note: clean(note.value()), opening_hours: o });
      });
  }

  function socialsPanel() {
    const ig = UI.field({ label: "Instagram", type: "url", value: info.instagram || "", placeholder: "https://instagram.com/tattoohouse.lviv" });
    const tg = UI.field({ label: "Telegram", type: "url", value: info.telegram || "", placeholder: "https://t.me/tattoohouse_lviv", hint: "Порожнє поле = кнопку сховано" });
    const url = (f, host) => {
      const v = f.value().trim();
      if (!v) return "";
      if (!/^https:\/\/[^\s]+$/.test(v) || !host.test(v)) throw invalid(f, "Повне посилання, що починається з https://");
      return v;
    };
    return panelForm("Соцмережі", null, [ig, tg], async () => {
      const a = url(ig, /instagram\.com\//);
      const b = url(tg, /t\.me\//);
      await savePart({ instagram: a, telegram: b });
    });
  }

  function statsPanel() {
    const st = info.stats || {};
    const rating = UI.field({ label: "Рейтинг у Google", inputmode: "decimal", value: st.rating != null ? String(st.rating) : "", placeholder: "4.9" });
    const reviews = UI.field({ label: "Добрих відгуків", inputmode: "numeric", value: st.reviews != null ? String(st.reviews) : "", placeholder: "1200" });
    const clients = UI.field({ label: "Задоволених клієнтів", inputmode: "numeric", value: st.clients != null ? String(st.clients) : "", placeholder: "5000" });
    const years = UI.field({ label: "Років досвіду", inputmode: "numeric", value: st.years != null ? String(st.years) : "", placeholder: "10" });
    const row1 = h("div", { class: "adm-form__row" }, rating.el, reviews.el);
    const row2 = h("div", { class: "adm-form__row" }, clients.el, years.el);
    // panelForm приймає поля; ряди підставляємо як «поля» з el
    const fake = (el) => ({ el });
    const form = panelForm("Статистика заслуг", "4 лічильники на головній і текст на кільці навколо логотипа. Пишіть лише правдиві цифри.",
      [fake(row1), fake(row2)], async () => {
        [rating, reviews, clients, years].forEach((f) => f.setError(null));
        const r = Number(String(rating.value()).replace(",", "."));
        if (!(r >= 0 && r <= 5)) throw invalid(rating, "Число від 0 до 5, наприклад 4.9");
        const ints = {};
        for (const [k, f, max] of [["reviews", reviews, 1e6], ["clients", clients, 1e7], ["years", years, 100]]) {
          const v = UI.int(f.value());
          if (v === null || v < 0 || v > max) throw invalid(f, "Ціле число, наприклад " + (f.input.placeholder || "10"));
          ints[k] = v;
        }
        await savePart({ stats: { rating: Math.round(r * 10) / 10, ...ints } });
      });
    return form;
  }
})();
