/*
 * Розділ «Відгуки» (з референсу admin-panel): додати, редагувати, показати/сховати, порядок.
 * На головній показуються перші 3 видимі відгуки.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  const state = { reorder: false };
  let data = null;
  let root = null;

  THAdmin.register("reviews", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    data = { reviews: await THDB.list("reviews") };
  }

  async function reload() {
    await load();
    paint();
  }

  const plain = (s) => String(s || "").replace(/ /g, " ");

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
    const visibleN = data.reviews.filter((r) => r.visible).length;

    const list = UI.list({
      items: data.reviews,
      empty: "Відгуків ще немає.",
      row: (r) => ({
        title: r.author,
        hidden: !r.visible,
        hiddenLabel: "прихований",
        meta: [plain(r.caption), plain(r.text).slice(0, 70) + (r.text.length > 70 ? "…" : "")].filter(Boolean).join(" / "),
      }),
      onOpen: (r) => openReview(r),
      onToggle: async (r) => {
        await THDB.update("reviews", r.id, { visible: !r.visible });
        UI.toast(r.visible ? "Відгук сховано з сайту" : "Відгук знову на сайті");
        reload();
      },
      onMove: async (r, dir) => {
        const arr = data.reviews.slice();
        const i = arr.indexOf(r);
        const j = i + dir;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        // шлемо лише sort і лише для рядків, що зрушили (не затираємо правки з іншої вкладки)
        await Promise.all(arr.map((x, k) => (x.sort === k + 1 ? null : THDB.update("reviews", x.id, { sort: k + 1 }))));
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Відгуки", "На головній показуються перші 3 видимі відгуки в цьому порядку.", [
        reorderBtn,
        UI.button({ label: "Додати відгук", icon: "plus", variant: "solid", small: true, onClick: () => openReview(null) }),
      ]),
      !visibleN ? h("p", { class: "adm-warn" }, UI.icon("eye-off"), "Жодного видимого відгуку: блок відгуків на головній сховано.") : null,
      list.el,
    ]);
  }

  function openReview(review) {
    const isNew = !review;
    const r = review || { author: "", caption: "", text: "", visible: true };
    let dirty = false;

    const author = UI.field({ label: "Ім'я клієнта", value: plain(r.author), placeholder: "Олена, 24", hint: "Ім'я (і вік, якщо клієнт не проти)" });
    author.input.maxLength = 40;
    const caption = UI.field({ label: "Підпис, необов'язково", value: plain(r.caption), placeholder: "графіка на передпліччі" });
    caption.input.maxLength = 60;
    const text = UI.field({ label: "Текст відгуку", multiline: true, rows: 5, value: plain(r.text) });
    text.input.maxLength = 400;
    const counter = h("span", { class: "field__hint", "aria-live": "polite" });
    const count = () => (counter.textContent = text.value().length + " / 400 символів");
    text.input.addEventListener("input", count);
    count();
    text.el.appendChild(counter);
    const visible = UI.checkbox({ label: "Показувати на сайті", checked: r.visible });

    const form = h("form", { class: "form adm-form", novalidate: true },
      h("p", { class: "adm-note", text: "Додавайте лише справжні відгуки клієнтів, без вигаданих і без змін змісту." }),
      author.el, caption.el, text.el, visible.el
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати відгук" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));
    const dlg = UI.dialog({ title: isNew ? "Новий відгук" : "Відгук: " + r.author, body: form, actions, isDirty: () => dirty });
    if (isNew) author.input.focus();

    async function save() {
      author.setError(null);
      text.setError(null);
      let first = null;
      const a = author.value().trim().replace(/\s+/g, " ");
      const t = text.value().trim().replace(/[ \t]+/g, " ");
      if (a.length < 2) {
        author.setError("Введіть ім'я");
        first = author.input;
      }
      if (t.length < 20) {
        text.setError("Щонайменше 20 символів");
        first = first || text.input;
      }
      if (first) {
        first.focus();
        return;
      }
      saveBtn.disabled = true;
      const row = { ...r, author: a, caption: T.nbsp(caption.value().trim().replace(/\s+/g, " ")), text: T.nbsp(t), visible: visible.checked() };
      if (isNew) {
        row.id = THDB.newId();
        row.sort = data.reviews.length ? Math.min(...data.reviews.map((x) => x.sort)) - 1 : 1; // новий першим
      }
      try {
        if (isNew) await THDB.insert("reviews", row);
        else await THDB.put("reviews", row);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast(isNew ? "Відгук додано першим у списку" : "Зміни збережено");
      reload();
    }

    async function remove() {
      if (!(await UI.confirm({ title: "Видалити відгук?", text: "Відгук «" + r.author + "» зникне назавжди. Щоб лише прибрати його з сайту, сховайте.", ok: "Видалити", danger: true }))) return;
      try {
        await THDB.remove("reviews", r.id);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Відгук видалено");
      reload();
    }
  }
})();
