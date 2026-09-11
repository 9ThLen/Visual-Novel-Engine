import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('production web hardening', () => {
  it('injects one current CSP and the same hardened SPA fallback', async () => {
    const output = mkdtempSync(join(tmpdir(), 'vne-web-hardening-'));
    try {
      writeFileSync(join(output, 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
      const { hardenWebOutput, WEB_CSP } = await import('../../../scripts/lib/harden-web-output.mjs');

      hardenWebOutput(output);
      hardenWebOutput(output);

      const index = readFileSync(join(output, 'index.html'), 'utf8');
      expect(index.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
      expect(index).toContain(`content="${WEB_CSP}"`);
      expect(index).toContain('if(window.top!==window.self)');
      expect(readFileSync(join(output, '404.html'), 'utf8')).toBe(index);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});

describe('the desktop studio CSP', () => {
  it('adds Tauri IPC to connect-src and leaves the rest alone', async () => {
    const { WEB_CSP, desktopStudioCsp, TAURI_IPC_ORIGINS } = await import('../../../scripts/lib/harden-web-output.mjs');
    const relaxed = desktopStudioCsp();
    for (const origin of TAURI_IPC_ORIGINS) {
      expect(/connect-src [^;]*;/.exec(relaxed)![0]).toContain(origin);
    }
    // Every other directive is untouched.
    for (const directive of WEB_CSP.split(';').map(part => part.trim()).filter(Boolean)) {
      if (directive.startsWith('connect-src')) continue;
      expect(relaxed).toContain(directive);
    }
  });

  it('never leaks into the policy the web channel and the player ship', async () => {
    // The player is a stranger's download with a story inlined. It has no Tauri
    // and no reason to carry an origin belonging to one.
    const { WEB_CSP, TAURI_IPC_ORIGINS } = await import('../../../scripts/lib/harden-web-output.mjs');
    for (const origin of TAURI_IPC_ORIGINS) expect(WEB_CSP).not.toContain(origin);
  });

  it('is idempotent, so re-staging cannot accumulate copies', async () => {
    const { desktopStudioCsp } = await import('../../../scripts/lib/harden-web-output.mjs');
    const once = desktopStudioCsp();
    expect(desktopStudioCsp(once)).toBe(once);
  });

  it('refuses a policy with no connect-src rather than silently doing nothing', async () => {
    const { desktopStudioCsp } = await import('../../../scripts/lib/harden-web-output.mjs');
    expect(() => desktopStudioCsp("default-src 'self';")).toThrow(/connect-src/);
  });

  it('rewrites the hardened tag in place, and refuses a page with none', async () => {
    const { hardenWebOutput, relaxCspForDesktopStudio, TAURI_IPC_ORIGINS } =
      await import('../../../scripts/lib/harden-web-output.mjs');
    const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const output = mkdtempSync(join(tmpdir(), 'vne-csp-'));
    try {
      writeFileSync(join(output, 'index.html'), '<html><head></head><body></body></html>');
      hardenWebOutput(output);
      relaxCspForDesktopStudio(join(output, 'index.html'));
      const html = readFileSync(join(output, 'index.html'), 'utf8');
      for (const origin of TAURI_IPC_ORIGINS) expect(html).toContain(origin);

      writeFileSync(join(output, 'bare.html'), '<html><head></head></html>');
      expect(() => relaxCspForDesktopStudio(join(output, 'bare.html'))).toThrow(/No hardened CSP/);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
