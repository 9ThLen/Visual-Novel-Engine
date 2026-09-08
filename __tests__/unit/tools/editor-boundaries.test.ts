// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEditorBoundaries } from '../../../tools/check-editor-boundaries.mjs';

describe('editor boundary check', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vne-boundaries-'));
    mkdirSync(join(root, 'app'));
    mkdirSync(join(root, 'components/editor'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.each([
    "import { Legacy } from '@/components/editor-legacy/Legacy';",
    "import {\n Legacy\n} from '@/components/editor-legacy/Legacy';",
    "export { Legacy } from '@/stores/use-editor-store';",
    "const legacy = require('@/components/editor-legacy/Legacy');",
    "const legacy = import('@/stores/use-editor-store');",
  ])('rejects a forbidden dependency: %s', (source) => {
    writeFileSync(join(root, 'app/editor.tsx'), source);
    expect(checkEditorBoundaries(root)).toHaveLength(1);
  });

  it('accepts the canonical editor and store', () => {
    writeFileSync(join(root, 'components/editor/Editor.tsx'),
      "import { Editor } from '@/components/vn-plate-editor';\nimport { useAppStore } from '@/stores/use-app-store';");
    expect(checkEditorBoundaries(root)).toEqual([]);
  });
});
