import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

describe('standalone AI bridge package', () => {
  it('packs, installs and starts outside the repository', () => {
    const corepack = resolve(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js');
    const bridge = resolve(process.cwd(), 'tools/ai-bridge');
    const sandbox = mkdtempSync(resolve(tmpdir(), 'vne-ai-bridge-'));
    try {
      const packed = execFileSync(
        process.execPath,
        [corepack, 'pnpm', '--dir', bridge, 'pack', '--pack-destination', sandbox],
        { encoding: 'utf8' },
      ).trim().split(/\r?\n/).at(-1)!;
      const tarball = resolve(sandbox, packed);
      execFileSync('tar', ['-xf', tarball, '-C', sandbox]);
      const installed = resolve(sandbox, 'package');
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
      expect(startup.stderr).toContain('CODEX_HARDENING_UNSUPPORTED');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);
});
