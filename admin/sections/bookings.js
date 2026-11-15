/*
 * Розділ «Записи»: заявки з booking.html (послуги, майстер, дата, контакти, сума).
 * Статуси: нова -> підтверджена / скасована. Записи створює лише сайт (RPC create_booking),
 * тому тут немає форми «новий запис»: адмін їх переглядає, підтверджує, скасовує, коментує.
 * Список оновлюється раз на хвилину й при поверненні на вкладку.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  const STATUS = {
    new: { label: "Нова", cls: "adm-status--new" },
    confirmed: { label: "Підтверджена", cls: "adm-status--confirmed" },
    cancelled: { label: "Скасована", cls: "adm-status--cancelled" },
  };
  const FILTERS = [
    { id: "all", label: "Усі" },
    { id: "new", label: "Нові" },
    { id: "confirmed", label: "Підтверджені" },
    { id: "cancelled", label: "Скасовані" },
  ];

  const state = { filter: "all", q: "", sort: "created" };
  let data = [];
  let root = null;
  let table = null;
  let countEl = null;
  let timer = 0;
  let dialogOpen = false;

  THAdmin.register("bookings", {
    async render(box) {
      root = box;
      await load();
      paint();
      clearInterval(timer);
      timer = setInterval(() => {
        if (!root.isConnected || !THAdmin.user) return clearInterval(timer);
        if (!dialogOpen && document.visibilityState === "visible") reload(true);
      }, 60 * 1000);
    },
  });

  async function load() {
    data = await THDB.list("bookings");
  }

  async function reload(quiet) {
    try {
      await load();
    } catch (err) {
      if (!quiet) throw err;
      return;
    }
    if (table) {
      table.setItems(filtered());
      updateCount();
      paintTabs();
    }
    THAdmin.refreshBadges();
  }

  const DT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const D = new Intl.DateTimeFormat("uk-UA", { weekday: "short", day: "numeric", month: "long" });
  const fmtCreated = (iso) => DT.format(new Date(iso)).replace(/\s/g, " ");
  function fmtDate(isoDate) {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    return D.format(new Date(y, m - 1, d));
  }
  const svcNames = (b) => (b.services || []).map((s) => String(s.name || "").replace(/ /g, " ")).join(", ");

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    let rows = data.filter((b) => state.filter === "all" || b.status === state.filter);
    if (q) {
      rows = rows.filter((b) =>
        b.client_name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        (digits.length >= 3 && b.phone.replace(/\D/g, "").includes(digits))
      );
    }
    rows = rows.slice();
    if (state.sort === "session") rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    else rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows;
  }

  function statusChip(st) {
    const s = STATUS[st] || STATUS.new;
    return h("span", { class: "adm-status " + s.cls, text: s.label });
  }

  let tabsEl = null;
  function paintTabs() {
    if (!tabsEl) return;
    UI.clear(tabsEl);
    FILTERS.forEach((f) => {
      const n = f.id === "all" ? data.length : data.filter((b) => b.status === f.id).length;
      tabsEl.appendChild(h("button", {
        class: "tab",
        type: "button",
        "aria-pressed": String(state.filter === f.id),
        on: { click: () => { state.filter = f.id; table.setItems(filtered()); updateCount(); paintTabs(); } },
      }, f.label + " ", h("span", { class: "adm-tab__count", text: String(n) })));
    });
  }

  function updateCount() {
    const rows = filtered();
    const sum = rows.filter((b) => b.status !== "cancelled").reduce((a, b) => a + (b.total || 0), 0);
    countEl.textContent = "Показано: " + rows.length + (rows.length ? ". Сума без скасованих: від " + T.formatPrice(sum).replace(/ /g, " ") : "");
  }

  function paint() {
    tabsEl = h("div", { class: "tabs adm-tabs", role: "group", "aria-label": "Фільтр за статусом" });
    paintTabs();

    const search = UI.field({ label: "Пошук", type: "search", value: state.q, placeholder: "Ім'я, телефон або TH-12345" });
    search.input.addEventListener("input", () => {
      state.q = search.value();
      table.setItems(filtered());
      updateCount();
    });
    const sort = UI.select({
      label: "Сортування",
      value: state.sort,
      options: [
        { value: "created", label: "Спершу нові заявки" },
        { value: "session", label: "За датою сеансу" },
      ],
    });
    sort.input.addEventListener("change", () => {
      state.sort = sort.value();
      table.setItems(filtered());
    });

    countEl = h("p", { class: "adm-count", "aria-live": "polite" });

    table = UI.table({
      caption: "Записи клієнтів",
      items: filtered(),
      empty: data.length ? "За цим фільтром записів немає." : "Записів ще немає. Вони з'являться тут, щойно клієнт запишеться на сайті.",
      onOpen: (b) => openBooking(b),
      openLabel: (b) => "Відкрити запис " + b.code + ", " + b.client_name,
      rowClass: (b) => "is-" + b.status,
      columns: [
        { key: "code", label: "Код", cell: (b) => h("span", { class: "adm-num", text: b.code }) },
        { key: "created", label: "Створено", cell: (b) => h("span", { class: "adm-num", text: fmtCreated(b.created_at) }) },
        { key: "session", label: "Сеанс", cell: (b) => h("span", null, fmtDate(b.date), h("span", { class: "adm-sub adm-num", text: b.time })) },
        { key: "client", label: "Клієнт", cell: (b) => h("span", null, b.client_name, h("a", { class: "adm-sub adm-num", href: T.phoneHref(b.phone), text: b.phone })) },
        { key: "master", label: "Майстер", cell: (b) => b.master_name },
        { key: "services", label: "Послуги", cell: (b) => svcNames(b) },
        { key: "total", label: "Сума", class: "is-right", cell: (b) => h("span", { class: "adm-num", text: "від " + T.formatPrice(b.total) }) },
        { key: "status", label: "Статус", cell: (b) => statusChip(b.status) },
      ],
    });

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Записи", "Заявки зі сторінки запису. Нові позначені червоним: зателефонуйте клієнту й підтвердіть або скасуйте.", [
        UI.button({ label: "Оновити список", icon: "refresh", small: true, onClick: async () => { await reload(); UI.toast("Список оновлено"); } }),
      ]),
      h("div", { class: "adm-toolbar" }, tabsEl, search.el, sort.el),
      countEl,
      table.el,
    ]);
    updateCount();
  }

  function openBooking(b) {
    dialogOpen = true;
    let dirty = false;
    const note = UI.field({ label: "Нотатка адміністратора", multiline: true, rows: 3, value: b.admin_note || "", placeholder: "Домовились про ескіз, передзвонити в четвер…", hint: "Бачать лише адміни" });
    note.input.maxLength = 1000;
    note.input.addEventListener("input", () => (dirty = true));

    const dl = (label, value) => h("div", { class: "adm-dl__row" }, h("dt", { text: label }), h("dd", null, value));
    const services = h("ul", { class: "adm-svclist" }, (b.services || []).map((s) =>
      h("li", null, h("span", { text: String(s.name || "").replace(/ /g, " ") }), h("span", { class: "adm-num", text: "від " + T.formatPrice(s.price) + (s.unit || "") }))
    ));

    const body = [
      h("dl", { class: "adm-dl" },
        dl("Статус", statusChip(b.status)),
        dl("Клієнт", b.client_name),
        dl("Телефон", h("a", { href: T.phoneHref(b.phone), class: "adm-num", text: b.phone })),
        dl("Сеанс", fmtDate(b.date) + ", " + b.time),
        dl("Майстер", b.master_name),
        dl("Послуги", services),
        dl("Разом", h("b", { class: "adm-num", text: "від " + T.formatPrice(b.total) })),
        b.comment ? dl("Коментар клієнта", h("span", null, UI.lines(b.comment))) : null,
        dl("Заявка створена", fmtCreated(b.created_at))
      ),
      h("form", { class: "form adm-form", novalidate: true, on: { submit: (e) => { e.preventDefault(); saveStatus(b.status); } } }, note.el),
    ];

    const actions = [UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() })];
    if (b.status !== "cancelled") actions.push(UI.button({ label: "Скасувати запис", icon: "x", onClick: () => saveStatus("cancelled") }));
    if (b.status !== "new") actions.push(UI.button({ label: "Повернути в нові", icon: "reset", onClick: () => saveStatus("new") }));
    if (b.status !== "confirmed") actions.push(UI.button({ label: "Підтвердити запис", icon: "check", variant: "solid", onClick: () => saveStatus("confirmed") }));
    else actions.push(UI.button({ label: "Зберегти нотатку", variant: "solid", onClick: () => saveStatus("confirmed") }));

    const dlg = UI.dialog({
      title: "Запис " + b.code,
      body,
      actions,
      wide: true,
      isDirty: () => dirty,
      onClose: () => (dialogOpen = false),
    });

    async function saveStatus(status) {
      if (status === "cancelled") {
        const ok = await UI.confirm({ title: "Скасувати запис?", text: b.client_name + ", " + fmtDate(b.date) + " о " + b.time + ". Клієнту варто повідомити телефоном.", ok: "Скасувати запис", cancel: "Не скасовувати", danger: true });
        if (!ok) return;
      }
      dlg.el.querySelectorAll(".adm-dialog__actions .btn").forEach((x) => (x.disabled = true));
      try {
        await THDB.update("bookings", b.id, { status, admin_note: note.value().trim() });
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        dlg.el.querySelectorAll(".adm-dialog__actions .btn").forEach((x) => (x.disabled = false));
        return;
      }
      dirty = false;
      dlg.close();
      const msg = { new: "Запис повернуто в нові", confirmed: status === b.status ? "Нотатку збережено" : "Запис підтверджено", cancelled: "Запис скасовано" };
      UI.toast(msg[status]);
      reload();
    }

    async function remove() {
      const ok = await UI.confirm({
        title: "Видалити запис назавжди?",
        text: "Запис " + b.code + " (" + b.client_name + ") зникне разом із телефоном клієнта. Зазвичай достатньо скасувати.",
        ok: "Видалити",
        danger: true,
      });
      if (!ok) return;
      try {
        await THDB.remove("bookings", b.id);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Запис видалено");
      reload();
    }
  }
})();
