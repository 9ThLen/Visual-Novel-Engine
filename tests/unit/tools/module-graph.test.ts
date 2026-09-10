// tools/lib/module-graph.mjs is plain ESM shared with the boundary checker.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { importChain, readImports, walkModuleGraph } from '../../../tools/lib/module-graph.mjs';

function write(root: string, file: string, source: string) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source, 'utf8');
  return target;
}

describe('the module graph walker', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'vne-graph-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * The regression that made the first player boundary check useless: a lazy
   * any-character run between `import` and `from` crossed the statement
   * boundary, so this file read as a single import of `b` and the side-effect
   * import vanished — which is exactly the shape an unwanted module arrives in.
   */
  it('sees a side-effect import that is followed by another import', () => {
    const file = write(root, 'entry.ts', "import '@/a';\nimport b from '@/b';\n");
    expect(readImports(file)).toEqual(['@/a', '@/b']);
  });

  it('reads multi-line, star, dynamic and require forms', () => {
    const file = write(
      root,
      'entry.ts',
      [
        "import {",
        "  one,",
        "  two,",
        "} from '@/multi';",
        "export * from '@/star';",
        "const lazy = () => import('@/dynamic');",
        "const legacy = require('@/legacy');",
      ].join('\n'),
    );
    expect(readImports(file).sort()).toEqual(['@/dynamic', '@/legacy', '@/multi', '@/star']);
  });

  // Type imports carry no code, so counting them would report the entire type
  // surface of the editor as present in a player bundle.
  it('ignores type-only imports and exports', () => {
    const file = write(
      root,
      'entry.ts',
      "import type { A } from '@/types';\nexport type { B } from '@/more-types';\nimport { c } from '@/real';\n",
    );
    expect(readImports(file)).toEqual(['@/real']);
  });

  it('resolves @/ against the project root, and directories to their index', () => {
    write(root, 'entry.ts', "import '@/lib/thing';\nimport './sibling';\n");
    write(root, 'lib/thing/index.ts', 'export const thing = 1;\n');
    write(root, 'sibling.tsx', 'export const sibling = 1;\n');

    const { modules, unresolved } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
    });

    expect(unresolved).toEqual([]);
    expect([...modules.keys()].sort()).toEqual(['entry.ts', 'lib/thing/index.ts', 'sibling.tsx']);
  });

  /**
   * `tsconfig.json` maps `@/*` to `["./src/*", "./*"]`, and the walker has to
   * mean the same thing by it. Most of the engine moved under `src/`, but
   * `@/app/...`, `@/assets/...` and `@/global.css` still answer from the root,
   * so a walker that knew only one of the two roots would either miss the
   * source tree or report half the app as unresolved — and an unresolved
   * specifier makes the boundary checks inconclusive rather than green.
   */
  it('resolves @/ under src/ as well as at the project root', () => {
    write(root, 'entry.ts', "import '@/lib/thing';\nimport '@/app/reader';\n");
    write(root, 'src/lib/thing.ts', 'export const thing = 1;\n');
    write(root, 'app/reader.tsx', 'export const reader = 1;\n');

    const { modules, unresolved } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
    });

    expect(unresolved).toEqual([]);
    expect([...modules.keys()].sort()).toEqual(['app/reader.tsx', 'entry.ts', 'src/lib/thing.ts']);
  });

  /** `./src/*` is listed first, so it wins — as it would in the bundler. */
  it('prefers src/ when the same specifier resolves under both roots', () => {
    write(root, 'entry.ts', "import '@/lib/thing';\n");
    write(root, 'src/lib/thing.ts', 'export const thing = 1;\n');
    write(root, 'lib/thing.ts', 'export const stale = 1;\n');

    const { modules } = walkModuleGraph({ projectRoot: root, entries: [path.join(root, 'entry.ts')] });

    expect([...modules.keys()].sort()).toEqual(['entry.ts', 'src/lib/thing.ts']);
  });

  /**
   * The Android staging walk asks for a platform order, and it has to survive
   * the trip through the alias: a `.android` variant under `src/` is what the
   * player build actually bundles.
   */
  it('applies the requested platform order to a src/ alias too', () => {
    write(root, 'entry.ts', "import '@/lib/helper';\n");
    write(root, 'src/lib/helper.android.ts', 'export const helper = 1;\n');
    write(root, 'src/lib/helper.web.ts', 'export const helper = 2;\n');

    const { modules } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
      platformPrefixes: ['.android', '.native', ''],
    });

    expect([...modules.keys()].sort()).toEqual(['entry.ts', 'src/lib/helper.android.ts']);
  });

  /** Neither root has it: still a reported hole, not a silent skip. */
  it('reports an @/ import that neither root resolves', () => {
    write(root, 'entry.ts', "import '@/lib/gone';\n");
    write(root, 'src/lib/other.ts', 'export const other = 1;\n');

    const { unresolved } = walkModuleGraph({ projectRoot: root, entries: [path.join(root, 'entry.ts')] });

    expect(unresolved).toEqual([{ from: 'entry.ts', specifier: '@/lib/gone' }]);
  });

  it('records bare specifiers as external packages instead of walking them', () => {
    write(root, 'entry.ts', "import 'react-native';\nimport '@scope/pkg/deep';\n");

    const { externals, unresolved } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
    });

    expect([...externals].sort()).toEqual(['@scope/pkg', 'react-native']);
    expect(unresolved).toEqual([]);
  });

  it('applies substitutions the way a bundler alias would', () => {
    write(root, 'entry.ts', "import '@/store';\n");
    write(root, 'store.ts', "import '@/authoring';\n");
    write(root, 'store.player.ts', "import '@/reading';\n");
    write(root, 'authoring.ts', 'export const a = 1;\n');
    write(root, 'reading.ts', 'export const r = 1;\n');

    const { modules } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
      substitutions: { 'store.ts': 'store.player.ts' },
    });

    expect(modules.has('store.player.ts')).toBe(true);
    expect(modules.has('store.ts')).toBe(false);
    expect(modules.has('authoring.ts')).toBe(false);
    expect(modules.has('reading.ts')).toBe(true);
  });

  it('resolves the platform order requested by an Android staging walk', () => {
    write(root, 'entry.ts', "import '@/target';\n");
    write(root, 'target.web.ts', 'export const target = "web";\n');
    write(root, 'target.android.ts', 'export const target = "android";\n');
    write(root, 'target.ts', 'export const target = "base";\n');

    const { modules } = walkModuleGraph({
      projectRoot: root,
      entries: [path.join(root, 'entry.ts')],
      platformPrefixes: ['.android', '.native', ''],
    });

    expect([...modules.keys()].sort()).toEqual(['entry.ts', 'target.android.ts']);
  });

  // A bare filename in a failure message is not actionable; the chain names the
  // screen that has to change.
  it('reports the chain from an entry to a module', () => {
    write(root, 'entry.ts', "import '@/a';\n");
    write(root, 'a.ts', "import '@/b';\n");
    write(root, 'b.ts', 'export const b = 1;\n');

    const { modules } = walkModuleGraph({ projectRoot: root, entries: [path.join(root, 'entry.ts')] });

    expect(importChain(modules, 'b.ts')).toEqual(['entry.ts', 'a.ts', 'b.ts']);
  });

  it('reports an unresolvable project import rather than skipping it', () => {
    write(root, 'entry.ts', "import '@/missing';\n");

    const { unresolved } = walkModuleGraph({ projectRoot: root, entries: [path.join(root, 'entry.ts')] });

    expect(unresolved).toEqual([{ from: 'entry.ts', specifier: '@/missing' }]);
  });
});
