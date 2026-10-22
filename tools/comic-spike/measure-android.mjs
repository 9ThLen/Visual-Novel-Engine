/**
 * Measures the comic spike in a built Android app over adb.
 *
 *   node tools/comic-spike/measure-android.mjs --package <application id> --scheme <url scheme>
 *     [--renderer html|native] [--runs 3] [--query "pages=24"] [--fling] [--out results.json]
 *     [--adb <path to adb>] [--clear-first]
 *
 * Each run force-stops the app, opens <scheme>://comic-spike?autorun=1 and reads
 * the screen's `[comic-spike]` lines from logcat (a release build still sends
 * console.log there, tagged ReactNativeJS). Around them it reads what only the
 * system can see:
 *  - memory: `dumpsys meminfo` PSS of the app process and of the WebView's
 *    sandboxed renderer process, after the first page and after the scroll;
 *  - smoothness: `dumpsys gfxinfo` frame statistics for the scroll, which
 *    include WebView frames — WebView draws through the app's RenderThread;
 *  - with --fling, a second pass that flings the strip with real touch swipes
 *    instead of the in-page scroller.
 * --clear-first runs `pm clear` before the first run, so it also pays for the
 * one-time copy of bundled art into the cache directory.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const adbPath = arg('adb', process.env.ADB || 'adb');
const pkg = arg('package', '');
const scheme = arg('scheme', '');
const renderer = arg('renderer', 'html');
const runs = Number(arg('runs', '3'));
const query = arg('query', 'pages=24');
const outFile = arg('out', '');
if (!pkg || !scheme) {
  console.error('usage: measure-android.mjs --package <id> --scheme <scheme> [...]');
  process.exit(1);
}

const adb = (...args) => execFileSync(adbPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const shell = (...args) => adb('shell', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidsOf(pattern) {
  return shell('ps', '-A', '-o', 'PID,NAME').split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([pid, name]) => /^\d+$/.test(pid) && name && pattern.test(name))
    .map(([pid, name]) => ({ pid, name }));
}

/** TOTAL PSS and the App Summary's Graphics line of one process, in MB. */
function meminfoOf(target) {
  const text = shell('dumpsys', 'meminfo', target);
  const kb = (re) => {
    const match = re.exec(text);
    return match ? Math.round(Number(match[1]) / 1024) : null;
  };
  return {
    pss: kb(/TOTAL PSS:\s+(\d+)/) ?? kb(/TOTAL\s+(\d+)/),
    graphics: kb(/Graphics:\s+(\d+)/),
    nativeHeap: kb(/Native Heap:\s+(\d+)/),
    javaHeap: kb(/Java Heap:\s+(\d+)/),
  };
}

function memory() {
  const app = meminfoOf(pkg);
  const renderers = pidsOf(/sandboxed_process/).map(({ pid }) => meminfoOf(pid));
  const webviewPss = renderers.reduce((sum, entry) => sum + (entry.pss ?? 0), 0);
  return { app, webviewRendererPss: renderers.length ? webviewPss : null, totalPss: (app.pss ?? 0) + webviewPss };
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
    p95: num(/95th percentile:\s+(\d+)ms/),
    p99: num(/99th percentile:\s+(\d+)ms/),
    slowUiThread: num(/Number Slow UI thread:\s+(\d+)/),
    slowDraw: num(/Number Slow issue draw commands:\s+(\d+)/),
  };
}

function startLogcat() {
  adb('logcat', '-c');
  const child = spawn(adbPath, ['logcat', '-v', 'raw', '-s', 'ReactNativeJS:I']);
  const events = [];
  const waiters = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const at = line.indexOf('[comic-spike] ');
      if (at < 0) continue;
      try {
        const event = JSON.parse(line.slice(at + '[comic-spike] '.length));
        events.push(event);
        for (const waiter of [...waiters]) {
          if (waiter.name === event.event) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(event);
          }
        }
      } catch {
        // A line cut by logcat's length limit; the next event still arrives.
      }
    }
  });
  const waitFor = (name, timeout = 180_000) => {
    const seen = events.find((event) => event.event === name && !event.__taken);
    if (seen) {
      seen.__taken = true;
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${name}`)), timeout);
      waiters.push({ name, resolve: (event) => { clearTimeout(timer); event.__taken = true; resolve(event); } });
    });
  };
  return { events, waitFor, stop: () => child.kill() };
}

function launch(params) {
  const url = `${scheme}://comic-spike?${params}`;
  const output = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, pkg);
  const total = /TotalTime:\s+(\d+)/.exec(output);
  return total ? Number(total[1]) : null;
}

