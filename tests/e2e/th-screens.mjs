/*
 * Скриншоти сторінок + помилки консолі.
 *   python3 serve.py 8765 &
 *   node tests/e2e/th-screens.mjs <папка> [шлях1 шлях2 ...]
 * За замовчуванням: 4 сторінки сайту + адмінка, ширини 360 / 768 / 1440.
 * Виходить з кодом 1, якщо в консолі були помилки (крім очікуваного 404 config.js).
 */
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const [out = "tmp/screens", ...paths] = process.argv.slice(2);
const PAGES = paths.length ? paths : ["index.html", "gallery.html", "masters.html", "booking.html", "admin/"];
const WIDTHS = (process.env.WIDTHS || "360,768,1440").split(",").map(Number);

mkdirSync(out, { recursive: true });
const b = await launch();
await b.reducedMotion(true);
let bad = 0;
for (const p of PAGES) {
  for (const w of WIDTHS) {
    await b.viewport(w, w < 600 ? 780 : 900);
    b.logs.length = 0;
    await b.goto(BASE + p, 900);
    const overflow = await b.eval("document.documentElement.scrollWidth - window.innerWidth");
    const name = (p.replace(/[/.]+/g, "_").replace(/_$/, "") || "root") + "-" + w + ".png";
    await b.screenshot(out + "/" + name);
    const errors = b.logs.filter((l) => !/config\.js|^WARNING: Supabase не налаштовано/.test(l));
    if (errors.length || overflow > 0) bad++;
    console.log((errors.length || overflow > 0 ? "FAIL " : "ok   ") + name + (overflow > 0 ? " overflow-x=" + overflow + "px" : "") + (errors.length ? "\n      " + errors.join("\n      ") : ""));
  }
}
await b.close();
process.exit(bad ? 1 : 0);
