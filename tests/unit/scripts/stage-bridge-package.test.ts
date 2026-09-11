// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BRIDGE_SUBDIR,
  LAUNCHER_NAME,
  NODE_EXECUTABLE_NAME,
  REQUIRED_BRIDGE_FILES,
  assertBridgeDist,
  checksumFor,
  launcherScript,
  readmeText,
  stageBridgePackage,
  verifyStagedBridgePackage,
  zipExtractors,
} from '../../../scripts/lib/stage-bridge-package';

const PAIRING_MARKER = 'AI BRIDGE PAIRING';

/** A bundle shaped like the one `tools/ai-bridge/build.mjs` emits. */
function fakeBridgeDist(root: string): string {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'cli.mjs'), `#!/usr/bin/env node\nconsole.log('${PAIRING_MARKER}');\n`);
  writeFileSync(join(dist, 'system-prompt.md'), '# prompt\n');
  writeFileSync(join(dist, 'codex-response-schema.json'), '{}\n');
  return dist;
}

function fakeNode(root: string): string {
  const file = join(root, NODE_EXECUTABLE_NAME);
  writeFileSync(file, 'MZ fake runtime');
  return file;
}

describe('staging the bridge package', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(resolve(tmpdir(), 'vne-pkg-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function stage() {
    const outDir = join(root, 'out');
    return stageBridgePackage({
      bridgeDistDir: fakeBridgeDist(root),
      nodeExecutable: fakeNode(root),
      outDir,
      version: '1.2.3',
      nodeVersion: 'v24.21.0',
      repoRoot: root,
      cwd: root,
    });
  }

  it('writes a folder that carries its own runtime', () => {
    const staged = stage();
    expect(verifyStagedBridgePackage(staged.outDir)).toEqual([]);
    for (const name of [LAUNCHER_NAME, NODE_EXECUTABLE_NAME, 'README.txt']) {
      expect(statSync(join(staged.outDir, name)).size).toBeGreaterThan(0);
    }
    for (const name of REQUIRED_BRIDGE_FILES) {
      expect(statSync(join(staged.outDir, BRIDGE_SUBDIR, name)).size).toBeGreaterThan(0);
    }
  });

  it('refuses a bundle that was never built', () => {
    expect(() => assertBridgeDist(join(root, 'nope'))).toThrow(/pnpm ai-bridge:build/);
  });

  it.each(REQUIRED_BRIDGE_FILES)('refuses a bundle missing %s', name => {
    const dist = fakeBridgeDist(root);
    rmSync(join(dist, name));
    expect(() => assertBridgeDist(dist)).toThrow(/incomplete/);
  });

  it('refuses a truncated bundle rather than shipping it', () => {
    // A zero-byte cli.mjs still copies and still packages. Caught here, it costs
    // a rebuild; caught on the author's machine, it costs their first run.
    const dist = fakeBridgeDist(root);
    writeFileSync(join(dist, 'cli.mjs'), '');
    expect(() => assertBridgeDist(dist)).toThrow(/truncated/);
  });

  it('refuses a bundle that is not the bridge', () => {
    const dist = fakeBridgeDist(root);
    writeFileSync(join(dist, 'cli.mjs'), 'console.log("something else");\n');
    expect(() => assertBridgeDist(dist)).toThrow(/pairing block/);
  });

  it('refuses a missing or empty runtime', () => {
    const dist = fakeBridgeDist(root);
    const outDir = join(root, 'out');
    const base = { bridgeDistDir: dist, outDir, version: '1.2.3', nodeVersion: 'v1', repoRoot: root, cwd: root };
    expect(() => stageBridgePackage({ ...base, nodeExecutable: join(root, 'absent.exe') }))
      .toThrow(/Node runtime to ship is missing/);
    const empty = join(root, 'empty.exe');
    writeFileSync(empty, '');
    expect(() => stageBridgePackage({ ...base, nodeExecutable: empty }))
      .toThrow(/Node runtime to ship is empty/);
  });
});

