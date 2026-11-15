/*
 * Перевірка правил доступу на ЖИВОМУ Supabase з anon-ключем (як бачить будь-який відвідувач).
 *   node tests/e2e/th-security.mjs        потрібен .env із SUPABASE_URL і SUPABASE_ANON_KEY
 * Нічого не створює: усі «правильні» виклики навмисно ламаються на одній перевірці.
 */
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = (env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Потрібні SUPABASE_URL і SUPABASE_ANON_KEY у .env");
  process.exit(2);
}
const H = { apikey: KEY, "Content-Type": "application/json" };
if (/^eyJ/.test(KEY)) H.Authorization = "Bearer " + KEY;

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log((ok ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : ""));
};
async function req(method, path, body) {
  // return=representation: PATCH/DELETE повертають змінені рядки, тож «0 рядків» видно як []
  const r = await fetch(URL_ + path, { method, headers: { ...H, Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
  return { status: r.status, body: j };
}
const denied = (r) => r.status === 401 || r.status === 403 || (Array.isArray(r.body) && r.body.length === 0);

// читання
for (const t of ["services", "masters", "gallery", "reviews", "settings"]) {
  const r = await req("GET", "/rest/v1/" + t + "?select=*");
  check("anon читає " + t, r.status === 200 && Array.isArray(r.body) && r.body.length > 0, String(r.body && r.body.length));
}
const hidden = await req("GET", "/rest/v1/masters?select=id&visible=eq.false");
check("anon не бачить прихованих майстрів", hidden.status === 200 && hidden.body.length === 0, JSON.stringify(hidden.body));
for (const t of ["bookings", "giveaway_entries", "admins"]) {
  const r = await req("GET", "/rest/v1/" + t + "?select=*");
  check("anon НЕ читає " + t, denied(r), r.status + " " + JSON.stringify(r.body).slice(0, 80));
}

// запис у таблиці
const ins = await req("POST", "/rest/v1/masters", { id: "hacker", name: "Hacker" });
check("anon НЕ додає майстра", ins.status >= 400, ins.status + "");
const upd = await req("PATCH", "/rest/v1/services?id=eq.tattoo", { price: 1 });
const after = await req("GET", "/rest/v1/services?select=price&id=eq.tattoo");
check("anon НЕ змінює ціну", (upd.status >= 400 || (Array.isArray(upd.body) && !upd.body.length)) && after.body[0] && after.body[0].price !== 1, upd.status + "");
const setw = await req("PATCH", "/rest/v1/settings?id=eq.giveaway", { data: { enabled: false } });
check("anon НЕ змінює налаштування", setw.status >= 400 || (Array.isArray(setw.body) && !setw.body.length), setw.status + "");
const delb = await req("DELETE", "/rest/v1/bookings?id=neq.00000000-0000-0000-0000-000000000000");
check("anon НЕ видаляє записи", delb.status >= 400 || (Array.isArray(delb.body) && !delb.body.length) || delb.status === 204, delb.status + "");

// адмінські функції
for (const fn of ["draw_giveaway", "reset_giveaway", "clear_giveaway_winner", "update_giveaway_settings"]) {
  const r = await req("POST", "/rest/v1/rpc/" + fn, fn === "update_giveaway_settings" ? { p_patch: { enabled: false } } : {});
  check("anon НЕ викликає " + fn, r.status >= 400, r.status + " " + JSON.stringify(r.body).slice(0, 80));
}

// сховище
const up = await fetch(URL_ + "/storage/v1/object/photos/hack.txt", { method: "POST", headers: { apikey: KEY, ...(H.Authorization ? { Authorization: H.Authorization } : {}), "Content-Type": "image/png" }, body: "x" });
check("anon НЕ завантажує фото", up.status >= 400, up.status + "");

// перевірки create_booking (жоден виклик не проходить до вставки)
const day = (offset, wantMonday) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while ((d.getDay() === 1) !== wantMonday) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const base = { p_services: ["tattoo"], p_master: "any", p_date: day(3, false), p_time: "13:00", p_name: "Тест", p_phone: "+380671234567", p_comment: "", p_hp: "" };
const cases = [
  ["поганий телефон", { p_phone: "12345" }, "bad_phone"],
  ["коротке ім'я", { p_name: "Я" }, "bad_name"],
  ["минула дата", { p_date: day(-3, false) }, "bad_date"],
  ["понеділок", { p_date: day(3, true) }, "bad_date"],
  ["дата за межами 60 днів", { p_date: day(70, false) }, "bad_date"],
  ["невідомий час", { p_time: "12:30" }, "bad_time"],
  ["невідома послуга", { p_services: ["nope"] }, "bad_services"],
  ["невідомий майстер", { p_master: "nobody" }, "bad_master"],
  ["поле-пастка", { p_hp: "bot" }, "spam"],
];
for (const [name, patch, code] of cases) {
  const r = await req("POST", "/rest/v1/rpc/create_booking", { ...base, ...patch });
  check("create_booking відхиляє: " + name, r.status >= 400 && r.body && r.body.message === code, r.status + " " + (r.body && r.body.message));
}
const gw = await req("POST", "/rest/v1/rpc/join_giveaway", { p_name: "Тест", p_contact: "not-a-contact", p_hp: "" });
const gwLong = await req("POST", "/rest/v1/rpc/join_giveaway", { p_name: "Тест", p_contact: "x".repeat(500) + " 0671234567", p_hp: "" });
check("join_giveaway відхиляє довгий контакт", gwLong.status >= 400 && ["bad_contact", "closed"].includes(gwLong.body && gwLong.body.message), gwLong.body && gwLong.body.message);
check("join_giveaway відхиляє поганий контакт", gw.status >= 400 && ["bad_contact", "closed"].includes(gw.body && gw.body.message), gw.body && gw.body.message);

console.log(failed ? `\n${failed} FAIL` : "\nALL OK");
process.exit(failed ? 1 : 0);
