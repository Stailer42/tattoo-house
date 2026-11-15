/*
 * Розділ «Галерея»: роботи тату для gallery.html і блоку «Роботи» на головній (перші 8).
 * Завантаження кількох фото за раз (браузер стискає до 1200 px WebP), опис для незрячих (alt),
 * стиль і майстер для підпису, показати/сховати, порядок, видалення разом із файлом.
 */
(function () {
  const UI = THUI;
  const T = THText;
  const { h } = UI;

  const state = { reorder: false };
  let data = null;
  let root = null;

  THAdmin.register("gallery", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    const [gallery, masters] = await Promise.all([THDB.list("gallery"), THDB.list("masters")]);
    data = { gallery, masters };
  }

  async function reload() {
    await load();
    paint();
  }

  const plain = (s) => String(s || "").replace(/ /g, " ");
  const masterName = (id) => {
    const m = data.masters.find((x) => x.id === id);
    return m ? m.name + (m.nick ? " «" + m.nick + "»" : "") : "";
  };
  const styles = () => [...new Set(data.gallery.map((g) => plain(g.style)).filter(Boolean))].sort();

  function thumb(src) {
    return h("span", { class: "adm-thumb", "aria-hidden": "true" }, h("img", { src: THDB.fileUrl(src), alt: "", loading: "lazy" }));
  }

  function masterSelect(value) {
    return UI.select({
      label: "Майстер",
      value: value || "",
      options: [{ value: "", label: "Без підпису майстра" }].concat(data.masters.map((m) => ({ value: m.id, label: masterName(m.id) + (m.visible ? "" : " (прихований)") }))),
    });
  }

  function styleField(value) {
    const f = UI.field({ label: "Стиль", value: plain(value), placeholder: "Графіка, Реалізм, Ірезумі…", hint: "Підпис на фото й лічильник стилів у галереї" });
    f.input.maxLength = 40;
    const id = "gl-styles-" + Math.random().toString(36).slice(2);
    f.input.setAttribute("list", id);
    f.el.appendChild(h("datalist", { id }, styles().map((s) => h("option", { value: s }))));
    return f;
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

    const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    fileInput.addEventListener("change", () => {
      const files = [...fileInput.files];
      fileInput.value = "";
      if (files.length) openUpload(files);
    });
    const visibleN = data.gallery.filter((g) => g.visible).length;

    const list = UI.list({
      items: data.gallery,
      empty: "Фото ще немає. Натисніть «Завантажити фото».",
      row: (g) => ({
        title: plain(g.alt),
        hidden: !g.visible,
        hiddenLabel: "приховане",
        meta: [plain(g.style), masterName(g.master_id)].filter(Boolean).join(" / ") || "без підпису",
        thumb: thumb(g.src),
      }),
      onOpen: (g) => openPhoto(g),
      onToggle: async (g) => {
        await THDB.update("gallery", g.id, { visible: !g.visible });
        UI.toast(g.visible ? "Фото сховано з сайту" : "Фото знову на сайті");
        reload();
      },
      onMove: async (g, dir) => {
        const arr = data.gallery.slice();
        const i = arr.indexOf(g);
        const j = i + dir;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        // шлемо лише sort і лише для рядків, що зрушили (не затираємо правки з іншої вкладки)
        await Promise.all(arr.map((x, k) => (x.sort === k + 1 ? null : THDB.update("gallery", x.id, { sort: k + 1 }))));
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Галерея", "Видимих фото: " + visibleN + ". Порядок тут = порядок на сайті, на головній перші 8.", [
        reorderBtn,
        UI.button({ label: "Завантажити фото", icon: "upload", variant: "solid", small: true, onClick: () => fileInput.click() }),
      ]),
      fileInput,
      list.el,
    ]);
  }

  /* ---------- нові фото: стиснути, підписати, зберегти всі разом ---------- */
  async function openUpload(files) {
    const items = [];
    const box = h("div", { class: "adm-uploads" }, UI.empty("Стискаємо фото…"));
    let dirty = true;
    const saveBtn = UI.button({ label: "Додати в галерею", variant: "solid", disabled: true, onClick: () => save() });
    const dlg = UI.dialog({
      title: files.length === 1 ? "Нове фото" : "Нові фото: " + files.length,
      body: [h("p", { class: "adm-note", text: "Опишіть кожне фото словами: що на ньому й де на тілі. Цей текст читають незрячі й пошукові системи." }), box],
      actions: [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn],
      wide: true,
      isDirty: () => dirty,
      onClose: () => items.forEach((it) => URL.revokeObjectURL(it.url)),
    });

    for (const f of files.slice(0, 20)) {
      try {
        const c = await UI.compressImage(f, 1200, 0.82);
        items.push({ ...c, url: URL.createObjectURL(c.blob), name: f.name });
      } catch (err) {
        UI.toast(f.name + ": " + err.message, "error");
      }
    }
    if (files.length > 20) UI.toast("За раз можна до 20 фото, решту додайте наступним заходом", "error");
    UI.clear(box);
    if (!items.length) {
      box.appendChild(UI.empty("Жодне фото не вдалося прочитати."));
      return;
    }
    items.forEach((it, i) => {
      it.alt = UI.field({ label: "Що на фото", placeholder: "Чорно-сіра троянда на передпліччі", required: true });
      it.alt.input.maxLength = 200;
      it.style = styleField("");
      it.master = masterSelect("");
      box.appendChild(h("div", { class: "adm-upload" },
        h("img", { src: it.url, alt: "Нове фото " + (i + 1) }),
        h("div", { class: "adm-upload__fields" }, it.alt.el, h("div", { class: "adm-form__row" }, it.style.el, it.master.el))
      ));
    });
    saveBtn.disabled = false;
    items[0].alt.input.focus();

    async function save() {
      let first = null;
      items.forEach((it) => {
        const v = it.alt.value().trim();
        it.alt.setError(v.length < 3 ? "Опишіть фото (від 3 символів)" : null);
        if (v.length < 3 && !first) first = it.alt.input;
      });
      if (first) {
        first.focus();
        return;
      }
      saveBtn.disabled = true;
      UI.setLabel(saveBtn, "Завантажуємо…");
      // нові фото стають першими в галереї, у тому порядку, як обрані
      let sort = data.gallery.length ? Math.min(...data.gallery.map((g) => g.sort)) - items.length : 1;
      let done = 0;
      for (const it of items) {
        try {
          const src = await THDB.putFile(it.blob, "gallery");
          await THDB.insert("gallery", {
            id: THDB.newId(),
            src,
            w: it.width,
            h: it.height,
            alt: T.nbsp(it.alt.value().trim().replace(/\s+/g, " ")),
            style: it.style.value().trim().replace(/\s+/g, " "),
            master_id: it.master.value() || null,
            visible: true,
            sort: sort++,
          });
          done++;
        } catch (err) {
          console.error(err);
          UI.toast("Не вдалося завантажити «" + it.name + "»: " + (err.message || "помилка"), "error");
          break;
        }
      }
      dirty = false;
      dlg.close();
      if (done) UI.toast(done === 1 ? "Фото додано першим у галереї" : "Додано фото: " + done);
      reload();
    }
  }

  /* ---------- редагування одного фото ---------- */
  function openPhoto(g) {
    let dirty = false;
    const alt = UI.field({ label: "Що на фото", value: plain(g.alt), required: true });
    alt.input.maxLength = 200;
    const style = styleField(g.style);
    const master = masterSelect(g.master_id);
    const visible = UI.checkbox({ label: "Показувати на сайті", checked: g.visible });
    const form = h("form", { class: "form adm-form", novalidate: true },
      h("div", { class: "adm-photoedit" },
        h("div", { class: "adm-frame" }, h("img", { src: THDB.fileUrl(g.src), alt: "" })),
        h("div", { class: "form" }, alt.el, style.el, master.el, visible.el)
      )
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });
    const saveBtn = UI.button({ label: "Зберегти", variant: "solid", onClick: () => save() });
    const dlg = UI.dialog({
      title: "Фото роботи",
      body: form,
      wide: true,
      isDirty: () => dirty,
      actions: [
        UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }),
        UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }),
        saveBtn,
      ],
    });

    async function save() {
      const a = alt.value().trim().replace(/\s+/g, " ");
      if (a.length < 3) {
        alt.setError("Опишіть фото (від 3 символів)");
        alt.input.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        await THDB.put("gallery", { ...g, alt: T.nbsp(a), style: style.value().trim().replace(/\s+/g, " "), master_id: master.value() || null, visible: visible.checked() });
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти: " + (err.message || "помилка бази"), "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Зміни збережено");
      reload();
    }

    async function remove() {
      const ok = await UI.confirm({ title: "Видалити фото?", text: "Фото зникне з галереї назавжди. Щоб лише прибрати його з сайту, сховайте.", ok: "Видалити", danger: true });
      if (!ok) return;
      try {
        await THDB.remove("gallery", g.id);
        await THDB.removeFile(g.src);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося видалити: " + (err.message || "помилка бази"), "error");
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast("Фото видалено");
      reload();
    }
  }
})();
