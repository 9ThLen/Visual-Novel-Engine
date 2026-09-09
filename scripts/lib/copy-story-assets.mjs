import fs from 'node:fs';
import path from 'node:path';

/**
 * Copy only this story's bundled media and publish the player's lookup map.
 * @param {string} repoRoot
 * @param {string} outPath
 * @param {string[]} references
 * @returns {Record<string, string>}
 */
export function copyStoryAssets(repoRoot, outPath, references) {
  const assetRoot = fs.realpathSync(path.join(repoRoot, 'assets'));
  /** @type {Record<string, string>} */
  const assets = {};
  for (const reference of references) {
    const source = path.resolve(repoRoot, reference);
    if (!source.startsWith(assetRoot + path.sep)) throw new Error(`Asset outside assets/: ${reference}`);
    if (!fs.existsSync(source)) continue;
    if (!fs.realpathSync(source).startsWith(assetRoot + path.sep)) throw new Error(`Asset outside assets/: ${reference}`);
    if (!fs.statSync(source).isFile()) continue;
    const relative = `assets/${path.relative(repoRoot, source).split(path.sep).join('/')}`;
    const target = path.join(outPath, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    assets[reference] = `./${relative}`;
  }
  return assets;
}
