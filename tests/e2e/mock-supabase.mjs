/*
 * Мок Supabase для перевірки адмінки без живого проєкту.
 * Відповідає як PostgREST + GoTrue + Storage на тих шляхах, які використовують
 * supabase-js (адмінка) і lib/site-data.js (сайт). Правила доступу повторюють
 * supabase/schema.sql: anon бачить лише видимі рядки й не бачить записів/учасників,
 * писати може лише адмін; RPC перевіряють те саме, що й SQL-функції.
 *
 *   import { startMock } from "./mock-supabase.mjs";
 *   const mock = await startMock(8766);   // http://localhost:8766
 *
 * Логін адміна: admin@example.test / mock-pass-123 (лише для моку).
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export const MOCK_ADMIN = { email: "admin@example.test", password: "mock-pass-123" };

function loadSeed() {
  const text = readFileSync(new URL("../../lib/seed-data.js", import.meta.url), "utf8");
  return JSON.parse(text.match(/window\.TH_SEED\s*=\s*(\{[\s\S]*\})\s*;\s*$/)[1]);
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const PUBLIC = ["services", "masters", "gallery", "reviews", "settings"];
const PRIVATE = ["bookings", "giveaway_entries"];
const SORTED = ["services", "masters", "gallery", "reviews"];

export async function startMock(port = 8766) {
  const seed = loadSeed();
  const now = () => new Date().toISOString();
  const stamp = (r) => ({ created_at: now(), updated_at: now(), ...r });
  const db = {
    services: seed.services.map(stamp),
    masters: seed.masters.map(stamp),
    gallery: seed.gallery.map(stamp),
    reviews: seed.reviews.map(stamp),
    settings: [stamp({ id: "info", data: seed.info }), stamp({ id: "giveaway", data: seed.giveaway })],
    bookings: [],
    giveaway_entries: [],
    admins: [],
  };
  const users = [{ id: randomUUID(), email: MOCK_ADMIN.email, password: MOCK_ADMIN.password }];
  db.admins.push({ user_id: users[0].id, name: "Адміністратор" });
  const tokens = new Map(); // access_token -> user
  const files = new Map(); // path -> { type, body }
  const log = [];
  const BASE = "http://localhost:" + port;

  const isAdmin = (u) => !!u && db.admins.some((a) => a.user_id === u.id);

  function session(u) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: u.id, email: u.email, role: "authenticated", exp }) + ".mock";
    tokens.set(token, u);
    return {
      access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r-" + randomUUID(),
      user: { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: now() },
    };
  }

  // ---------- PostgREST-фільтри ----------
  function parseFilters(params) {
    const f = [];
    for (const [k, v] of params) {
      if (["select", "order", "columns", "on_conflict", "limit", "offset"].includes(k)) continue;
      const m = /^(eq|neq|in)\.(.*)$/.exec(v);
      if (!m) continue;
      f.push({ col: k, op: m[1], val: m[2] });
    }
    return f;
  }
  const norm = (v) => (v === null || v === undefined ? "null" : String(v));
  function match(row, filters) {
    return filters.every(({ col, op, val }) => {
      if (op === "eq") return norm(row[col]) === val;
      if (op === "neq") return norm(row[col]) !== val;
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(norm(row[col]));
      return true;
    });
  }
  function order(rows, spec) {
    if (!spec) return rows;
    const [col, dir] = spec.split(".");
    const k = dir === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => (a[col] > b[col] ? k : a[col] < b[col] ? -k : 0));
  }
  function readable(table, user) {
    if (table === "admins") return db.admins.filter((a) => user && a.user_id === user.id);
    if (PRIVATE.includes(table)) return isAdmin(user) ? db[table] : [];
    if (table === "settings") return db.settings;
    return isAdmin(user) ? db[table] : db[table].filter((r) => r.visible !== false);
  }

  // ---------- RPC (та сама логіка, що в schema.sql) ----------
  function kyivToday() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  }
  const rpcErr = (m) => Object.assign(new Error(m), { rpc: true });
  const mask = (key) => (key.startsWith("@") ? key.slice(0, 4) + "***" : "+380*******" + key.replace(/\D/g, "").slice(-2));

  const RPC = {
    create_booking(a) {
      if (a.p_hp) throw rpcErr("spam");
      const name = String(a.p_name || "").trim();
      if (name.length < 2 || name.length > 60) throw rpcErr("bad_name");
      let d = String(a.p_phone || "").replace(/\D/g, "");
      if (/^0\d{9}$/.test(d)) d = "38" + d;
      if (!/^380\d{9}$/.test(d)) throw rpcErr("bad_phone");
      const phone = "+380 " + d.slice(3, 5) + " " + d.slice(5, 8) + " " + d.slice(8, 10) + " " + d.slice(10, 12);
      if (String(a.p_comment || "").length > 1000) throw rpcErr("bad_comment");
      const ids = a.p_services || [];
      if (ids.length < 1 || ids.length > 10) throw rpcErr("bad_services");
      const svc = db.services.filter((s) => ids.includes(s.id) && s.visible).sort((x, y) => x.sort - y.sort);
      if (svc.length !== new Set(ids).size) throw rpcErr("bad_services");
      let master_id = null, master_name = "Будь-який вільний";
      if (a.p_master !== "any") {
        const m = db.masters.find((x) => x.id === a.p_master && x.visible);
        if (!m) throw rpcErr("bad_master");
        master_id = m.id;
        master_name = m.name + (m.nick ? " «" + m.nick + "»" : "");
      }
      const date = new Date(a.p_date + "T00:00:00Z");
      const days = (date - kyivToday()) / 864e5;
      if (!(days >= 1 && days <= 60) || date.getUTCDay() === 1) throw rpcErr("bad_date");
      if (!["11:00", "13:00", "15:00", "17:00", "19:00"].includes(a.p_time)) throw rpcErr("bad_time");
      if (db.bookings.filter((b) => b.phone === phone && b.status === "new").length >= 3) throw rpcErr("too_many");
      const code = "TH-" + (10000 + Math.floor(Math.random() * 90000));
      db.bookings.push(stamp({
        id: randomUUID(), code, services: svc.map((s) => ({ id: s.id, name: s.name, price: s.price, unit: s.unit })),
        master_id, master_name, date: a.p_date, time: a.p_time, client_name: name, phone,
        comment: String(a.p_comment || "").trim(), total: svc.reduce((x, s) => x + s.price, 0), status: "new", admin_note: "",
      }));
      return { code };
    },
    join_giveaway(a) {
      if (a.p_hp) throw rpcErr("spam");
      const cfg = db.settings.find((s) => s.id === "giveaway").data;
      if (!cfg.enabled || !cfg.ends_at || new Date(cfg.ends_at) <= new Date() || (cfg.winner && typeof cfg.winner === "object")) throw rpcErr("closed");
      const name = String(a.p_name || "").trim();
      if (name.length < 2 || name.length > 60) throw rpcErr("bad_name");
      const raw = String(a.p_contact || "").trim();
      let key;
      if (/^@[A-Za-z0-9._]{2,30}$/.test(raw)) key = raw.toLowerCase();
      else {
        let d = raw.replace(/\D/g, "");
        if (/^0\d{9}$/.test(d)) d = "38" + d;
        if (!/^380\d{9}$/.test(d)) throw rpcErr("bad_contact");
        key = "+" + d;
      }
      if (db.giveaway_entries.some((e) => e.contact_key === key)) return "already";
      db.giveaway_entries.push(stamp({ id: randomUUID(), name, contact: raw, contact_key: key, is_winner: false }));
      return "ok";
    },
    draw_giveaway(a, user) {
      if (!isAdmin(user)) throw rpcErr("forbidden");
      let pool = db.giveaway_entries.filter((e) => !e.is_winner);
      if (!pool.length) pool = db.giveaway_entries;
      if (!pool.length) throw rpcErr("no_entries");
      const w = pool[Math.floor(Math.random() * pool.length)];
      db.giveaway_entries.forEach((e) => (e.is_winner = e.id === w.id));
      const s = db.settings.find((x) => x.id === "giveaway");
      s.data = { ...s.data, winner: { name: w.name.split(" ")[0], contact_masked: mask(w.contact_key), drawn_at: now() } };
      return { id: w.id, name: w.name, contact: w.contact };
    },
    reset_giveaway(a, user) {
      if (!isAdmin(user)) throw rpcErr("forbidden");
      db.giveaway_entries = [];
      const s = db.settings.find((x) => x.id === "giveaway");
      const { winner, ...rest } = s.data;
      s.data = rest;
      return null;
    },
    clear_giveaway_winner(a, user) {
      if (!isAdmin(user)) throw rpcErr("forbidden");
      db.giveaway_entries.forEach((e) => (e.is_winner = false));
      const s = db.settings.find((x) => x.id === "giveaway");
      const { winner, ...rest } = s.data;
      s.data = rest;
      return null;
    },
  };
  const ANON_RPC = ["create_booking", "join_giveaway"];

  // ---------- multipart (storage-js шле Blob як FormData) ----------
  function parseUpload(buf, type) {
    const m = /boundary=(.+)$/.exec(type || "");
    if (!m) return { type, body: buf };
    const boundary = Buffer.from("--" + m[1]);
    let pos = 0;
    while ((pos = buf.indexOf(boundary, pos)) !== -1) {
      const start = pos + boundary.length + 2;
      const headEnd = buf.indexOf("\r\n\r\n", start);
      if (headEnd === -1) break;
      const head = buf.slice(start, headEnd).toString();
      const next = buf.indexOf(boundary, headEnd);
      const ct = /Content-Type:\s*([^\r\n]+)/i.exec(head);
      if (ct && /^image\//.test(ct[1])) return { type: ct[1].trim(), body: buf.slice(headEnd + 4, next - 2) };
      pos = next;
    }
    return { type: "application/octet-stream", body: buf };
  }

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, BASE);
    const cors = {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "*",
      "Access-Control-Expose-Headers": "Content-Range, Content-Type",
      "Access-Control-Max-Age": "600",
    };
    const send = (status, body, extra = {}) => {
      const isBuf = Buffer.isBuffer(body);
      res.writeHead(status, { ...cors, "Content-Type": isBuf ? extra.type || "application/octet-stream" : "application/json", ...extra.headers });
      res.end(req.method === "HEAD" ? undefined : isBuf ? body : body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204);
    const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = tokens.get(auth) || null;
    const json = () => (raw.length ? JSON.parse(raw.toString()) : {});
    log.push(req.method + " " + url.pathname + url.search);

    try {
      // ---------- auth ----------
      if (url.pathname === "/auth/v1/token") {
        const b = json();
        const u = users.find((x) => x.email === b.email && x.password === b.password);
        if (!u) return send(400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(200, session(u));
      }
      if (url.pathname === "/auth/v1/user") {
        if (!user) return send(401, { msg: "invalid JWT", code: "bad_jwt" });
        if (req.method === "PUT") {
          const b = json();
          if (b.password) {
            if (String(b.password).length < 6) return send(422, { code: "weak_password", msg: "Password should be at least 6 characters." });
            user.password = b.password;
          }
        }
        return send(200, { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: {}, user_metadata: {} });
      }
      if (url.pathname === "/auth/v1/logout") {
        tokens.delete(auth);
        return send(204);
      }

      // ---------- storage ----------
      const pub = /^\/storage\/v1\/object\/public\/photos\/(.+)$/.exec(url.pathname);
      if (pub) {
        const f = files.get(decodeURIComponent(pub[1]));
        return f ? send(200, f.body, { type: f.type }) : send(404, { error: "not found" });
      }
      const obj = /^\/storage\/v1\/object\/photos(?:\/(.+))?$/.exec(url.pathname);
      if (obj) {
        if (!isAdmin(user)) return send(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
        if (req.method === "POST" && obj[1]) {
          files.set(decodeURIComponent(obj[1]), parseUpload(raw, req.headers["content-type"]));
          return send(200, { Key: "photos/" + obj[1], Id: randomUUID() });
        }
        if (req.method === "DELETE") {
          const removed = (json().prefixes || []).filter((p) => files.delete(p));
          return send(200, removed.map((name) => ({ name })));
        }
      }

      // ---------- rpc ----------
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
      if (rpc) {
        const fn = RPC[rpc[1]];
        if (!fn) return send(404, { code: "PGRST202", message: "function not found" });
        if (!ANON_RPC.includes(rpc[1]) && !user) return send(401, { code: "42501", message: "permission denied for function " + rpc[1] });
        try {
          return send(200, fn(json(), user));
        } catch (e) {
          if (e.rpc) return send(400, { code: "P0001", message: e.message, details: null, hint: null });
          throw e;
        }
      }

      // ---------- tables ----------
      const tm = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
      if (!tm) return send(404, { message: "not found" });
      const table = tm[1];
      if (!db[table]) return send(404, { code: "42P01", message: "relation does not exist" });
      const filters = parseFilters(url.searchParams);
      const wantObject = /vnd\.pgrst\.object/.test(req.headers.accept || "");
      const prefer = req.headers.prefer || "";
      const deny = () => send(401, { code: "42501", message: 'new row violates row-level security policy for table "' + table + '"' });

      if (req.method === "GET" || req.method === "HEAD") {
        if (table === "admins" && !user) return deny();
        if (PRIVATE.includes(table) && !user) return deny();
        let rows = order(readable(table, user).filter((r) => match(r, filters)), url.searchParams.get("order"));
        const headers = /count=exact/.test(prefer) ? { "Content-Range": (rows.length ? "0-" + (rows.length - 1) : "*") + "/" + rows.length } : {};
        if (wantObject) return rows.length === 1 ? send(200, rows[0], { headers }) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        return send(200, rows, { headers });
      }

      if (!isAdmin(user) || table === "admins") return deny();

      if (req.method === "POST") {
        const body = json();
        const list = Array.isArray(body) ? body : [body];
        const out = list.map((r) => {
          const i = db[table].findIndex((x) => x.id === r.id);
          if (i > -1) {
            db[table][i] = { ...db[table][i], ...r };
            return db[table][i];
          }
          const row = stamp({ id: r.id || randomUUID(), ...r });
          db[table].push(row);
          return row;
        });
        return wantObject ? send(201, out[0]) : send(201, /return=representation/.test(prefer) ? out : undefined);
      }
      if (req.method === "PATCH") {
        const patch = json();
        const rows = db[table].filter((r) => match(r, filters));
        rows.forEach((r) => Object.assign(r, patch));
        return wantObject ? (rows.length === 1 ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "no rows" })) : send(200, rows);
      }
      if (req.method === "DELETE") {
        if (!filters.length) return send(400, { message: "DELETE requires a WHERE clause" });
        const before = db[table].length;
        db[table] = db[table].filter((r) => !match(r, filters));
        // on delete set null для gallery.master_id
        if (table === "masters") db.gallery.forEach((g) => { if (!db.masters.some((m) => m.id === g.master_id)) g.master_id = null; });
        return send(before === db[table].length ? 200 : 204);
      }
      return send(405, { message: "method not allowed" });
    } catch (err) {
      console.error("mock error", err);
      return send(500, { message: String(err.message || err) });
    }
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: BASE,
    db,
    files,
    log,
    users,
    close: () => new Promise((r) => server.close(r)),
  };
}
