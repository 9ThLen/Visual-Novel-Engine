import fs from 'node:fs';
import path from 'node:path';

/**
 * Replace a bundle's font files with `data:` URIs inside its own code.
 *
 * Fonts are CORS-restricted even when they sit in the same directory, and a
 * `file://` page has an opaque origin. Without this a double-clicked bundle
 * loads its story, its art and its sound, and then fails on the icon font
 * alone — leaving the reader's menu button an empty box.
 *
 * Only fonts. Images from the same directory load over `file://` perfectly well,
 * and inlining those would add a third to the bundle for nothing.
 *
 * Idempotent: once the references are rewritten the font files are gone, so a
 * second pass over the same directory finds nothing to do.
 */
const FONT_PATTERN = /\.(ttf|otf|woff2?)$/i;
const TEXT_PATTERN = /\.(js|css|html)$/i;

const MIME_BY_EXTENSION = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function listFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, base));
    else files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files;
}

/**
 * @param {string} bundleDir a built web bundle
 * @returns {{ inlined: string[], bytes: number }}
 */
export function inlineBundleFonts(bundleDir) {
  if (!fs.existsSync(bundleDir)) return { inlined: [], bytes: 0 };

  const names = listFiles(bundleDir);
  const fontNames = names.filter((name) => FONT_PATTERN.test(name));
  if (fontNames.length === 0) return { inlined: [], bytes: 0 };

  const textNames = names.filter((name) => TEXT_PATTERN.test(name));
  const inlined = [];
  let bytes = 0;

  for (const fontName of fontNames) {
    const fontPath = path.join(bundleDir, fontName);
    const extension = fontName.slice(fontName.lastIndexOf('.')).toLowerCase();
    const dataUri = `data:${MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'};base64,`
      + fs.readFileSync(fontPath).toString('base64');

    // The prefixed forms first. A bundle built for relative serving writes
    // `./assets/…ttf`, and replacing only the tail leaves `./data:font/ttf;…`,
    // which the loader dutifully resolves against the page and cannot find.
    const forms = [`./${fontName}`, `/${fontName}`, fontName];

    let rewritten = false;
    for (const textName of textNames) {
      const filePath = path.join(bundleDir, textName);
      let text = fs.readFileSync(filePath, 'utf8');
      if (!text.includes(fontName)) continue;
      for (const form of forms) text = text.split(form).join(dataUri);
      fs.writeFileSync(filePath, text);
      rewritten = true;
    }

    // Only drop a font whose references were all rewritten. One left behind
    // would be a 404 that shows up on someone else's machine.
    if (rewritten) {
      bytes += fs.statSync(fontPath).size;
      fs.rmSync(fontPath);
      inlined.push(fontName);
    }
  }

  return { inlined, bytes };
}
