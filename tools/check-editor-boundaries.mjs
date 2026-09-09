import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImports } from './lib/module-graph.mjs';

export function checkEditorBoundaries(repoRoot) {
  const violations = [];
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const specifier of readImports(file)) {
          if (/(?:components\/editor-legacy|stores\/use-editor-store|SceneComposer|TimelinePanel|BlockLibraryPanel|PropertiesPanel)(?:\/|\.|$)/.test(specifier)) {
            violations.push(`${relative(repoRoot, file)}: ${specifier}`);
          }
        }
      }
    }
  }
  for (const directory of ['app', 'components/editor']) scan(resolve(repoRoot, directory));
  return violations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkEditorBoundaries(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(violations.length ? `FAIL: editor boundary violations\n${violations.join('\n')}` : 'Editor boundary check passed.');
  process.exitCode = violations.length ? 1 : 0;
}
