/*
 * Прибрати тестові дані з ЖИВОГО Supabase після e2e, що впав посередині.
 *   node tests/e2e/th-cleanup.mjs           показати, що знайдено
 *   node tests/e2e/th-cleanup.mjs --delete  видалити
 * Шукає лише рядки з позначкою E2E (так їх називає th-admin.mjs / th-site.mjs).
 * Входить тестовим адміном із .env (TEST_ADMIN_*).
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = env.SUPABASE_URL.replace(/\/+$/, "");
const H = { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const DEL = process.argv.includes("--delete");

const login = await fetch(URL_ + "/auth/v1/token?grant_type=password", {
  method: "POST", headers: H, body: JSON.stringify({ email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD }),
});
const session = await login.json();
if (!login.ok) {
  console.error("Вхід не вдався:", session.msg || login.status);
  process.exit(2);
}
const A = { ...H, Authorization: "Bearer " + session.access_token };
const get = async (path) => (await fetch(URL_ + "/rest/v1/" + path, { headers: A })).json();
const del = async (path) => fetch(URL_ + "/rest/v1/" + path, { method: "DELETE", headers: A });
const marker = "/storage/v1/object/public/photos/";
const storagePath = (src) => (String(src).includes(marker) ? decodeURIComponent(String(src).split(marker)[1]) : null);

const found = {
  masters: await get("masters?select=id,name,photo&or=(id.like.e2e*,name.like.E2E*)"),
  gallery: await get("gallery?select=id,alt,src&alt=like.E2E*"),
  reviews: await get("reviews?select=id,author&author=like.E2E*"),
  bookings: await get("bookings?select=id,code,client_name&client_name=like.E2E*"),
  giveaway_entries: await get("giveaway_entries?select=id,name&name=like.E2E*"),
};
let total = 0;
for (const [t, rows] of Object.entries(found)) {
  if (!Array.isArray(rows)) { console.log(t, "помилка:", JSON.stringify(rows)); continue; }
  total += rows.length;
  console.log(t + ":", rows.length, rows.map((r) => r.name || r.alt || r.author || r.code || r.id).join(" | "));
}
if (DEL && total) {
  const files = [...found.masters.map((m) => m.photo), ...found.gallery.map((g) => g.src)].map(storagePath).filter(Boolean);
  for (const [t, rows] of Object.entries(found)) {
    for (const r of rows) await del(t + "?id=eq." + encodeURIComponent(r.id));
  }
  if (files.length) {
    await fetch(URL_ + "/storage/v1/object/photos", { method: "DELETE", headers: A, body: JSON.stringify({ prefixes: files }) });
  }
  console.log("видалено рядків:", total, "файлів:", files.length);
}
// а ще: чи не лишилися змінені тестом значення
const svc = await get("services?select=id,price&order=sort.asc&limit=1");
const set = await get("settings?select=id,data");
const info = (set.find((s) => s.id === "info") || {}).data || {};
const gw = (set.find((s) => s.id === "giveaway") || {}).data || {};
console.log("перша послуга:", JSON.stringify(svc[0]), "| телефон:", info.phone, "| клієнтів:", info.stats && info.stats.clients, "| приз:", gw.prize, "| переможець:", JSON.stringify(gw.winner || null));
await fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: A });
