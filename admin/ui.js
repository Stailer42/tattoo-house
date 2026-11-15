/*
 * Tattoo House адмінка: спільні елементи інтерфейсу (з референсу admin-panel).
 * Увесь текст із бази вставляється як текст (textContent), не як HTML.
 */
(function () {
  const UI = {};

  /*
   * Створення елемента:
   *   UI.h("p", { class: "muted" }, "текст", otherNode)
   * props: class, text, on: { click: fn }, решта йде в атрибути
   * (true = порожній атрибут, false/null = не ставити).
   */
  UI.h = function (tag, props, ...children) {
    const el = document.createElement(tag);
    props = props || {};
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "on") Object.entries(v).forEach(([ev, fn]) => el.addEventListener(ev, fn));
      else if (k === "value" && "value" in el) el.value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    UI.append(el, children);
    return el;
  };

  UI.append = function (el, children) {
    children.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return el;
  };

  UI.clear = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  // Текст із "\n" -> рядки з <br>
  UI.lines = function (text) {
    const out = [];
    String(text || "").split("\n").forEach((line, i) => {
      if (i) out.push(document.createElement("br"));
      out.push(document.createTextNode(line));
    });
    return out;
  };

  UI.icon = function (name, cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  };

  /*
   * Кнопка в стилі сайту.
   * UI.button({ label, icon, variant: "solid"|"ghost", small, type, onClick, iconOnly, title })
   */
  UI.button = function (o) {
    const cls = ["btn", "btn--" + (o.variant || "ghost")];
    if (o.small) cls.push("btn--sm");
    if (o.iconOnly) cls.push("btn--icon");
    if (o.class) cls.push(o.class);
    const b = UI.h("button", {
      class: cls.join(" "),
      type: o.type || "button",
      "aria-label": o.iconOnly ? o.label : null,
      title: o.iconOnly ? o.label : o.title,
      disabled: o.disabled,
      on: o.onClick ? { click: o.onClick } : null,
    },
      UI.h("span", { class: "btn__fill" }),
      o.icon ? UI.icon(o.icon, o.iconClass) : null,
      o.iconOnly ? null : UI.h("span", { class: "btn__label", text: o.label })
    );
    return b;
  };

  // Поміняти текст кнопки (наприклад, "Зберігаємо…")
  UI.setLabel = function (btn, text) {
    const l = btn.querySelector(".btn__label");
    if (l) l.textContent = text;
  };

  let fieldSeq = 0;

  /*
   * Поле форми з підписом і помилкою (стилі .field із сайту).
   * UI.field({ label, name, type, value, multiline, rows, hint, required, autocomplete, inputmode, reveal })
   * Повертає { el, input, value(), setError(msg|null) }
   */
  UI.field = function (o) {
    const id = "f" + ++fieldSeq;
    const errId = id + "-err";
    const hintId = o.hint ? id + "-hint" : null;
    const input = o.multiline
      ? UI.h("textarea", { id, name: o.name, rows: o.rows || 3 })
      : UI.h("input", {
          id,
          name: o.name,
          type: o.type || "text",
          autocomplete: o.autocomplete || "off",
          inputmode: o.inputmode,
          min: o.min,
          max: o.max,
          step: o.step,
          placeholder: o.placeholder,
        });
    if (o.multiline && o.placeholder) input.placeholder = o.placeholder;
    if (o.value != null) input.value = o.value;
    if (o.required) input.required = true;
    input.setAttribute("aria-describedby", [hintId, errId].filter(Boolean).join(" "));

    const err = UI.h("span", { class: "field__error", id: errId }, UI.icon("alert"), UI.h("span"));
    const wrap = UI.h("div", { class: "field" + (o.reveal ? " field--reveal" : "") + (o.class ? " " + o.class : "") },
      UI.h("label", { for: id, text: o.label }),
      input,
      o.reveal ? UI.h("button", {
        class: "field__reveal",
        type: "button",
        "aria-label": "Показати пароль",
        "aria-pressed": "false",
        on: {
          click: (e) => {
            const btn = e.currentTarget;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.setAttribute("aria-pressed", String(show));
            btn.setAttribute("aria-label", show ? "Сховати пароль" : "Показати пароль");
            btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
          },
        },
      }, UI.icon("eye")) : null,
      o.hint ? UI.h("span", { class: "field__hint", id: hintId, text: o.hint }) : null,
      err
    );

    const api = {
      el: wrap,
      input,
      value: () => input.value,
      setError(msg) {
        wrap.classList.toggle("is-invalid", !!msg);
        input.setAttribute("aria-invalid", String(!!msg));
        err.lastChild.textContent = msg || "";
      },
    };
    input.addEventListener("input", () => api.setError(null));
    return api;
  };

  /* Чекбокс у стилі сайту (.check). Повертає { el, input, checked() } */
  UI.checkbox = function (o) {
    const input = UI.h("input", { type: "checkbox", name: o.name, checked: !!o.checked, value: o.value });
    if (o.onChange) input.addEventListener("change", () => o.onChange(input.checked));
    const el = UI.h("label", { class: "check" + (o.class ? " " + o.class : "") },
      input,
      UI.h("span", { class: "check__box" }, UI.icon("check")),
      UI.h("span", { class: "check__text" }, o.label, o.note ? UI.h("small", { class: "check__note", text: o.note }) : null)
    );
    return { el, input, checked: () => input.checked };
  };

  /* Випадний список. options: [{ value, label }] */
  UI.select = function (o) {
    const id = "f" + ++fieldSeq;
    const select = UI.h("select", { id, name: o.name },
      o.options.map((opt) => UI.h("option", { value: opt.value, text: opt.label, selected: opt.value === o.value }))
    );
    const wrap = UI.h("div", { class: "field field--select" },
      UI.h("label", { for: id, text: o.label }),
      select,
      o.hint ? UI.h("span", { class: "field__hint", text: o.hint }) : null
    );
    return { el: wrap, input: select, value: () => select.value };
  };

  /*
   * Список рядків з режимом «змінити порядок».
   * UI.list({
   *   items, empty: "текст",
   *   row(item) -> { title, meta, thumb (Node), hidden (bool), hiddenLabel, badge },
   *   onOpen(item), onToggle(item) [необов'язково], onMove(item, dir) [необов'язково]
   * })
   * Повертає { el, setReorder(on) }
   */
  UI.list = function (o) {
    const ul = UI.h("ul", { class: "adm-list" });
    let reorder = false;

    function draw() {
      UI.clear(ul);
      if (!o.items.length) {
        ul.appendChild(UI.h("li", { class: "adm-list__empty" }, UI.empty(o.empty || "Поки що порожньо.")));
        return;
      }
      o.items.forEach((item, i) => {
        const r = o.row(item);
        const tools = UI.h("div", { class: "adm-row__tools" });
        if (reorder && o.onMove) {
          tools.append(
            UI.button({ label: "Вище: " + r.title, icon: "chevron-up", iconOnly: true, small: true, disabled: i === 0, onClick: () => o.onMove(item, -1) }),
            UI.button({ label: "Нижче: " + r.title, icon: "chevron-down", iconOnly: true, small: true, disabled: i === o.items.length - 1, onClick: () => o.onMove(item, 1) })
          );
        } else if (o.onToggle) {
          const t = UI.button({
            label: (r.hidden ? "Показати на сайті: " : "Сховати з сайту: ") + r.title,
            icon: r.hidden ? "eye-off" : "eye",
            iconOnly: true,
            small: true,
            onClick: () => o.onToggle(item),
          });
          t.setAttribute("aria-pressed", String(!r.hidden));
          tools.append(t);
        }
        ul.appendChild(UI.h("li", { class: "adm-row" + (r.hidden ? " is-hidden" : "") },
          UI.h("button", { class: "adm-row__main", type: "button", on: { click: () => o.onOpen(item) }, disabled: reorder },
            r.thumb || null,
            UI.h("span", { class: "adm-row__text" },
              UI.h("span", { class: "adm-row__title" }, r.title, r.hidden ? UI.h("span", { class: "adm-chip", text: r.hiddenLabel || "прихована" }) : null, r.badge || null),
              r.meta ? UI.h("span", { class: "adm-row__meta", text: r.meta }) : null
            )
          ),
          tools
        ));
      });
    }

    draw();
    return {
      el: ul,
      setItems(items) {
        o.items = items;
        draw();
      },
      setReorder(on) {
        reorder = on;
        draw();
      },
    };
  };

  /*
   * Таблиця з колонками (записи, учасники розіграшу). На екрані < 720 px
   * кожен рядок стає карткою: підпис колонки береться з data-label.
   * UI.table({
   *   columns: [{ key, label, cell(item) -> Node|string, class }],
   *   items, empty: "текст",
   *   onOpen(item) [необов'язково] -> перша колонка стає кнопкою, клік по рядку теж відкриває,
   *   openLabel(item) -> підпис для кнопки (читачі екрана),
   *   rowClass(item) -> додатковий клас рядка
   * })
   * Повертає { el, setItems(items) }
   */
  UI.table = function (o) {
    const wrap = UI.h("div", { class: "adm-tablewrap" });

    function cellContent(col, item) {
      const v = col.cell ? col.cell(item) : item[col.key];
      return v == null || v === "" ? UI.h("span", { class: "muted", text: "—" }) : v;
    }

    function draw() {
      UI.clear(wrap);
      if (!o.items.length) {
        wrap.appendChild(UI.empty(o.empty || "Поки що порожньо."));
        return;
      }
      const head = UI.h("thead", null,
        UI.h("tr", null, o.columns.map((c) => UI.h("th", { scope: "col", class: c.class || null, text: c.label })))
      );
      const body = UI.h("tbody");
      o.items.forEach((item) => {
        const tr = UI.h("tr", { class: ["adm-tr", o.onOpen ? "is-clickable" : "", o.rowClass ? o.rowClass(item) : ""].filter(Boolean).join(" ") });
        o.columns.forEach((c, i) => {
          let content = cellContent(c, item);
          if (i === 0 && o.onOpen) {
            content = UI.h("button", {
              class: "adm-table__open",
              type: "button",
              "aria-label": o.openLabel ? o.openLabel(item) : null,
              on: { click: () => o.onOpen(item) },
            }, content);
          }
          tr.appendChild(UI.h("td", { class: c.class || null, "data-label": c.label }, content));
        });
        if (o.onOpen) {
          // клік по будь-якому місцю рядка (крім посилань і кнопок усередині)
          tr.addEventListener("click", (e) => {
            if (e.target.closest("a, button, input, select, label")) return;
            o.onOpen(item);
          });
        }
        body.appendChild(tr);
      });
      wrap.appendChild(UI.h("table", { class: "adm-table" }, o.caption ? UI.h("caption", { class: "sr-only", text: o.caption }) : null, head, body));
    }

    draw();
    return {
      el: wrap,
      setItems(items) {
        o.items = items;
        draw();
      },
    };
  };

  /*
   * Стиснути фото в браузері: довша сторона до maxSide, WebP (або JPEG, якщо WebP не вміє).
   * Повертає { blob, width, height }. Кидає Error з людським текстом.
   */
  UI.compressImage = async function (file, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality || 0.82;
    if (!file || !/^image\//.test(file.type)) throw new Error("Це не фото. Оберіть файл JPG, PNG або WebP.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Файл завеликий (більше 25 МБ).");
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch (e) {
      throw new Error("Не вдалося прочитати фото. Спробуйте JPG або PNG.");
    }
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const width = Math.round(bmp.width * k);
    const height = Math.round(bmp.height * k);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);
    if (bmp.close) bmp.close();
    const toBlob = (type) => new Promise((res) => canvas.toBlob(res, type, quality));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob) throw new Error("Не вдалося стиснути фото.");
    return { blob, width, height };
  };

  // Кругла аватарка: фото або ініціали
  UI.avatar = function (name, url, size) {
    const el = UI.h("span", { class: "adm-avatar" + (size === "lg" ? " adm-avatar--lg" : ""), "aria-hidden": "true" });
    if (url) el.appendChild(UI.h("img", { src: url, alt: "" }));
    else el.textContent = UI.initials(name);
    return el;
  };

  UI.initials = function (name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  };

  // Ціле число з поля; null, якщо порожньо чи не число
  UI.int = function (value) {
    const s = String(value).trim().replace(/\s/g, "");
    if (!/^-?\d+$/.test(s)) return null;
    return Number(s);
  };

  /* ---------- тости ---------- */
  let toastTimer = 0;
  UI.toast = function (text, kind) {
    let box = document.querySelector(".adm-toast");
    if (!box) {
      box = UI.h("div", { class: "adm-toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.classList.toggle("is-error", kind === "error");
    box.classList.remove("is-on");
    void box.offsetWidth; // перезапуск анімації
    box.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("is-on"), kind === "error" ? 6000 : 3200);
  };

  /* ---------- діалоги ---------- */

  /*
   * UI.dialog({ title, body: Node|[Node], actions: [buttons], wide, onClose, isDirty })
   * Повертає { el, close(), tryClose() }. На телефоні відкривається знизу як шторка.
   * isDirty() -> true: перед закриттям (Esc, хрестик, клік повз) спитати, чи викинути зміни.
   */
  UI.dialog = function (o) {
    const titleId = "dlg" + ++fieldSeq;
    const closeBtn = UI.button({ label: "Закрити", icon: "x", iconOnly: true, small: true, class: "adm-dialog__x" });
    const d = UI.h("dialog", { class: "adm-dialog" + (o.wide ? " adm-dialog--wide" : ""), "aria-labelledby": titleId },
      UI.h("div", { class: "adm-dialog__head" },
        UI.h("h2", { id: titleId, text: o.title }),
        closeBtn
      ),
      UI.h("div", { class: "adm-dialog__body" }, o.body || []),
      o.actions && o.actions.length ? UI.h("div", { class: "adm-dialog__actions" }, o.actions) : null
    );
    const prevFocus = document.activeElement;
    const close = () => {
      if (d.open) d.close();
    };
    let asking = false;
    const tryClose = async () => {
      if (asking) return;
      if (o.isDirty && o.isDirty()) {
        asking = true;
        const ok = await UI.confirm({
          title: "Закрити без збереження?",
          text: "Зміни в цій формі буде втрачено.",
          ok: "Не зберігати",
          cancel: "Повернутися",
          danger: true,
        });
        asking = false;
        if (!ok) return;
      }
      close();
    };
    closeBtn.addEventListener("click", tryClose);
    // Esc
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      tryClose();
    });
    // клік по затемненню (саме по фону, не по вмісту)
    d.addEventListener("click", (e) => {
      if (e.target === d) tryClose();
    });
    d.addEventListener("close", () => {
      d.remove();
      if (o.onClose) o.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    });
    document.body.appendChild(d);
    d.showModal();
    return { el: d, close, tryClose };
  };

  // Підтвердження: await UI.confirm({ title, text, ok: "Видалити", danger: true }) -> true/false
  UI.confirm = function (o) {
    return new Promise((resolve) => {
      let result = false;
      const ok = UI.button({ label: o.ok || "Так", variant: "solid", onClick: () => { result = true; dlg.close(); } });
      const cancel = UI.button({ label: o.cancel || "Скасувати", onClick: () => dlg.close() });
      const dlg = UI.dialog({
        title: o.title,
        body: UI.h("p", { text: o.text }),
        actions: [cancel, ok],
        onClose: () => resolve(result),
      });
      (o.danger ? cancel : ok).focus();
    });
  };

  /* ---------- блоки сторінки ---------- */

  UI.viewHead = function (title, lead, actions) {
    return UI.h("div", { class: "adm-head" },
      UI.h("div", null,
        UI.h("h1", { class: "adm-title", tabindex: "-1", text: title }),
        lead ? UI.h("p", { class: "adm-lead", text: lead }) : null
      ),
      actions && actions.length ? UI.h("div", { class: "adm-head__actions" }, actions) : null
    );
  };

  UI.panel = function (title, ...children) {
    return UI.h("section", { class: "adm-panel" },
      title ? UI.h("h2", { class: "adm-panel__title", text: title }) : null,
      children
    );
  };

  UI.empty = function (text) {
    return UI.h("p", { class: "empty", text });
  };

  // Завантажити текст як файл
  UI.download = function (filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
    const a = UI.h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  UI.todayISO = function () {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  window.THUI = UI;
})();
