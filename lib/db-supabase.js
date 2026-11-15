/*
 * Tattoo House: доступ адмінки до даних (Supabase).
 * ---------------------------------------------------------------
 * Це ЄДИНИЙ файл адмінки, який знає, де лежать дані. Розділи звертаються
 * лише до функцій THDB (той самий контракт, що й db-local.js у референсі).
 *
 * Ключі беруться з window.TH_CONFIG (../config.js). Файл config.js
 * генерується з .env (tools/make_config.py) або в GitHub Actions і в git не потрапляє.
 * Anon-ключ публічний за задумом Supabase: дані захищають правила RLS (supabase/schema.sql),
 * а не секретність ключа. Ключ service_role сюди не класти ніколи.
 */
(function () {
  const cfg = window.TH_CONFIG || {};
  const BUCKET = "photos";

  // Корінь сайту = папка над lib/ (працює і з /, і з /tattoo-house/)
  const here = document.currentScript && document.currentScript.src;
  const ROOT = here ? new URL("..", here).href : new URL("../", location.href).href;

  // Таблиці з ручним порядком; решта сортується за датою створення (нові зверху)
  const SORTED = ["services", "masters", "gallery", "reviews"];
  const TABLES = ["services", "masters", "gallery", "reviews", "settings", "bookings", "giveaway_entries"];

  let client = null;
  const listeners = new Set();

  function configured() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  }

  function getClient() {
    if (!client) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "th-admin-auth" },
      });
    }
    return client;
  }

  // Помилка Supabase -> Error з полем code (42501 = немає прав; для raise exception у функціях
  // PostgREST віддає code P0001, а зміст у message: no_entries, forbidden, ...)
  function fail(error) {
    const e = new Error(error.message || "db_error");
    e.code = error.code === "P0001" || !error.code ? error.message : error.code;
    e.details = error.details;
    return e;
  }

  async function run(query) {
    const { data, error } = await query;
    if (error) throw fail(error);
    return data;
  }

  function emit(tables) {
    listeners.forEach((cb) => {
      try {
        cb({ tables });
      } catch (e) {
        console.error(e);
      }
    });
  }

  function stamp(row, isNew) {
    const now = new Date().toISOString();
    const out = { ...row, updated_at: now };
    if (isNew && !out.created_at) out.created_at = now;
    return out;
  }

  const api = {
    TABLES,

    get configured() {
      return configured();
    },

    get client() {
      return configured() ? getClient() : null;
    },

    async ready() {
      if (!configured()) {
        const e = new Error("Supabase не налаштовано");
        e.code = "not_configured";
        throw e;
      }
      getClient();
    },

    newId() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    },

    // Усі рядки таблиці. PostgREST віддає максимум 1000 за раз, тому тягнемо сторінками.
    async list(table) {
      const PAGE = 1000;
      const out = [];
      for (let from = 0; ; from += PAGE) {
        let q = getClient().from(table).select("*");
        q = SORTED.includes(table) ? q.order("sort", { ascending: true }).order("id") : q.order("created_at", { ascending: false }).order("id");
        const rows = (await run(q.range(from, from + PAGE - 1))) || [];
        out.push(...rows);
        if (rows.length < PAGE) return out;
      }
    },

    async get(table, id) {
      return run(getClient().from(table).select("*").eq("id", id).maybeSingle());
    },

    async count(table, filters) {
      let q = getClient().from(table).select("id", { count: "exact", head: true });
      Object.entries(filters || {}).forEach(([k, v]) => {
        q = q.eq(k, v);
      });
      const { count, error } = await q;
      if (error) throw fail(error);
      return count || 0;
    },

    async put(table, row) {
      const data = await run(getClient().from(table).upsert(stamp(row, !row.created_at)).select().single());
      emit([table]);
      return data;
    },

    // Новий рядок: якщо такий id уже є (створили з іншої вкладки), буде помилка 23505, а не перезапис
    async insert(table, row) {
      const data = await run(getClient().from(table).insert(stamp(row, true)).select().single());
      emit([table]);
      return data;
    },

    async putMany(table, rows) {
      if (!rows.length) return [];
      const data = await run(getClient().from(table).upsert(rows.map((r) => stamp(r, !r.created_at))).select());
      emit([table]);
      return data;
    },

    async update(table, id, patch) {
      const data = await run(getClient().from(table).update(stamp(patch)).eq("id", id).select().single());
      emit([table]);
      return data;
    },

    async remove(table, id) {
      await run(getClient().from(table).delete().eq("id", id));
      emit([table]);
    },

    // Рядок-одинак у таблиці settings: { id: "info" | "giveaway", data: {...} }
    async single(id) {
      const row = await run(getClient().from("settings").select("data").eq("id", id).maybeSingle());
      return (row && row.data) || {};
    },

    async saveSingle(id, data) {
      await run(getClient().from("settings").upsert({ id, data, updated_at: new Date().toISOString() }));
      emit(["settings"]);
      return data;
    },

    async rpc(name, args) {
      const data = await run(getClient().rpc(name, args || {}));
      emit(["rpc:" + name]);
      return data;
    },

    /*
     * Фото: у базі зберігаємо готову публічну адресу файлу в бакеті.
     * prefix: "masters" | "gallery". Повертає адресу для поля src/photo.
     */
    async putFile(blob, prefix) {
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
      const path = (prefix || "misc") + "/" + api.newId() + "." + ext;
      await run(getClient().storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false }));
      return getClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    // Шлях у бакеті з публічної адреси; null для фото з репозиторію (assets/...)
    storagePath(src) {
      const marker = "/storage/v1/object/public/" + BUCKET + "/";
      const s = String(src || "");
      const i = s.indexOf(marker);
      if (i === -1) return null;
      try {
        return decodeURIComponent(s.slice(i + marker.length).split("?")[0]);
      } catch (e) {
        return null;
      }
    },

    async removeFile(src) {
      const path = api.storagePath(src);
      if (!path) return; // фото з репозиторію не чіпаємо
      try {
        await run(getClient().storage.from(BUCKET).remove([path]));
      } catch (e) {
        // файл міг уже зникнути: запис у базі важливіший, ніж сміття в бакеті
        console.warn("removeFile", e);
      }
    },

    // Адреса для <img>: фото з репо (assets/...) відносно кореня сайту, бакет як є
    fileUrl(src) {
      if (!src) return "";
      if (/^(https?:|data:|blob:)/.test(src)) return src;
      return new URL(src, ROOT).href;
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    // Резервна копія всіх таблиць (лише для адміна). Будь-яка помилка зупиняє копію:
    // порожня таблиця у файлі не повинна виглядати як справжній бекап.
    async exportAll() {
      const out = { app: "tattoo-house", version: 1, exported_at: new Date().toISOString(), tables: {} };
      for (const t of TABLES) out.tables[t] = await api.list(t);
      return out;
    },
  };

  window.THDB = api;
})();
