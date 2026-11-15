/*
 * Мінімальний клієнт Chrome DevTools Protocol без бібліотек.
 * Запускає headless Chrome, відкриває сторінки, виконує JS, робить скриншоти.
 * Потрібні лише Node 22+ (вбудований WebSocket) і встановлений Google Chrome.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "th-chrome-"));
  // порт 0: Chrome сам бере вільний і пише його у файл профілю.
  // Так ми точно підключаємося до СВОГО браузера, а не до чужого на тому ж порту.
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--force-device-scale-factor=1",
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
  ], { stdio: "ignore" });
  // тест упав посередині: не залишаємо браузер висіти у фоні
  const killOnExit = () => {
    try { proc.kill("SIGKILL"); } catch (e) { /* уже закрито */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* не страшно */ }
  };
  process.on("exit", killOnExit);

  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try {
      port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]) || undefined;
    } catch (e) { /* ще стартує */ }
    if (!port) await sleep(100);
  }
  if (!port) throw new Error("Chrome не запустився");

  let targets;
  for (let i = 0; i < 50; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch (e) { /* ще стартує */ }
    await sleep(100);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  const listeners = [];
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      if (msg.method === "Runtime.exceptionThrown") logs.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      // помилки мережі ("Failed to load resource: net::ERR_...") приходять сюди
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        logs.push("LOG: " + msg.params.entry.text + (msg.params.entry.url ? " " + msg.params.entry.url : ""));
      }
      if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
        logs.push(msg.params.type.toUpperCase() + ": " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
      [...listeners].forEach((l) => l(msg)); // копія: обробник може видалити себе зі списку
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const waitEvent = (name, timeout = 15000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout " + name)), timeout);
    const l = (msg) => {
      if (msg.method === name) {
        clearTimeout(t);
        listeners.splice(listeners.indexOf(l), 1);
        res(msg.params);
      }
    };
    listeners.push(l);
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  const api = {
    send,
    logs,
    async viewport(width, height, mobile = width < 600) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    },
    async reducedMotion(on = true) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
    },
    async goto(url, settle = 600) {
      // якщо відрізняється лише #хеш, браузер не перезавантажить сторінку: йдемо через порожню
      const here = await api.eval("location.href").catch(() => "");
      if (here && here.split("#")[0] === url.split("#")[0] && url !== "about:blank") {
        const blank = waitEvent("Page.loadEventFired");
        await send("Page.navigate", { url: "about:blank" });
        await blank;
      }
      const loaded = waitEvent("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
      await api.eval("document.fonts ? document.fonts.ready.then(() => 1) : 1");
      await sleep(settle);
      // дані з бази малюються після load: нові символи (напр. ₴) можуть довантажити ще шматок шрифту
      await api.eval("document.fonts ? document.fonts.ready.then(() => 1) : 1");
      await sleep(150);
    },
    // Виконати вираз у сторінці (з await), повернути значення
    async eval(expression, timeout = 20000) {
      let timer;
      const limit = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("eval завис довше за " + timeout / 1000 + " с: " + expression.slice(0, 120))), timeout);
      });
      const r = await Promise.race([send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }), limit]).finally(() => clearTimeout(timer));
      if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expression, timeout = 8000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (await api.eval(expression).catch(() => false)) return true;
        await sleep(100);
      }
      const state = await api.eval(`JSON.stringify({ url: location.href, title: document.title,
        h1: (document.querySelector("h1") || {}).textContent })`).catch((e) => e.message);
      throw new Error("waitFor timeout: " + expression + "\nстан: " + state + "\nконсоль: " + logs.join(" | "));
    },
    async screenshot(path, fullPage = true) {
      let clip;
      if (fullPage) {
        const m = await send("Page.getLayoutMetrics");
        clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
      }
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, clip });
      writeFileSync(path, Buffer.from(r.data, "base64"));
    },
    async close() {
      try { await send("Browser.close"); } catch (e) { /* вже закрито */ }
      ws.close();
      await sleep(200);
      killOnExit();
      process.off("exit", killOnExit);
    },
  };
  return api;
}
