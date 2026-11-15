/*
 * Розділ «Розіграш»: налаштування блоку на головній, учасники з форми «Взяти участь»,
 * випадковий переможець (обирає сервер: draw_giveaway), скидання розіграшу.
 * На сайті переможець показується з частково прихованим контактом (@ole***, +380*******67).
 * Дата завершення вводиться за київським часом незалежно від часового поясу пристрою.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;
  const TZ = "Europe/Kyiv";

  let data = null;
  let root = null;
  const state = { q: "" };

  THAdmin.register("giveaway", {
    async render(box) {
      root = box;
      await load();
      paint();
    },
  });

  async function load() {
    const [cfg, entries] = await Promise.all([THDB.single("giveaway"), THDB.list("giveaway_entries")]);
    data = { cfg, entries };
  }

  async function reload() {
    await load();
    paint();
  }

  const plain = (s) => String(s || "").replace(/ /g, " ");

  /* ---------- київський час <-> ISO ---------- */
  function kyivParts(date) {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).forEach((x) => (p[x.type] = x.value));
    return p;
  }
  // ISO -> "YYYY-MM-DDTHH:mm" у київському часі (для <input type="datetime-local">)
  function isoToKyivLocal(iso) {
    if (!iso) return "";
    const p = kyivParts(new Date(iso));
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  // "YYYY-MM-DDTHH:mm" (київський час) -> ISO UTC
  function kyivLocalToIso(local) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || "");
    if (!m) return null;
    const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    let guess = asUtc;
    for (let i = 0; i < 2; i++) {
      const p = kyivParts(new Date(guess));
      const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      guess += asUtc - shown;
    }
    return new Date(guess).toISOString();
  }
  const fmtKyiv = (iso) => new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtCreated = (iso) => new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  function contactLink(c) {
    if (/^@/.test(c)) return h("a", { href: "https://instagram.com/" + encodeURIComponent(c.slice(1)), target: "_blank", rel: "noopener", text: c });
    return h("a", { href: T.phoneHref(c), class: "adm-num", text: c });
  }

  function statusText() {
    const c = data.cfg;
    if (c.enabled === false) return "Вимкнено: блоку немає на сайті";
    if (c.winner) return "Переможця обрано й показано на сайті";
    if (!c.ends_at || new Date(c.ends_at) <= new Date()) return "Завершено: приймання заявок закрите";
    return "Триває до " + fmtKyiv(c.ends_at);
  }

  function paint() {
    const entries = data.entries;
    const winner = entries.find((e) => e.is_winner);

    const drawBtn = UI.button({
      label: data.cfg.winner ? "Обрати іншого переможця" : "Обрати переможця",
      icon: "shuffle",
      variant: "solid",
      small: true,
      disabled: !entries.length,
      onClick: () => draw(),
    });
    const resetBtn = UI.button({ label: "Скинути розіграш", icon: "trash", small: true, class: "btn--danger", disabled: !entries.length && !data.cfg.winner, onClick: () => reset() });
    const csvBtn = UI.button({ label: "Завантажити CSV", icon: "download", small: true, disabled: !entries.length, onClick: () => downloadCsv() });

    const winnerCard = data.cfg.winner
      ? h("section", { class: "adm-winner", "aria-label": "Переможець" },
          h("span", { class: "label" }, UI.icon("trophy"), "Переможець"),
          h("p", { class: "adm-winner__name", text: winner ? winner.name : data.cfg.winner.name }),
          winner ? h("p", null, contactLink(winner.contact)) : null,
          h("p", { text: "На сайті: «" + data.cfg.winner.name + " (" + data.cfg.winner.contact_masked + ")»" }),
          h("div", { class: "adm-actions" },
            UI.button({ label: "Прибрати переможця з сайту", small: true, variant: "ghost", onClick: () => clearWinner() })
          )
        )
      : null;

    const search = UI.field({ label: "Пошук учасника", type: "search", value: state.q, placeholder: "Ім'я, телефон або нік" });
    const table = UI.table({
      caption: "Учасники розіграшу",
      items: filteredEntries(),
      empty: entries.length ? "Нікого не знайдено." : "Учасників ще немає. Вони з'являться після натискання «Взяти участь» на сайті.",
      onOpen: (e) => openEntry(e),
      openLabel: (e) => "Учасник " + e.name,
      rowClass: (e) => (e.is_winner ? "is-new" : ""),
      columns: [
        { key: "name", label: "Ім'я", cell: (e) => e.name },
        { key: "contact", label: "Контакт", cell: (e) => contactLink(e.contact) },
        { key: "created", label: "Коли", cell: (e) => h("span", { class: "adm-num", text: fmtCreated(e.created_at) }) },
        { key: "win", label: "Переможець", cell: (e) => (e.is_winner ? h("span", { class: "adm-status adm-status--new", text: "Так" }) : "") },
      ],
    });
    search.input.addEventListener("input", () => {
      state.q = search.value();
      table.setItems(filteredEntries());
    });

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Розіграш", "Блок «Розіграш» на головній: таймер, приз, учасники й переможець.", [csvBtn, resetBtn, drawBtn]),
      h("div", { class: "adm-stats" },
        h("div", null, h("p", { class: "adm-stat__num", text: String(entries.length) }), h("p", { class: "adm-stat__label", text: T.plural(entries.length, ["учасник", "учасники", "учасників"]) })),
        h("div", null, h("p", { class: "adm-stat__num", text: data.cfg.enabled === false ? "Вимк." : data.cfg.winner ? "Фінал" : "Вкл." }), h("p", { class: "adm-stat__label", text: statusText() }))
      ),
      winnerCard,
      settingsPanel(),
      h("h2", { class: "adm-panel__title adm-section-gap", text: "Учасники" }),
      h("div", { class: "adm-toolbar" }, search.el),
      table.el,
    ]);
  }

  function filteredEntries() {
    const q = state.q.trim().toLowerCase();
    if (!q) return data.entries;
    const d = q.replace(/\D/g, "");
    return data.entries.filter((e) => e.name.toLowerCase().includes(q) || e.contact.toLowerCase().includes(q) || (d.length >= 3 && e.contact.replace(/\D/g, "").includes(d)));
  }

  function settingsPanel() {
    const c = data.cfg;
    const enabled = UI.checkbox({ label: "Показувати розіграш на сайті", note: "Вимкніть, щоб сховати весь блок з головної", checked: c.enabled !== false });
    const ends = UI.field({ label: "Завершення (київський час)", type: "datetime-local", value: isoToKyivLocal(c.ends_at), hint: "Після цього моменту таймер зупиняється, а форма закривається" });
    const prize = UI.field({ label: "Сума сертифіката", value: plain(c.prize), placeholder: "5 000 ₴", hint: "На сайті: «Виграй тату на …» і «Сертифікат на …»" });
    prize.input.maxLength = 30;
    const announce = UI.field({ label: "Коли оголосимо переможця", value: plain(c.announce), placeholder: "31 грудня о 20:00", hint: "На сайті: «Дивіться ефір …»" });
    announce.input.maxLength = 40;
    const note = UI.field({ label: "Примітка під кнопкою", value: plain(c.prize_note), placeholder: "Сертифікат дійсний 6 місяців після розіграшу." });
    note.input.maxLength = 120;

    const saveBtn = UI.button({ label: "Зберегти налаштування", variant: "solid", type: "submit" });
    const form = h("form", { class: "form adm-form", novalidate: true }, enabled.el, ends.el, h("div", { class: "adm-form__row" }, prize.el, announce.el), note.el, saveBtn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      [ends, prize].forEach((f) => f.setError(null));
      const iso = kyivLocalToIso(ends.value());
      let first = null;
      if (!iso) {
        ends.setError("Вкажіть дату й час");
        first = ends.input;
      }
      if (prize.value().trim().length < 1) {
        prize.setError("Вкажіть суму, наприклад 5 000 ₴");
        first = first || prize.input;
      }
      if (first) {
        first.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        // серверна функція зливає поля й не чіпає переможця (його пише лише draw_giveaway)
        await THDB.rpc("update_giveaway_settings", { p_patch: {
          enabled: enabled.checked(),
          ends_at: iso,
          prize: T.nbsp(prize.value().trim().replace(/\s+/g, " ")),
          announce: T.nbsp(announce.value().trim().replace(/\s+/g, " ")),
          prize_note: T.nbsp(note.value().trim().replace(/\s+/g, " ")),
        } });
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        saveBtn.disabled = false;
        return;
      }
      UI.toast("Налаштування розіграшу збережено");
      reload();
    });
    return UI.panel("Налаштування", form);
  }

  async function draw() {
    const again = !!data.cfg.winner;
    const ok = await UI.confirm({
      title: again ? "Обрати іншого переможця?" : "Обрати переможця?",
      text: "Сервер випадково обере одного з " + data.entries.length + " " + T.plural(data.entries.length, ["учасника", "учасників", "учасників"]) +
        (again ? " (крім поточного)" : "") + ". Ім'я й частково прихований контакт одразу з'являться на сайті, а форма участі закриється.",
      ok: again ? "Обрати іншого" : "Обрати переможця",
    });
    if (!ok) return;
    try {
      const w = await THDB.rpc("draw_giveaway");
      UI.toast("Переможець: " + w.name + ", " + w.contact);
    } catch (err) {
      console.error(err);
      UI.toast(err.code === "no_entries" ? "Немає учасників" : "Не вдалося обрати: " + (err.message || "помилка бази"), "error");
    }
    reload();
  }

  async function clearWinner() {
    const ok = await UI.confirm({ title: "Прибрати переможця з сайту?", text: "Учасники залишаться. Якщо розіграш ще не завершився, форма участі знову відкриється.", ok: "Прибрати" });
    if (!ok) return;
    try {
      await THDB.rpc("clear_giveaway_winner");
      UI.toast("Переможця прибрано з сайту");
    } catch (err) {
      console.error(err);
      UI.toast("Не вдалося: " + (err.message || "помилка бази"), "error");
    }
    reload();
  }

  async function reset() {
    const n = data.entries.length;
    const ok = await UI.confirm({
      title: "Скинути розіграш?",
      text: "Буде видалено " + n + " " + T.plural(n, ["учасника", "учасників", "учасників"]) + " і переможця. Це не скасувати. Якщо список ще потрібен, спершу завантажте CSV. Налаштування (дата, приз) залишаться.",
      ok: "Скинути",
      danger: true,
    });
    if (!ok) return;
    try {
      await THDB.rpc("reset_giveaway");
      UI.toast("Розіграш скинуто");
    } catch (err) {
      console.error(err);
      UI.toast("Не вдалося скинути: " + (err.message || "помилка бази"), "error");
    }
    reload();
  }

  async function openEntry(e) {
    const ok = await UI.confirm({
      title: "Видалити учасника?",
      text: e.name + " (" + e.contact + ") зникне зі списку. Наприклад, якщо це дубль або тестова заявка.",
      ok: "Видалити учасника",
      danger: true,
    });
    if (!ok) return;
    try {
      await THDB.remove("giveaway_entries", e.id);
      UI.toast("Учасника видалено");
    } catch (err) {
      console.error(err);
      UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
    }
    reload();
  }

  function downloadCsv() {
    // CSV-ін'єкція: значення на = + - @ Excel виконає як формулу, тому додаємо апостроф
    const esc = (v) => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [["Ім'я", "Контакт", "Дата", "Переможець"].map(esc).join(",")]
      .concat(data.entries.map((e) => [e.name, e.contact, fmtCreated(e.created_at), e.is_winner ? "так" : ""].map(esc).join(",")));
    // BOM, щоб Excel відкрив кирилицю правильно
    UI.download("tattoo-house-giveaway-" + UI.todayISO() + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }
})();