describe('the launcher', () => {
  it('addresses everything from its own folder', () => {
    // Double-clicked, a .cmd inherits whatever directory Explorer felt like.
    // Relative paths make the package work from the Desktop and nowhere else.
    const script = launcherScript();
    expect(script).toContain(`"%~dp0${NODE_EXECUTABLE_NAME}"`);
    expect(script).toContain(`"%~dp0${BRIDGE_SUBDIR}\\cli.mjs"`);
    expect(script).not.toMatch(/^cd /m);
  });

  it('uses CRLF, which is what cmd parses a line at a time', () => {
    expect(/[^\r]\n/.test(launcherScript())).toBe(false);
  });

  it('keeps the window open when the bridge fails', () => {
    // Otherwise a failure reports itself to a window that has already closed.
    expect(launcherScript()).toContain('pause');
    expect(launcherScript()).toContain('if errorlevel 1');
  });

  it('passes arguments through, so --reset-token works by shortcut', () => {
    expect(launcherScript()).toContain('%*');
  });
});

describe('verification', () => {
  it('names a launcher that lost its CRLF or its own folder', () => {
    const outDir = mkdtempSync(resolve(tmpdir(), 'vne-verify-'));
    try {
      mkdirSync(join(outDir, BRIDGE_SUBDIR), { recursive: true });
      for (const name of REQUIRED_BRIDGE_FILES) writeFileSync(join(outDir, BRIDGE_SUBDIR, name), 'x');
      writeFileSync(join(outDir, NODE_EXECUTABLE_NAME), 'x');
      writeFileSync(join(outDir, 'README.txt'), 'x');
      writeFileSync(join(outDir, LAUNCHER_NAME), '@echo off\nnode.exe bridge\\cli.mjs\n');

      expect(verifyStagedBridgePackage(outDir)).toEqual([
        expect.stringContaining('CRLF'),
        expect.stringContaining('relative path'),
      ]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('names every missing piece', () => {
    const outDir = mkdtempSync(resolve(tmpdir(), 'vne-verify-'));
    try {
      expect(verifyStagedBridgePackage(outDir)).toHaveLength(3 + REQUIRED_BRIDGE_FILES.length);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe('the README the author opens', () => {
  it('tells them where the settings live and how to re-pair', () => {
    const text = readmeText('1.2.3', 'v24.21.0');
    expect(text).toContain('%LOCALAPPDATA%\\VisualNovelEngine\\Bridge');
    expect(text).toContain('--reset-token');
    expect(text).toContain('1.2.3');
    expect(text).toContain('v24.21.0');
    // The promise the whole package exists to keep.
    expect(text).toContain('Nothing needs to be installed');
  });
});

describe('the published checksum of the runtime we ship', () => {
  // SHASUMS256.txt is the only thing standing between an author and an
  // interpreter someone else supplied, so picking the wrong line out of it is
  // not a formatting bug.
  const shasums = [
    'aaaa1111  node-v24.21.0-linux-x64.tar.gz',
    'bbbb2222  node-v24.21.0-win-x64.zip',
    'cccc3333  node-v24.21.0-win-x64.7z',
    '',
  ].join('\n');

  it('takes the line for the exact file, not one that merely starts the same', () => {
    expect(checksumFor(shasums, 'node-v24.21.0-win-x64.zip')).toBe('bbbb2222');
    expect(checksumFor(shasums, 'node-v24.21.0-win-x64.7z')).toBe('cccc3333');
  });

  it('fails rather than shipping a runtime the release does not list', () => {
    expect(() => checksumFor(shasums, 'node-v99.0.0-win-x64.zip')).toThrow();
  });
});

describe('unpacking the downloaded runtime', () => {
  // This ran `unzip` unconditionally, which is not on a Windows PATH — so
  // building the Windows package on Windows failed on the build machine. The
  // author who runs the finished package needs none of this.
  it('tries the tool each platform actually has', () => {
    expect(zipExtractors('win32').map(e => e.command)).toEqual(['tar', 'powershell']);
    expect(zipExtractors('linux').map(e => e.command)).toEqual(['unzip', 'tar']);
    expect(zipExtractors('darwin').map(e => e.command)).toEqual(['unzip', 'tar']);
  });

  it('always offers a fallback, so one missing tool is not fatal', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      expect(zipExtractors(platform).length).toBeGreaterThan(1);
    }
  });

  it('passes the archive and destination to each of them', () => {
    for (const extractor of zipExtractors('win32')) {
      const args = extractor.args('C:\\tmp\\node.zip', 'C:\\tmp\\out').join(' ');
      expect(args).toContain('C:\\tmp\\node.zip');
      expect(args).toContain('C:\\tmp\\out');
    }
  });
});
