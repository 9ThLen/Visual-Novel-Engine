import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

describe('standalone AI bridge package', () => {
  it('packs, installs and starts outside the repository', () => {
    const corepack = resolve(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js');
    const bridge = resolve(process.cwd(), 'tools/ai-bridge');
    const sandbox = mkdtempSync(resolve(process.cwd(), '.tmp-vne-ai-bridge-'));
    try {
      const packed = execFileSync(
        process.execPath,
        [corepack, 'pnpm', '--dir', bridge, 'pack', '--pack-destination', sandbox],
        { encoding: 'utf8' },
      ).trim().split(/\r?\n/).at(-1)!;
      const tarball = resolve(sandbox, packed);
      writeFileSync(resolve(sandbox, 'package.json'), '{"private":true}');
      const install = spawnSync(
        process.execPath,
        [corepack, 'pnpm', '--dir', sandbox, '--ignore-workspace', 'add', '--offline', '--ignore-scripts', tarball],
        { encoding: 'utf8', env: { ...process.env, TEMP: sandbox, TMP: sandbox } },
      );
      expect(install.status, install.stderr || install.stdout).toBe(0);
      const installed = resolve(sandbox, 'node_modules/@visual-novel-engine/ai-bridge');
      expect(existsSync(resolve(installed, 'dist/system-prompt.md'))).toBe(true);
      expect(existsSync(resolve(installed, 'dist/codex-response-schema.json'))).toBe(true);
      expect(readFileSync(resolve(installed, 'dist/cli.mjs'), 'utf8')).toContain('#!/usr/bin/env node');
      expect(execFileSync(process.execPath, [resolve(installed, 'dist/cli.mjs'), '--version'], { cwd: sandbox, encoding: 'utf8' }).trim()).toBe('0.1.0');
      expect(execFileSync(process.execPath, [resolve(installed, 'dist/cli.mjs'), '--help'], { cwd: sandbox, encoding: 'utf8' })).toContain('Usage: vne-ai-bridge');
      const startup = spawnSync(
        process.execPath,
        [resolve(installed, 'dist/cli.mjs'), '--provider', 'codex'],
        { cwd: sandbox, encoding: 'utf8' },
      );
      expect(startup.status).toBe(1);
      expect(startup.stderr).toContain('Codex CLI Beta requires --enable-codex-beta');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);
});
