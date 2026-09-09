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
