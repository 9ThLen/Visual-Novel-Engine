/**
 * Measures the comic spike in a browser, offline: every file is served from
 * <root> on disk through Playwright's router under http://comic.test, and every
 * other request is aborted and listed. A page that needed the network shows up
 * as a blocked request, a missing image or a fallen-back font — never as a
 * quietly slower number.
 *
 *   node tools/comic-spike/measure-web.mjs --root <dir> [--mode harness|app]
 *     [--channel chromium|msedge] [--device phone|desktop] [--runs 3]
 *     [--query "pages=24&virtualize=1"] [--speed 2000] [--out results.json]
 *
 * harness: <root> is make-harness.mjs output; the script drives the frame.
 * app:     <root> is an `expo export` of the studio; it opens /comic-spike with
 *          autorun=1 and waits for the screen to finish on its own.
 *
 * Memory: the browser's renderer and GPU processes are sampled with
 * Get-Process (private bytes) once a second. A srcdoc frame shares its host's
 * renderer process, so the renderer figure covers host and frame together.
 */
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const root = path.resolve(arg('root', ''));
const mode = arg('mode', 'harness');
const channel = arg('channel', 'chromium');
const device = arg('device', 'phone');
const runs = Number(arg('runs', '3'));
const query = arg('query', 'pages=24&virtualize=1');
const speed = Number(arg('speed', '2000'));
const outFile = arg('out', '');
const shotDir = arg('shots', '');

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function processMemory(pids) {
  if (pids.length === 0) return Promise.resolve({});
  const script = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.PrivateMemorySize64)" }`;
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', script], { windowsHide: true }, (error, stdout) => {
      const result = {};
      for (const line of String(stdout || '').split(/\r?\n/)) {
        const [pid, bytes] = line.trim().split(' ');
        if (pid && bytes) result[pid] = Math.round(Number(bytes) / 1048576);
      }
      resolve(result);
    });
  });
}

async function waitForEvent(page, event, timeout = 120_000) {
  await page.waitForFunction(
    (name) => (window.__comicSpikeLog || []).some((entry) => entry && entry.event === name),
    event,
    { timeout, polling: 100 },
  );
  return page.evaluate((name) => window.__comicSpikeLog.filter((entry) => entry.event === name).at(-1), event);
}

async function oneRun(browser, runIndex) {
  const context = await browser.newContext(DEVICES[device]);
  const blocked = [];
  const served = { files: 0, bytes: 0 };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.host !== 'comic.test') {
      blocked.push(url.href);
      await route.abort('internetdisconnected');
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      await route.abort();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // An expo-router app answers every route with its index.html.
      file = mode === 'app' ? path.join(root, 'index.html') : file;
    }
    if (!fs.existsSync(file)) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const body = fs.readFileSync(file);
    served.files += 1;
    served.bytes += body.byteLength;
    await route.fulfill({ status: 200, body, contentType: TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 300)));

  const cdpBrowser = await browser.newBrowserCDPSession();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  const url = mode === 'app'
    ? `http://comic.test/comic-spike?${query}&autorun=1&speed=${speed}`
    : `http://comic.test/index.html?${query}`;
  await page.goto(url, { waitUntil: 'commit' });
  const firstPage = await waitForEvent(page, 'firstPage');

  const { processInfo } = await cdpBrowser.send('SystemInfo.getProcessInfo');
  const pids = processInfo.filter((info) => info.type === 'renderer' || info.type === 'GPU').map((info) => info.id);
  const typeOf = Object.fromEntries(processInfo.map((info) => [String(info.id), info.type]));
  const sum = (sample, type) => Object.entries(sample).filter(([pid]) => typeOf[pid] === type).reduce((acc, [, mb]) => acc + mb, 0);
  const memoryAfterFirstPage = await processMemory(pids);

  if (shotDir && runIndex === 0) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${mode}-${channel}-${device}-first.png`) });
  }

  let peakRenderer = sum(memoryAfterFirstPage, 'renderer');
  let peakGpu = sum(memoryAfterFirstPage, 'GPU');
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const sample = await processMemory(pids);
      peakRenderer = Math.max(peakRenderer, sum(sample, 'renderer'));
      peakGpu = Math.max(peakGpu, sum(sample, 'GPU'));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  })();

  let scroll;
  const scales = [];
  if (mode === 'app') {
    scroll = await waitForEvent(page, 'scroll', 300_000);
    await waitForEvent(page, 'done', 120_000);
    const stats = await page.evaluate(() => window.__comicSpikeLog.filter((entry) => entry.event === 'stats'));
    for (const entry of stats) scales.push(entry.stats);
  } else {
    await page.waitForTimeout(1000);
    await page.evaluate((pxPerSecond) => window.__comicSpike.send({ type: 'scrollTest', pxPerSecond }), speed);
    scroll = await waitForEvent(page, 'scrollResult', 300_000);
    for (const scale of [1.3, 2]) {
      const before = await page.evaluate(() => window.__comicSpikeLog.length);
      await page.evaluate((value) => window.__comicSpike.send({ type: 'textScale', scale: value }), scale);
      await page.waitForFunction((count) => window.__comicSpikeLog.slice(count).some((entry) => entry.event === 'stats'), before);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__comicSpike.send({ type: 'stats' }));
      await page.waitForFunction((count) => window.__comicSpikeLog.slice(count).filter((entry) => entry.event === 'stats').length >= 2, before);
      scales.push(await page.evaluate(() => window.__comicSpikeLog.filter((entry) => entry.event === 'stats').at(-1).stats));
    }
  }
  sampling = false;
  await sampler;
  const memoryAfterScroll = await processMemory(pids);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((entry) => entry.name === name)?.value;

  if (shotDir && runIndex === 0) {
    await page.screenshot({ path: path.join(shotDir, `${mode}-${channel}-${device}-scale2.png`) });
  }

  await context.close();
  return {
    run: runIndex,
    firstPage,
    scroll,
    scales: scales.map((stats) => ({ textScale: stats.textScale, overflowBubbles: stats.overflowBubbles, liveBubbles: stats.liveBubbles, livePages: stats.livePages })),
    memoryMb: {
      rendererAfterFirstPage: sum(memoryAfterFirstPage, 'renderer'),
      gpuAfterFirstPage: sum(memoryAfterFirstPage, 'GPU'),
      rendererPeak: peakRenderer,
      gpuPeak: peakGpu,
      rendererAfterScroll: sum(memoryAfterScroll, 'renderer'),
      gpuAfterScroll: sum(memoryAfterScroll, 'GPU'),
      jsHeapUsed: Math.round((metric('JSHeapUsedSize') ?? 0) / 1048576),
    },
    blocked,
    served,
    consoleErrors: consoleErrors.slice(0, 20),
  };
}

const browser = await chromium.launch(channel === 'msedge' ? { channel: 'msedge' } : {});
const version = browser.version();
const results = [];
for (let i = 0; i < runs; i += 1) {
  const result = await oneRun(browser, i);
  results.push(result);
  const fp = result.firstPage;
  const sc = result.scroll.result ?? result.scroll;
  console.log(JSON.stringify({
    run: i,
    firstPageMs: fp.totalMs,
    scrollFrameMs: sc.frameMs,
    dropped: `${sc.droppedFrames}/${sc.frames}`,
    blank: sc.blankFrames,
    memoryMb: result.memoryMb,
    scales: result.scales,
    blocked: result.blocked.length,
    errors: result.consoleErrors.length,
  }));
}
await browser.close();
const summary = { mode, channel, browserVersion: version, device, query, speed, results };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
