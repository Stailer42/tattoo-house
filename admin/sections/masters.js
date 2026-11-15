/*
 * Розділ «Майстри»: фото, ім'я, псевдо, стиль, теги, досвід, ціна, опис.
 * Сайт: перші 4 видимі майстри на головній, усі видимі на masters.html і в кроці 2 запису.
 * id майстра = slug латиницею (booking.html?master=slug, masters.html#slug): після створення не міняється.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  const state = { reorder: false };
  let data = null;
  let root = null;

  THAdmin.register("masters", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    const [masters, gallery] = await Promise.all([THDB.list("masters"), THDB.list("gallery")]);
    data = { masters, gallery };
  }

  async function reload() {
    await load();
    paint();
  }

  const plain = (s) => String(s || "").replace(/ /g, " ");

  // Транслітерація (КМУ 2010, спрощено) для slug
  const TR = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "", "’": "", ы: "y", э: "e", ё: "e", ъ: "" };
  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .split("")
      .map((c) => (c in TR ? TR[c] : c))
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);
  }
  function uniqueSlug(name) {
    const first = slugify(name.split(" ")[0]) || "master";
    const full = slugify(name) || first;
    const taken = new Set(data.masters.map((m) => m.id));
    for (const c of [first, full]) if (c.length >= 2 && !taken.has(c)) return c;
    for (let i = 2; i < 100; i++) if (!taken.has(first + "-" + i)) return first + "-" + i;
    return "m-" + Date.now().toString(36);
  }

  function metaText(m) {
    const works = data.gallery.filter((g) => g.master_id === m.id).length;
    return [
      m.nick ? "«" + plain(m.nick) + "»" : "",
      m.style,
      m.price,
      works ? works + " " + T.plural(works, ["робота", "роботи", "робіт"]) + " у галереї" : "",
    ].filter(Boolean).join(" / ");
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
    const visibleN = data.masters.filter((m) => m.visible).length;

    const list = UI.list({
      items: data.masters,
      empty: "Майстрів ще немає. Натисніть «Додати майстра».",
      row: (m) => ({
        title: m.name,
        hidden: !m.visible,
        hiddenLabel: "прихований",
        meta: metaText(m),
        thumb: UI.avatar(m.name, THDB.fileUrl(m.photo)),
      }),
      onOpen: (m) => openMaster(m),
      onToggle: async (m) => {
        await THDB.put("masters", { ...m, visible: !m.visible });
        UI.toast(m.visible ? m.name + ": сховано з сайту й форми запису" : m.name + ": знову на сайті");
        reload();
      },
      onMove: async (m, dir) => {
        const arr = data.masters.slice();
        const i = arr.indexOf(m);
        const j = i + dir;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        await THDB.putMany("masters", arr.map((x, k) => ({ ...x, sort: k + 1 })));
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Майстри", "Порядок тут = порядок на сайті. На головній показуються перші 4 видимі майстри.", [
        reorderBtn,
        UI.button({ label: "Додати майстра", icon: "plus", variant: "solid", small: true, onClick: () => openMaster(null) }),
      ]),
      !visibleN && data.masters.length ? h("p", { class: "adm-warn" }, UI.icon("eye-off"), "Жодного видимого майстра: у записі лишиться тільки «Будь-який вільний».") : null,
      list.el,
    ]);
  }

  function openMaster(master) {
    const isNew = !master;
    const m = master || { name: "", nick: "", style: "", tags: [], exp: 0, price: "", about: "", photo: "", photo_pos: "top", visible: true };
    let dirty = false;
    let pending = null; // { blob, url } нове фото, ще не збережене
    let dropPhoto = false;

    /* фото */
    const preview = h("div", { class: "adm-frame" });
    const fileInput = h("input", { type: "file", accept: "image/*", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const upBtn = UI.button({ label: "Завантажити фото", icon: "camera", small: true, onClick: () => fileInput.click() });
    const rmBtn = UI.button({
      label: "Прибрати фото",
      icon: "trash",
      small: true,
      onClick: () => {
        if (pending) URL.revokeObjectURL(pending.url);
        pending = null;
        dropPhoto = true;
        dirty = true;
        drawPhoto();
      },
    });

    function drawPhoto() {
      const url = pending ? pending.url : dropPhoto ? "" : THDB.fileUrl(m.photo);
      UI.clear(preview).appendChild(url ? h("img", { src: url, alt: "" }) : h("p", { class: "adm-frame__empty", text: "Без фото на сайті буде силует «Фото скоро»" }));
      UI.setLabel(upBtn, url ? "Замінити фото" : "Завантажити фото");
      rmBtn.hidden = !url;
    }

    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      upBtn.disabled = true;
      UI.setLabel(upBtn, "Стискаємо…");
      try {
        const { blob } = await UI.compressImage(f, 900, 0.85);
        if (pending) URL.revokeObjectURL(pending.url);
        pending = { blob, url: URL.createObjectURL(blob) };
        dropPhoto = false;
        dirty = true;
      } catch (err) {
        UI.toast(err.message, "error");
      }
      upBtn.disabled = false;
      drawPhoto();
    });

    /* поля */
    const name = UI.field({ label: "Ім'я та прізвище", value: m.name, required: true, placeholder: "Наприклад, Остап Коваль" });
    name.input.maxLength = 60;
    const nick = UI.field({ label: "Псевдо, необов'язково", value: plain(m.nick), placeholder: "Шрам", hint: "На сайті в лапках після імені" });
    nick.input.maxLength = 30;
    const style = UI.field({ label: "Стиль", value: plain(m.style), placeholder: "Реалізм ч/б" });
    style.input.maxLength = 60;
    const tags = UI.field({ label: "Теги через кому", value: (m.tags || []).map(plain).join(", "), placeholder: "Реалізм, Портрети, Чорно-сіре", hint: "До 6 тегів. Перший підсвічується червоним" });
    const exp = UI.field({ label: "Досвід, років", inputmode: "numeric", value: String(m.exp || 0) });
    const price = UI.field({ label: "Вартість роботи", value: plain(m.price), placeholder: "1 200 ₴/год або від 600 ₴", hint: "Як написати на сайті: за годину, за сеанс, від–до" });
    price.input.maxLength = 50;
    const about = UI.field({ label: "Опис", multiline: true, rows: 4, value: plain(m.about), placeholder: "Що робить, у чому сильний, як працює" });
    about.input.maxLength = 600;
    const pos = UI.select({
      label: "Кадр фото на сайті",
      value: m.photo_pos || "top",
      options: [
        { value: "top", label: "Портрет: тримати верх (обличчя)" },
        { value: "wide", label: "Широке фото: по центру" },
      ],
    });
    const visible = UI.checkbox({ label: "Показувати на сайті й у формі запису", checked: m.visible });
    const slugNote = isNew ? null : h("p", { class: "adm-note", text: "Адреса сторінки майстра: masters.html#" + m.id + " (не змінюється)." });

    const form = h("form", { class: "form adm-form", novalidate: true },
      h("div", { class: "adm-photoedit" },
        h("div", { class: "adm-photoedit__side" }, preview, h("div", { class: "adm-actions" }, upBtn, rmBtn), fileInput),
        h("div", { class: "form" }, name.el, nick.el, style.el, pos.el)
      ),
      tags.el,
      h("div", { class: "adm-form__row" }, exp.el, price.el),
      about.el,
      visible.el,
      slugNote
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати майстра" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));

    const dlg = UI.dialog({
      title: isNew ? "Новий майстер" : m.name,
      body: form,
      actions,
      wide: true,
      isDirty: () => dirty,
      onClose: () => {
        if (pending) URL.revokeObjectURL(pending.url);
      },
    });
    drawPhoto();
    if (isNew) name.input.focus();

    async function save() {
      [name, exp].forEach((f) => f.setError(null));
      const n = name.value().trim().replace(/\s+/g, " ");
      const years = UI.int(exp.value());
      let first = null;
      if (n.length < 2) {
        name.setError("Введіть ім'я майстра");
        first = name.input;
      } else if (data.masters.some((x) => x.id !== m.id && x.name.toLowerCase() === n.toLowerCase())) {
        name.setError("Майстер з таким ім'ям уже є");
        first = name.input;
      }
      if (years === null || years < 0 || years > 80) {
        exp.setError("Ціле число від 0 до 80");
        first = first || exp.input;
      }
      if (first) {
        first.focus();
        return;
      }

      saveBtn.disabled = true;
      UI.setLabel(saveBtn, "Зберігаємо…");
      const clean = (f) => T.nbsp(f.value().trim().replace(/\s+/g, " "));
      const row = {
        ...m,
        id: isNew ? uniqueSlug(n) : m.id,
        name: n,
        nick: nick.value().trim().replace(/\s+/g, " "),
        style: clean(style),
        tags: tags.value().split(",").map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 6),
        exp: years,
        price: clean(price),
        about: T.nbsp(about.value().trim().replace(/[ \t]+/g, " ")),
        photo_pos: pos.value(),
        visible: visible.checked(),
      };
      if (isNew) row.sort = data.masters.length ? Math.max(...data.masters.map((x) => x.sort)) + 1 : 1;
      try {
        const oldPhoto = m.photo;
        if (pending) row.photo = await THDB.putFile(pending.blob, "masters");
        else if (dropPhoto) row.photo = "";
        await THDB.put("masters", row);
        // старий файл у сховищі більше не потрібен (фото з репозиторію не чіпаються)
        if ((pending || dropPhoto) && oldPhoto) await THDB.removeFile(oldPhoto);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        saveBtn.disabled = false;
        UI.setLabel(saveBtn, isNew ? "Додати майстра" : "Зберегти");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast(isNew ? n + ": додано в кінець списку" : "Зміни збережено");
      reload();
    }

    async function remove() {
      const works = data.gallery.filter((g) => g.master_id === m.id).length;
      const ok = await UI.confirm({
        title: "Видалити майстра?",
        text: m.name + " зникне з сайту й форми запису. Старі записи клієнтів збережуться." +
          (works ? " " + works + " " + T.plural(works, ["фото", "фото", "фото"]) + " у галереї залишаться, але без підпису майстра." : "") +
          " Щоб лише тимчасово прибрати майстра, сховайте його.",
        ok: "Видалити",
        danger: true,
      });
      if (!ok) return;
      try {
        await THDB.remove("masters", m.id); // gallery.master_id обнулить сама база (on delete set null)
        if (m.photo) await THDB.removeFile(m.photo);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Майстра видалено");
      reload();
    }
  }
})();
