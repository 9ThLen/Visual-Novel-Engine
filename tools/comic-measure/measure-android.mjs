/**
 * Measures a long comic strip in a built Android player over adb
 * (docs/plans/COMIC-RENDERER-SPIKE.md, section 9).
 *
 *   node tools/comic-measure/measure-android.mjs --package <application id> --scheme <url scheme>
 *     [--story comic-measure] [--runs 3] [--taps 110] [--flings 20] [--out results.json] [--adb <path>]
 *
 * The release is the one tools/comic-measure/long-comic-story.ts makes: 24
 * comic scenes, 72 panels of the demo's full-size art. Each run force-stops
 * the player, opens the story's reader, and reads what only the system can
 * see, the way the spike did:
 *  - memory: `dumpsys meminfo` PSS of the app process and of WebView's
 *    sandboxed renderer, after the first page, after every panel has been
 *    opened (a tap each, as a reader opens them), and after the strip has been
 *    flung from top to bottom with real touch swipes;
 *  - peaks: the most anonymous memory (`RssAnon`) the app and the renderer
 *    held at any moment of the run, and the least memory the system had left
 *    (`MemAvailable`), sampled on the device five times a second. A picture
 *    costs its full size while it is decoded and drawn, and a 2 GB phone dies
 *    of the peaks; between them the renderer keeps tiles, not pictures, so a
 *    snapshot of PSS can miss the difference altogether;
 *  - smoothness: `dumpsys gfxinfo` over the flings — WebView draws through the
 *    app's RenderThread;
 *  - survival: whether the app process or the renderer was replaced during
 *    the run, and what the low-memory killer and ActivityManager logged.
 *
 * The reader opens a panel per tap and moves to the next scene by itself, so
 * `--taps` only has to be more than the strip's panels and scenes; the last
 * scene ends on a choice, which nothing here answers. The strip is about
 * 19,000 CSS pixels tall on a 1080-pixel phone, and twenty flings cross it.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

const adbPath = arg('adb', process.env.ADB || 'adb');
const pkg = arg('package', '');
const scheme = arg('scheme', '');
const storyId = arg('story', 'comic-measure');
const runs = Number(arg('runs', '3'));
const taps = Number(arg('taps', '110'));
const flings = Number(arg('flings', '20'));
const outFile = arg('out', '');
const label = arg('label', '');
if (!pkg || !scheme) {
  console.error('usage: measure-android.mjs --package <id> --scheme <scheme> [...]');
  process.exit(1);
}

/** adb, again after the emulator's transport drops for a moment, which it does under load. */
function adb(...args) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return execFileSync(adbPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      if (attempt >= 3 || !/offline|not found|closed/i.test(String(error.stderr ?? error.message))) throw error;
      execFileSync(adbPath, ['wait-for-device'], { timeout: 60_000 });
    }
  }
}
const shell = (...args) => adb('shell', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidsOf(pattern) {
  return shell('ps', '-A', '-o', 'PID,NAME').split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([pid, name]) => /^\d+$/.test(pid) && name && pattern.test(name))
    .map(([pid, name]) => ({ pid, name }));
}

/** TOTAL PSS and the App Summary's lines of one process, in MB. */
function meminfoOf(target) {
  const text = shell('dumpsys', 'meminfo', target);
  const mb = (re) => {
    const match = re.exec(text);
    return match ? Math.round(Number(match[1]) / 1024) : null;
  };
  return {
    pss: mb(/TOTAL PSS:\s+(\d+)/) ?? mb(/TOTAL\s+(\d+)/),
    graphics: mb(/Graphics:\s+(\d+)/),
    nativeHeap: mb(/Native Heap:\s+(\d+)/),
  };
}

function appPid() {
  return pidsOf(new RegExp(`^${pkg.replace(/\./g, '\\.')}$`))[0]?.pid ?? null;
}

/** WebView's renderer for this app: the sandboxed process started after the app. */
function rendererPids() {
  return pidsOf(/sandboxed_process/).map(({ pid }) => pid);
}

function memory() {
  const app = meminfoOf(pkg);
  const renderers = rendererPids().map((pid) => meminfoOf(pid));
  const renderer = renderers.reduce((sum, entry) => sum + (entry.pss ?? 0), 0);
  return {
    appPss: app.pss,
    appGraphics: app.graphics,
    appNative: app.nativeHeap,
    rendererPss: renderers.length ? renderer : null,
    renderers: renderers.length,
    totalPss: (app.pss ?? 0) + renderer,
  };
}

function gfxinfo() {
  const text = shell('dumpsys', 'gfxinfo', pkg);
  const num = (re) => {
    const match = re.exec(text);
    return match ? Number(match[1]) : null;
  };
  return {
    frames: num(/Total frames rendered:\s+(\d+)/),
    janky: num(/Janky frames:\s+(\d+)/),
    jankyPercent: num(/Janky frames:\s+\d+\s+\(([\d.]+)%\)/),
    p50: num(/50th percentile:\s+(\d+)ms/),
    p90: num(/90th percentile:\s+(\d+)ms/),
    p99: num(/99th percentile:\s+(\d+)ms/),
  };
}

