/*
 * Розділ «Послуги й ціни»: блок «Послуги» на головній, крок 1 запису й чек.
 * Ціна «від» у гривнях; сервер рахує суму запису саме за цими цінами.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  const ICONS = [
    { id: "dagger", label: "Кинджал" },
    { id: "star", label: "Зірка" },
    { id: "flame", label: "Полум'я" },
    { id: "bolt", label: "Блискавка" },
    { id: "horns", label: "Роги" },
    { id: "skull", label: "Череп" },
  ];

  const state = { reorder: false };
  let data = null;
  let root = null;

  THAdmin.register("services", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    data = { services: await THDB.list("services") };
  }

  async function reload() {
    await load();
    paint();
  }

  const plain = (s) => String(s || "").replace(/ /g, " ");

  function art(id) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "adm-art");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#a-" + id);
    svg.appendChild(use);
    return svg;
  }

  function slugify(text) {
    const TR = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia" };
    const base = String(text || "").toLowerCase().split("").map((c) => (c in TR ? TR[c] : c)).join("")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "service";
    const taken = new Set(data.services.map((s) => s.id));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) if (!taken.has(base + "-" + i)) return base + "-" + i;
    return "s-" + Date.now().toString(36);
  }

  function paint() {
    const reorderBtn = UI.button({
      label: state.reorder ? "Готово" : "Змінити порядок",
      icon: state.reorder ? "check" : "move",
      small: true,
      onClick: () => {
        state.reorder = !state.reorder;
        paint();
      },
    });
    reorderBtn.setAttribute("aria-pressed", String(state.reorder));
    const visibleN = data.services.filter((s) => s.visible).length;

    const list = UI.list({
      items: data.services,
      empty: "Послуг ще немає. Натисніть «Додати послугу».",
      row: (s) => ({
        title: plain(s.name),
        hidden: !s.visible,
        hiddenLabel: "прихована",
        meta: "від " + plain(T.formatPrice(s.price)) + plain(s.unit) + (s.text ? " / " + plain(s.text).slice(0, 60) + (s.text.length > 60 ? "…" : "") : ""),
        thumb: art(s.icon),
      }),
      onOpen: (s) => openService(s),
      onToggle: async (s) => {
        await THDB.put("services", { ...s, visible: !s.visible });
        UI.toast(s.visible ? "Послугу сховано з сайту й запису" : "Послуга знову на сайті");
        reload();
      },
      onMove: async (s, dir) => {
        const arr = data.services.slice();
        const i = arr.indexOf(s);
        const j = i + dir;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        await THDB.putMany("services", arr.map((x, k) => ({ ...x, sort: k + 1 })));
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Послуги й ціни", "Ці послуги показуються на головній, у кроці 1 запису й у чеку. Сума запису рахується з цих цін.", [
        reorderBtn,
        UI.button({ label: "Додати послугу", icon: "plus", variant: "solid", small: true, onClick: () => openService(null) }),
      ]),
      !visibleN && data.services.length ? h("p", { class: "adm-warn" }, UI.icon("alert"), "Жодної видимої послуги: записатися на сайті неможливо.") : null,
      list.el,
    ]);
  }

  function openService(service) {
    const isNew = !service;
    const s = service || { name: "", icon: "dagger", price: "", unit: "", text: "", visible: true };
    let dirty = false;

    const name = UI.field({ label: "Назва", value: plain(s.name), required: true, placeholder: "Тату, Пірсинг, Перекриття…" });
    name.input.maxLength = 40;
    const priceF = UI.field({ label: "Ціна від, ₴", inputmode: "numeric", value: s.price === "" ? "" : String(s.price), placeholder: "1500" });
    const unit = UI.field({ label: "Після ціни, необов'язково", value: plain(s.unit), placeholder: "/сеанс", hint: "Наприклад «/сеанс» або «/год»" });
    unit.input.maxLength = 12;
    const text = UI.field({ label: "Короткий опис", multiline: true, rows: 3, value: plain(s.text), placeholder: "Одне-два речення: що входить у послугу" });
    text.input.maxLength = 300;
    const visible = UI.checkbox({ label: "Показувати на сайті й у записі", checked: s.visible });

    const icons = h("fieldset", { class: "adm-icons" },
      h("legend", { text: "Арт на картці" }),
      ICONS.map((ic) => {
        const input = h("input", { type: "radio", name: "svc-icon", value: ic.id, checked: ic.id === s.icon, "aria-label": ic.label });
        const lab = h("label", { title: ic.label }, input, art(ic.id));
        return lab;
      })
    );

    const form = h("form", { class: "form adm-form", novalidate: true },
      name.el,
      h("div", { class: "adm-form__row" }, priceF.el, unit.el),
      text.el,
      icons,
      visible.el
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати послугу" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));
    const dlg = UI.dialog({ title: isNew ? "Нова послуга" : plain(s.name), body: form, actions, isDirty: () => dirty });
    if (isNew) name.input.focus();

    async function save() {
      [name, priceF].forEach((f) => f.setError(null));
      const n = name.value().trim().replace(/\s+/g, " ");
      const p = UI.int(priceF.value());
      let first = null;
      if (n.length < 2) {
        name.setError("Введіть назву");
        first = name.input;
      }
      if (p === null || p < 0 || p > 1000000) {
        priceF.setError("Ціна цілим числом, наприклад 1500");
        first = first || priceF.input;
      }
      if (first) {
        first.focus();
        return;
      }
      const iconInput = form.querySelector('input[name="svc-icon"]:checked');
      saveBtn.disabled = true;
      const row = {
        ...s,
        id: isNew ? slugify(n) : s.id,
        name: T.nbsp(n),
        icon: iconInput ? iconInput.value : "dagger",
        price: p,
        unit: unit.value().trim(),
        text: T.nbsp(text.value().trim().replace(/[ \t]+/g, " ")),
        visible: visible.checked(),
      };
      if (isNew) row.sort = data.services.length ? Math.max(...data.services.map((x) => x.sort)) + 1 : 1;
      try {
        await THDB.put("services", row);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast(isNew ? n + ": додано в кінець списку" : "Зміни збережено");
      reload();
    }

    async function remove() {
      const ok = await UI.confirm({
        title: "Видалити послугу?",
        text: "«" + plain(s.name) + "» зникне з сайту й запису. У вже створених записах назва й ціна збережуться. Щоб лише тимчасово прибрати послугу, сховайте її.",
        ok: "Видалити",
        danger: true,
      });
      if (!ok) return;
      try {
        await THDB.remove("services", s.id);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Послугу видалено");
      reload();
    }
  }
})();
