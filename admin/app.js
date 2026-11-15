/*
 * Tattoo House адмінка: оболонка, вхід, навігація між розділами (з референсу admin-panel).
 * Розділ = файл у sections/, який викликає THAdmin.register(id, { render }).
 * Адреса розділу: admin/#masters, admin/#bookings ...
 */
(function () {
  const UI = THUI;
  const { h } = UI;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // mobile: true = кнопка в нижній панелі телефона (решта ховається в «Ще»)
  const SECTIONS = [
    { id: "bookings", title: "Записи", icon: "calendar", mobile: true },
    { id: "masters", title: "Майстри", icon: "users", mobile: true },
    { id: "gallery", title: "Галерея", icon: "image", mobile: true },
    { id: "giveaway", title: "Розіграш", icon: "gift", mobile: true },
    { id: "services", title: "Послуги й ціни", short: "Послуги", icon: "tag" },
    { id: "reviews", title: "Відгуки", icon: "message" },
    { id: "info", title: "Основна інформація", short: "Інформація", icon: "info" },
    { id: "settings", title: "Налаштування", icon: "sliders" },
  ];
  const DEFAULT = "bookings";

  const registry = {};
  let user = null;
  let renderSeq = 0;

  // Збій бази (немає зв'язку, немає прав) у будь-якому збереженні:
  // замість тиші показуємо, що зміни не записались. Самі розділи ловлять лише очікувані помилки.
  window.addEventListener("unhandledrejection", (e) => {
    console.error(e.reason);
    if (!user) return; // до входу помилки показує екран входу
    UI.toast("Не вдалося зберегти зміни. Оновіть сторінку й спробуйте ще раз.", "error");
  });

  const Admin = {
    SECTIONS,
    register(id, def) {
      registry[id] = def;
    },
    get user() {
      return user;
    },
    // Перемалювати поточний розділ (після імпорту, скидання тощо)
    refresh() {
      return render(currentId(), false);
    },
    // Сесія закінчилась або користувача видалено
    async requireUser() {
      user = await THAuth.currentUser();
      if (!user) {
        showLogin("Сесія закінчилась, увійдіть знову.");
        return null;
      }
      return user;
    },
  };
  window.THAdmin = Admin;

  document.addEventListener("DOMContentLoaded", start);

  async function start() {
    try {
      await THDB.ready();
    } catch (err) {
      if (err.code === "not_configured") console.warn(err.message);
      else console.error(err);
      $("[data-boot]").replaceChildren(
        h("span", { class: "logo" }, "Tattoo\u00a0", h("span", { text: "House" })),
        h("div", { class: "adm-setup" },
          h("h1", { text: "Supabase не налаштовано" }),
          h("p", { text: "Адмінці потрібна база даних. Немає файлу config.js з адресою й ключем Supabase (або не завантажилась бібліотека supabase-js)." }),
          h("p", { class: "muted", text: "Локально: заповніть .env і виконайте python3 tools/make_config.py. На GitHub Pages: перевірте секрети SUPABASE_URL і SUPABASE_ANON_KEY у налаштуваннях репозиторію." })
        )
      );
      return;
    }
    bindLogin();
    buildNav();
    $$("[data-logout]").forEach((b) => b.addEventListener("click", logout));
    window.addEventListener("hashchange", () => {
      if (user) render(currentId(), true);
    });
    // сесія закінчується, навіть якщо вкладка просто відкрита; нові записи з сайту приходять без перезавантаження
    setInterval(() => {
      if (user) Admin.requireUser().then((u) => u && Admin.refreshBadges());
    }, 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (user && document.visibilityState === "visible") Admin.refreshBadges();
    });
    THDB.onChange((msg) => {
      if ((msg.tables || []).includes("bookings")) Admin.refreshBadges();
    });

    try {
      user = await THAuth.currentUser();
    } catch (err) {
      console.error(err);
      user = null;
    }
    $("[data-boot]").hidden = true;
    if (user) showApp(false);
    else showLogin();
  }

  /* ---------- вхід ---------- */

  function showLogin(message) {
    user = null;
    $("[data-app]").hidden = true;
    $("[data-login]").hidden = false;
    $("[data-skip]").setAttribute("href", "#login-main");
    document.title = "Вхід: адмінка Tattoo House";
    const pass = $("#l-pass");
    pass.value = "";
    setLoginError(message || "");
    $("#l-login").focus();
  }

  function setLoginError(text) {
    const el = $("[data-login-error]");
    el.textContent = text;
    el.hidden = !text;
  }

  let lockTimer = 0;

  function bindLogin() {
    const form = $("[data-login-form]");
    const submit = $("[data-login-submit]");
    const label = $(".btn__label", submit);
    const defaultLabel = label.textContent;

    $("[data-reveal]").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const input = $("#l-pass");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Сховати пароль" : "Показати пароль");
      $("use", btn).setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    });

    ["login", "password"].forEach((f) => {
      $('[data-f="' + f + '"] input').addEventListener("input", () => {
        $('[data-f="' + f + '"]').classList.remove("is-invalid");
      });
    });

    function lockCountdown(sec) {
      clearInterval(lockTimer);
      submit.disabled = true;
      const tick = () => {
        const left = THAuth.lockedFor();
        if (!left) {
          clearInterval(lockTimer);
          submit.disabled = false;
          setLoginError("");
          return;
        }
        setLoginError("Забагато невдалих спроб. Спробуйте через " + left + " с.");
      };
      tick();
      lockTimer = setInterval(tick, 1000);
    }

    if (THAuth.lockedFor()) lockCountdown();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const login = $("#l-login").value.trim();
      const password = $("#l-pass").value;
      $('[data-f="login"]').classList.toggle("is-invalid", !login);
      $('[data-f="password"]').classList.toggle("is-invalid", !password);
      if (!login || !password) {
        setLoginError("Введіть e-mail і пароль.");
        (login ? $("#l-pass") : $("#l-login")).focus();
        return;
      }

      submit.disabled = true;
      label.textContent = "Перевіряємо…";
      setLoginError("");
      let res;
      try {
        res = await THAuth.login(login, password);
      } catch (err) {
        console.error(err);
        res = { ok: false, reason: "error" };
      }
      label.textContent = defaultLabel;
      submit.disabled = false;

      if (res.ok) {
        user = res.user;
        showApp(true);
        return;
      }
      if (res.reason === "locked") {
        lockCountdown();
      } else if (res.reason === "error") {
        setLoginError("Немає зв'язку з базою. Перевірте інтернет і спробуйте ще раз.");
      } else if (res.reason === "not_admin") {
        setLoginError("Цей акаунт не має доступу до адмінки.");
      } else {
        setLoginError("Неправильний e-mail або пароль." + (res.left <= 2 ? " Залишилось спроб: " + res.left + "." : ""));
        $("#l-pass").select();
      }
    });
  }

  async function logout() {
    await THAuth.logout();
    history.replaceState(null, "", location.pathname);
    showLogin();
    UI.toast("Ви вийшли з адмінки");
  }

  /* ---------- оболонка й навігація ---------- */

  function showApp(focus) {
    $("[data-login]").hidden = true;
    $("[data-app]").hidden = false;
    $("[data-skip]").setAttribute("href", "#adm-main");
    $("[data-user]").textContent = user.name + " (" + user.login + ")";
    render(currentId(), focus);
    Admin.refreshBadges();
  }

  function currentId() {
    const id = location.hash.slice(1);
    return SECTIONS.some((s) => s.id === id) ? id : DEFAULT;
  }

  function navLink(s, short) {
    return h("a", { class: "adm-nav__link", href: "#" + s.id, "data-section": s.id },
      UI.icon(s.icon),
      h("span", { class: "adm-nav__text", text: short ? s.short || s.title : s.title }),
      h("span", { class: "adm-badge", "data-badge": s.id, hidden: true })
    );
  }

  function buildNav() {
    const side = $("[data-nav-side]");
    SECTIONS.forEach((s) => side.appendChild(navLink(s)));

    const bottom = $("[data-nav-bottom]");
    SECTIONS.filter((s) => s.mobile).forEach((s) => bottom.appendChild(navLink(s, true)));
    const more = h("button", { class: "adm-nav__link", type: "button", "aria-haspopup": "dialog", "data-more": "" },
      UI.icon("more"),
      h("span", { class: "adm-nav__text", text: "Ще" })
    );
    more.addEventListener("click", openMore);
    bottom.appendChild(more);
  }

  function openMore() {
    const list = h("nav", { class: "adm-more", "aria-label": "Усі розділи" }, SECTIONS.map((s) => navLink(s)));
    const extra = h("div", { class: "adm-more__foot" },
      h("a", { class: "ulink", href: "../index.html", target: "_blank", rel: "noopener" }, UI.icon("external"), "Відкрити сайт"),
      h("button", { class: "ulink", type: "button", on: { click: () => { dlg.close(); logout(); } } }, UI.icon("logout"), "Вийти")
    );
    const dlg = UI.dialog({ title: "Розділи", body: [list, extra] });
    markActive(currentId(), list);
    list.addEventListener("click", (e) => {
      if (e.target.closest("a")) dlg.close();
    });
  }

  function markActive(id, root) {
    $$("[data-section]", root || document).forEach((a) => {
      if (a.dataset.section === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    // «Ще» підсвічується, якщо відкрито розділ, якого немає в нижній панелі
    const more = $("[data-more]");
    if (more) more.classList.toggle("is-current", !SECTIONS.find((s) => s.id === id).mobile);
  }

  // Нові (непідтверджені) записи: число біля «Записів»
  Admin.refreshBadges = async function () {
    if (!user) return;
    try {
      Admin.setBadge("bookings", await THDB.count("bookings", { status: "new" }));
    } catch (err) {
      console.warn(err); // лічильник не важливіший за роботу розділу
    }
  };

  // Лічильник біля пункту меню (напр. нові записи)
  Admin.setBadge = function (id, n) {
    $$('[data-badge="' + id + '"]').forEach((b) => {
      b.hidden = !n;
      b.textContent = n > 99 ? "99+" : String(n);
      b.setAttribute("aria-label", n ? "нових: " + n : "");
    });
  };

  async function render(id, focus) {
    if (!(await Admin.requireUser())) return;
    const my = ++renderSeq;
    const s = SECTIONS.find((x) => x.id === id);
    const view = $("[data-view]");
    markActive(id);
    document.title = s.title + ": адмінка Tattoo House";

    const box = h("div", { class: "adm-view" });
    try {
      if (registry[id]) {
        await registry[id].render(box, { user, section: s });
      } else {
        UI.append(box, [
          UI.viewHead(s.title),
          h("div", { class: "adm-soon" },
            UI.icon(s.icon),
            h("p", { text: "Цей розділ ще в роботі." }),
            h("p", { class: "muted", text: "Поки що сайт показує ці дані як раніше." })
          ),
        ]);
      }
    } catch (err) {
      console.error(err);
      box.replaceChildren(UI.viewHead(s.title), UI.empty("Не вдалося відкрити розділ. Оновіть сторінку."));
    }
    if (my !== renderSeq) return; // поки малювали, користувач перейшов в інший розділ
    view.replaceChildren(box);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    if (focus) {
      const t = $(".adm-title", view);
      if (t) t.focus({ preventScroll: true });
    }
  }
})();