/** What the system logged about this app's processes dying since the log was cleared. */
function deaths() {
  const log = adb('logcat', '-d', '-b', 'all', '-v', 'brief');
  return log.split(/\r?\n/).filter((line) =>
    (line.includes('lowmemorykiller') && (line.includes(pkg) || line.includes('sandboxed_process')))
    || (/am_proc_died|am_kill/.test(line) && (line.includes(pkg) || line.includes('sandboxed_process'))))
    .map((line) => line.slice(0, 220));
}

function screen() {
  const size = /(\d+)x(\d+)/.exec(shell('wm', 'size'));
  return { width: Number(size?.[1] ?? 1080), height: Number(size?.[2] ?? 2424) };
}

const RENDERER = 'com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0';

/**
 * Samples the app's and the renderer's anonymous memory and the system's
 * available memory on the device until stopped; `stop()` answers the extremes
 * in MB. A process started anew during the run (a renderer the system killed)
 * is sampled too, under the same role.
 */
function startPeakSampler() {
  const script = [
    'while true; do',
    `for p in $(pidof ${pkg}); do echo "app $(grep RssAnon /proc/$p/status)"; done;`,
    `for p in $(pidof ${RENDERER}); do echo "renderer $(grep RssAnon /proc/$p/status)"; done;`,
    'echo "system $(grep MemAvailable /proc/meminfo)";',
    'sleep 0.2; done',
  ].join(' ');
  const child = spawn(adbPath, ['shell', script]);
  const peaks = { app: 0, renderer: 0, system: Infinity };
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const match = /^(app|renderer|system) \S+:\s+(\d+) kB/.exec(line.trim());
      if (!match) continue;
      const kb = Number(match[2]);
      if (match[1] === 'system') peaks.system = Math.min(peaks.system, kb);
      else peaks[match[1]] = Math.max(peaks[match[1]], kb);
    }
  });
  return {
    stop() {
      child.kill();
      const mb = (kb) => (Number.isFinite(kb) && kb > 0 ? Math.round(kb / 1024) : null);
      return { appAnonPeak: mb(peaks.app), rendererAnonPeak: mb(peaks.renderer), systemAvailableLow: mb(peaks.system) };
    },
  };
}

async function fling(from, to) {
  const { width, height } = screen();
  shell('input', 'swipe', String(width / 2), String(Math.round(height * from)), String(width / 2), String(Math.round(height * to)), '90');
  await sleep(800);
}

async function measureRun(index) {
  shell('am', 'force-stop', pkg);
  // Every run starts with the background apps a 2 GB device keeps cached let
  // go, so one run is not measured against another's leftovers.
  shell('am', 'kill-all');
  await sleep(5000);
  adb('logcat', '-b', 'all', '-c');
  const sampler = startPeakSampler();
  const url = `${scheme}://reader?storyId=${storyId}`;
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, pkg);
  // The first page: the frame built, its document loaded, its pictures decoded.
  await sleep(12_000);
  const startApp = appPid();
  const startRenderers = rendererPids();
  const afterFirstPage = memory();

  // Open every panel, a tap each, as a reader does; the frame keeps the newest in view.
  const { width, height } = screen();
  for (let i = 0; i < taps; i += 1) {
    shell('input', 'tap', String(Math.round(width / 2)), String(Math.round(height * 0.45)));
    await sleep(450);
  }
  await sleep(3000);
  const afterReveal = memory();

  // Back to the top, then flung to the bottom: every picture leaves and comes back.
  for (let i = 0; i < flings; i += 1) await fling(0.25, 0.8);
  await sleep(1500);
  shell('dumpsys', 'gfxinfo', pkg, 'reset');
  for (let i = 0; i < flings; i += 1) await fling(0.8, 0.25);
  await sleep(1500);
  const gfx = gfxinfo();
  const afterScroll = memory();
  const peaks = sampler.stop();

  const endApp = appPid();
  const endRenderers = rendererPids();
  return {
    index,
    appSurvived: !!startApp && startApp === endApp,
    rendererSurvived: startRenderers.length > 0 && startRenderers.every((pid) => endRenderers.includes(pid)),
    afterFirstPage,
    afterReveal,
    afterScroll,
    peaks,
    gfx,
    deaths: deaths(),
  };
}

shell('svc', 'power', 'stayon', 'true');
const device = {
  model: shell('getprop', 'ro.product.model').trim(),
  android: shell('getprop', 'ro.build.version.release').trim(),
  webview: /\(com\.google\.android\.webview, ([\d.]+)\)/.exec(shell('dumpsys', 'webviewupdate'))?.[1] ?? null,
  memTotal: /MemTotal:\s+(\d+)/.exec(shell('cat', '/proc/meminfo'))?.[1] ?? null,
  size: shell('wm', 'size').trim(),
  density: shell('wm', 'density').trim(),
};
console.log(JSON.stringify({ label, device }));

const results = [];
for (let i = 0; i < runs; i += 1) {
  let result;
  try {
    result = await measureRun(i);
  } catch (error) {
    result = { index: i, failed: String(error.message ?? error), deaths: deaths() };
  }
  results.push(result);
  console.log(JSON.stringify(result));
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ label, device, results }, null, 2));
