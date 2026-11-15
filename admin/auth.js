/*
 * Tattoo House адмінка: вхід, сесія, зміна пароля (Supabase Auth).
 * ---------------------------------------------------------------
 * Пароль перевіряє сервер Supabase (bcrypt), у коді й у репозиторії його немає.
 * Увійти може лише користувач, для якого є рядок у таблиці admins:
 * без нього RLS не віддасть ані записів, ані учасників розіграшу.
 * Блокування на 60 с після 5 невдалих спроб узято з референсу (зручність,
 * а не захист: справжній ліміт спроб тримає Supabase).
 */
(function () {
  const LOCK_KEY = "th-admin-lock";
  const MAX_FAILS = 5;
  const LOCK_MS = 60 * 1000;

  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* сховище недоступне: блокування проживе до перезавантаження */
    }
  }

  function lockState() {
    return readJSON(LOCK_KEY) || { fails: 0, until: 0 };
  }

  const sb = () => THDB.client;

  // Рядок admins для поточного користувача або null
  async function adminRow(userId) {
    const { data, error } = await sb().from("admins").select("name").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data;
  }

  let cached = null; // { id, login, name, checked }
  // як часто перепитувати таблицю admins (адміна могли прибрати, поки вкладка відкрита)
  const RECHECK_MS = 5 * 60 * 1000;

  function isNetwork(err) {
    return !err || err.status === 0 || /fetch|network|Failed/i.test(err.message || "");
  }

  const api = {
    MIN_PASSWORD: 8,

    lockedFor() {
      const s = lockState();
      return Math.max(0, Math.ceil((s.until - Date.now()) / 1000));
    },

    /**
     * Повертає { ok: true, user } або { ok: false, reason, left }.
     * reason: "locked" | "wrong" | "not_admin" | "error"
     */
    async login(email, password) {
      const wait = api.lockedFor();
      if (wait) return { ok: false, reason: "locked", wait };

      const { data, error } = await sb().auth.signInWithPassword({ email: String(email).trim(), password: String(password) });
      if (error) {
        if (isNetwork(error) || error.status >= 500) return { ok: false, reason: "error" };
        const s = lockState();
        s.fails += 1;
        if (s.fails >= MAX_FAILS) {
          s.fails = 0;
          s.until = Date.now() + LOCK_MS;
        }
        writeJSON(LOCK_KEY, s);
        const w = api.lockedFor();
        return w ? { ok: false, reason: "locked", wait: w } : { ok: false, reason: "wrong", left: MAX_FAILS - s.fails };
      }

      writeJSON(LOCK_KEY, null);
      let row;
      try {
        row = await adminRow(data.user.id);
      } catch (e) {
        // пароль правильний, але таблицю admins не вдалося прочитати: це мережа, а не «немає доступу»
        await sb().auth.signOut();
        cached = null;
        return { ok: false, reason: "error" };
      }
      if (!row) {
        await sb().auth.signOut();
        cached = null;
        return { ok: false, reason: "not_admin" };
      }
      cached = { id: data.user.id, login: data.user.email, name: row.name || "Адміністратор", checked: Date.now() };
      return { ok: true, user: cached };
    },

    // Поточний адмін або null (немає сесії, сесія протухла, користувача прибрали з admins)
    async currentUser() {
      const { data } = await sb().auth.getSession();
      const session = data && data.session;
      if (!session) {
        cached = null;
        return null;
      }
      if (cached && cached.id === session.user.id && Date.now() - cached.checked < RECHECK_MS) return cached;
      let row = null;
      try {
        row = await adminRow(session.user.id);
      } catch (e) {
        // немає зв'язку: не викидаємо з адмінки через мережу, перевіримо наступного разу
        if (cached) return cached;
        throw e;
      }
      if (!row) {
        await sb().auth.signOut();
        cached = null;
        return null;
      }
      cached = { id: session.user.id, login: session.user.email, name: row.name || "Адміністратор", checked: Date.now() };
      return cached;
    },

    async logout() {
      cached = null;
      try {
        await sb().auth.signOut();
      } catch (e) {
        console.warn(e);
      }
    },

    /**
     * Зміна пароля: спершу перевіряємо поточний (повторний вхід), потім міняємо.
     * Повертає { ok: true } або { ok: false, field, message }.
     */
    async changePassword(current, next) {
      const user = await api.currentUser();
      if (!user) return { ok: false, field: "current", message: "Сесія закінчилась, увійдіть знову" };
      if (next.length < api.MIN_PASSWORD) return { ok: false, field: "next", message: "Мінімум " + api.MIN_PASSWORD + " символів" };
      if (next === current) return { ok: false, field: "next", message: "Новий пароль збігається з поточним" };
      const check = await sb().auth.signInWithPassword({ email: user.login, password: current });
      if (check.error) {
        if (isNetwork(check.error)) return { ok: false, field: "current", message: "Немає зв'язку з базою, спробуйте ще раз" };
        return { ok: false, field: "current", message: "Поточний пароль не підходить" };
      }
      const { error } = await sb().auth.updateUser({ password: next });
      if (error) {
        const weak = /weak|short|least/i.test(error.message || "");
        return { ok: false, field: "next", message: weak ? "Supabase вважає пароль заслабким: додайте цифри й літери" : "Не вдалося змінити пароль: " + error.message };
      }
      return { ok: true };
    },
  };

  window.THAuth = api;
})();