async function measureRun(index) {
  shell('am', 'force-stop', pkg);
  if (index === 0 && flag('clear-first')) shell('pm', 'clear', pkg);
  await sleep(1000);
  const log = startLogcat();
  try {
    const launchMs = launch(`renderer=${renderer}&${query}&autorun=1&delay=9000`);
    const assets = await log.waitFor('assets');
    const firstPage = await log.waitFor('firstPage');
    await sleep(500);
    const memoryAfterFirstPage = memory();
    shell('dumpsys', 'gfxinfo', pkg, 'reset');
    await log.waitFor('scrollStart', 30_000);
    const scroll = await log.waitFor('scroll');
    const frames = gfxinfo();
    const memoryAfterScroll = memory();
    await log.waitFor('done');
    const scales = log.events.filter((event) => event.event === 'stats').map((event) => ({
      textScale: event.stats.textScale,
      overflowBubbles: event.stats.overflowBubbles,
      liveBubbles: event.stats.liveBubbles,
    }));
    const errors = log.events.filter((event) => event.event === 'error');
    return { index, launchMs, assets, firstPage, scroll, gfx: frames, memoryAfterFirstPage, memoryAfterScroll, scales, errors };
  } finally {
    log.stop();
  }
}

/** Real touch: ten upward flings over the strip, frame statistics from the system. */
async function flingRun() {
  shell('am', 'force-stop', pkg);
  await sleep(1000);
  const log = startLogcat();
  try {
    launch(`renderer=${renderer}&${query}`);
    await log.waitFor('firstPage');
    await sleep(2000);
    const size = /(\d+)x(\d+)/.exec(shell('wm', 'size'));
    const width = Number(size?.[1] ?? 1080);
    const height = Number(size?.[2] ?? 2400);
    shell('dumpsys', 'gfxinfo', pkg, 'reset');
    for (let i = 0; i < 10; i += 1) {
      shell('input', 'swipe', String(width / 2), String(Math.round(height * 0.8)), String(width / 2), String(Math.round(height * 0.25)), '90');
      await sleep(700);
    }
    const frames = gfxinfo();
    const memoryAfterFling = memory();
    return { gfx: frames, memoryAfterFling };
  } finally {
    log.stop();
  }
}

const device = {
  model: shell('getprop', 'ro.product.model').trim(),
  android: shell('getprop', 'ro.build.version.release').trim(),
  webview: /\(com\.google\.android\.webview, ([\d.]+)\)/.exec(shell('dumpsys', 'webviewupdate'))?.[1] ?? null,
  fontScale: shell('settings', 'get', 'system', 'font_scale').trim(),
  size: shell('wm', 'size').trim(),
  density: shell('wm', 'density').trim(),
  airplane: shell('settings', 'get', 'global', 'airplane_mode_on').trim(),
};
console.log(JSON.stringify({ device }));

/** A run that never finishes is reported, with whatever the system says about it. */
function killsOfApp() {
  return adb('logcat', '-d', '-v', 'brief').split(/\r?\n/)
    .filter((line) => line.includes('lowmemorykiller') && line.includes(pkg))
    .map((line) => line.slice(0, 240));
}

const results = [];
for (let i = 0; i < runs; i += 1) {
  let result;
  try {
    result = await measureRun(i);
  } catch (error) {
    const failed = { index: i, failed: String(error.message ?? error), lowMemoryKills: killsOfApp() };
    results.push(failed);
    console.log(JSON.stringify(failed));
    continue;
  }
  results.push(result);
  const s = result.scroll.result;
  console.log(JSON.stringify({
    run: i,
    launchMs: result.launchMs,
    assetMs: result.assets.ms,
    firstPageMs: result.firstPage.totalMs,
    frame: result.firstPage.frame,
    font: result.firstPage.stats.font,
    blocked: result.firstPage.stats.networkRequests,
    scrollRaf: { ...s.frameMs, dropped: `${s.droppedFrames}/${s.frames}`, blank: s.blankFrames },
    gfx: result.gfx,
    memoryAfterFirstPage: result.memoryAfterFirstPage,
    memoryAfterScroll: result.memoryAfterScroll,
    scales: result.scales,
    errors: result.errors,
  }));
}
let fling = null;
if (flag('fling')) {
  fling = await flingRun();
  console.log(JSON.stringify({ fling }));
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ renderer, query, device, results, fling }, null, 2));
