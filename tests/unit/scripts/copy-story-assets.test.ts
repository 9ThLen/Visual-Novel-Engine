// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyStoryAssets } from '../../../scripts/lib/copy-story-assets.mjs';

describe('legacy story media packaging', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vne-story-assets-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets/guide.png'), 'sprite-bytes');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it('adds referenced media to an empty player shell with a runtime mapping', () => {
    expect(copyStoryAssets(root, join(root, 'out'), ['assets/guide.png'])).toEqual({
      'assets/guide.png': './assets/assets/guide.png',
    });
    expect(readFileSync(join(root, 'out/assets/assets/guide.png'), 'utf8')).toBe('sprite-bytes');
  });
  it('leaves missing media unresolved for strict validation', () => {
    expect(copyStoryAssets(root, join(root, 'out'), ['assets/missing.png'])).toEqual({});
  });
  it('rejects references escaping the media directory', () => {
    expect(() => copyStoryAssets(root, join(root, 'out'), ['assets/../private.txt'])).toThrow('outside assets/');
  });
});
