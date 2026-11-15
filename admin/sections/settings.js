/*
 * Розділ «Налаштування»: зміна пароля (Supabase Auth), резервна копія всіх даних у JSON, вихід.
 * Імпорт і «скинути демо-дані» з референсу прибрані: справжні дані живуть у Supabase,
 * відновлення робиться з копії вручну або засобами Supabase.
 */
(function () {
  const UI = THUI;
  const { h } = UI;

  THAdmin.register("settings", {
    async render(box, ctx) {
      UI.clear(box);
      UI.append(box, [
        UI.viewHead("Налаштування", "Вхід: " + ctx.user.login),
        h("div", { class: "adm-grid adm-grid--even" }, passwordPanel(), backupPanel()),
      ]);
    },
  });

  function passwordPanel() {
    const current = UI.field({ label: "Поточний пароль", type: "password", autocomplete: "current-password", reveal: true });
    const next = UI.field({ label: "Новий пароль", type: "password", autocomplete: "new-password", reveal: true, hint: "Мінімум " + THAuth.MIN_PASSWORD + " символів: літери й цифри" });
    const again = UI.field({ label: "Новий пароль ще раз", type: "password", autocomplete: "new-password", reveal: true });
    const btn = UI.button({ label: "Змінити пароль", variant: "solid", type: "submit" });
    const form = h("form", { class: "form adm-form", novalidate: true },
      h("input", { type: "email", autocomplete: "username", value: THAdmin.user ? THAdmin.user.login : "", hidden: true, readonly: true, "aria-hidden": "true", tabindex: "-1" }),
      current.el, next.el, again.el, btn
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      [current, next, again].forEach((f) => f.setError(null));
      if (!current.value()) {
        current.setError("Введіть поточний пароль");
        current.input.focus();
        return;
      }
      if (next.value() !== again.value()) {
        again.setError("Паролі не збігаються");
        again.input.focus();
        return;
      }
      btn.disabled = true;
      UI.setLabel(btn, "Змінюємо…");
      let res;
      try {
        res = await THAuth.changePassword(current.value(), next.value());
      } catch (err) {
        console.error(err);
        res = { ok: false, field: "current", message: "Немає зв'язку з базою, спробуйте ще раз" };
      }
      btn.disabled = false;
      UI.setLabel(btn, "Змінити пароль");
      if (!res.ok) {
        const f = res.field === "next" ? next : current;
        f.setError(res.message);
        f.input.focus();
        return;
      }
      form.reset();
      UI.toast("Пароль змінено. Наступного разу входьте з новим.");
    });
    return UI.panel("Пароль", h("p", { class: "adm-note", text: "Пароль зберігає Supabase (у зашифрованому вигляді), у коді сайту його немає. Забули пароль: Supabase → Authentication → Users → ваш акаунт → Send password recovery." }), form);
  }

  function backupPanel() {
    const btn = UI.button({
      label: "Завантажити копію",
      icon: "download",
      onClick: async () => {
        btn.disabled = true;
        try {
          const dump = await THDB.exportAll();
          UI.download("tattoo-house-backup-" + UI.todayISO() + ".json", JSON.stringify(dump, null, 2));
          UI.toast("Копію збережено у Завантаження");
        } catch (err) {
          console.error(err);
          UI.toast("Не вдалося зібрати копію: " + (err.message || "помилка бази"), "error");
        }
        btn.disabled = false;
      },
    });
    return UI.panel("Резервна копія",
      h("p", { class: "adm-note", text: "Усі дані одним файлом JSON: майстри, галерея, послуги, відгуки, контакти, розіграш, записи й учасники. У файлі є телефони клієнтів: зберігайте його лише в себе й нікому не пересилайте." }),
      h("div", { class: "adm-actions" }, btn)
    );
  }
})();
