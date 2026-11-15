/*
 * Запис промо-відео покадрово: Chrome (headless) → PNG → ffmpeg → MP4 (H.264, 30 fps).
 * Нічого ставити не треба: Node 22+, Google Chrome, ffmpeg, Python 3 (для serve.py).
 *
 *   node promo/record.mjs                       повне відео → promo/out/tattoo-house-promo.mp4
 *   node promo/record.mjs --stills 2,6.5,13     лише кадри-PNG на цих секундах → promo/out/stills/
 *   node promo/record.mjs --live                дані з Supabase замість стартових (seed)
 *   node promo/record.mjs --out ~/Desktop/reel.mp4 --port 8791
 *
 * Кожен кадр рендериться точно на свою секунду (promo.render(t)), тому навіть
 * якщо браузер думає над кадром пів секунди, у відео ривків не буде.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../tests/e2e/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port) || 8790;
const OUT_DIR = join(HERE, 'out');
const OUT = resolve(args.out || join(OUT_DIR, 'tattoo-house-promo.mp4'));
const STILLS = args.stills ? String(args.stills).split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0) : null;
if (STILLS && !STILLS.length) {
  console.error('--stills: вкажіть секунди через кому, наприклад --stills 2,6.5,13');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
  return o;
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
mkdirSync(OUT_DIR, { recursive: true });

/* ---------- локальний сервер (той самий serve.py, що й для сайту) ---------- */
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch (e) { /* уже зупинено */ } };
process.on('exit', stopServer);
const BASE = 'http://127.0.0.1:' + PORT + '/';
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE + 'promo/index.html')).ok) break; } catch (e) { /* ще стартує */ }
  if (i > 60) throw new Error('serve.py не запустився на порту ' + PORT + ' (порт зайнятий? спробуйте --port 8791)');
  await sleep(100);
}

/* ---------- браузер ---------- */
const b = await launch();
await b.viewport(1080, 1920, false);
if (!args.live) {
  // config.js з ключами Supabase віддаємо порожнім: сайт бере стартові дані з lib/seed-data.js
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/config.js*' }] });
  b.on('Fetch.requestPaused', (p) => {
    b.send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }],
      body: Buffer.from('/* promo: стартові дані */').toString('base64'),
    }).catch(() => {});
  });
}
console.log('Відкриваю промо (' + (args.live ? 'дані з Supabase' : 'стартові дані') + ')…');
await b.goto(BASE + 'promo/index.html?record', 300);
await b.eval('promo.ready.then(() => true)', 180000);

/* ---------- кадри ---------- */
const FPS = await b.eval('promo.fps');
const TOTAL = Math.round((await b.eval('promo.duration')) * FPS);
const wanted = STILLS ? new Set(STILLS.map((s) => Math.min(TOTAL - 1, Math.round(s * FPS)))) : null;
const last = wanted ? Math.max(...wanted) : TOTAL - 1;

let ff = null, ffDead = null, framesDir = null;
if (!STILLS && hasFfmpeg) {
  ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
    OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.stdin.on('error', () => { /* причину покаже ffDead нижче */ });
  ffDead = new Promise((_, rej) => ff.on('close', (code) => rej(new Error('ffmpeg несподівано завершився з кодом ' + code))));
  ffDead.catch(() => {});
} else if (!STILLS) {
  framesDir = join(OUT_DIR, 'frames');
  rmSync(framesDir, { recursive: true, force: true });   // старі кадри не мають потрапити в нову склейку
  mkdirSync(framesDir, { recursive: true });
}
// захист від зависання: якщо Chrome не відповідає, падаємо з помилкою
const withLimit = (p, what, ms = 60000) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ': Chrome не відповідає ' + ms / 1000 + ' с'); })]);
const stillsDir = join(OUT_DIR, 'stills');
if (STILLS) mkdirSync(stillsDir, { recursive: true });

const t0 = Date.now();
for (let f = 0; f <= last; f++) {
  await b.eval('void promo.render(' + (f / FPS) + ')');
  if (wanted && !wanted.has(f)) continue;
  const shot = await withLimit(b.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true }), 'скриншот кадру ' + f);
  const buf = Buffer.from(shot.data, 'base64');
  if (STILLS) {
    const file = join(stillsDir, 'still-' + (f / FPS).toFixed(2).replace('.', '_') + 's.png');
    writeFileSync(file, buf);
    console.log('кадр ' + (f / FPS).toFixed(2) + ' с → ' + file);
  } else if (ff) {
    if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), ffDead]);
  } else {
    writeFileSync(join(framesDir, 'frame_' + String(f).padStart(5, '0') + '.png'), buf);
  }
  if (!STILLS && (f % 60 === 0 || f === last)) {
    const done = f + 1, spent = (Date.now() - t0) / 1000;
    process.stdout.write('\rкадр ' + done + ' / ' + TOTAL + '  (' + Math.round(spent) + ' с, лишилось ~' + Math.round(spent / done * (TOTAL - done)) + ' с)   ');
  }
}
if (!STILLS) process.stdout.write('\n');

const errors = b.logs.filter((l) => !/google|maps|gstatic|favicon/i.test(l));
await b.close();
stopServer();

if (ff) {
  ff.stdin.end();
  const code = ff.exitCode ?? await new Promise((r) => ff.on('close', r));
  if (code !== 0) { console.error('ffmpeg завершився з кодом ' + code); process.exit(1); }
  console.log('Готово: ' + OUT);
} else if (framesDir) {
  console.log('ffmpeg не знайдено. Кадри лежать у ' + framesDir + '. Склеїти:');
  console.log('  ffmpeg -framerate ' + FPS + ' -i "' + framesDir + '/frame_%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 17 -movflags +faststart "' + OUT + '"');
}
if (errors.length) {
  console.log('Повідомлення консолі браузера:\n  ' + errors.join('\n  '));
}
