/**
 * lib/rich-text.ts — Lightweight inline rich-text markup for story text.
 *
 * Authors embed markup directly inside the existing plain-string fields
 * (`TextBlockData.content`, dialogue entry `text`). This keeps the canonical
 * model (SceneRecord + TimelineStep) and import/export untouched — old stories
 * with no markup parse to a single plain span and render identically.
 *
 * Supported markup:
 *   • `**bold**`
 *   • `*italic*`
 *   • `[color=#RRGGBB]...[/color]` (also accepts `#RGB`)
 *
 * Rules:
 *   • Nesting is supported (`**bold *italic* bold**`).
 *   • Unclosed tags are treated as literal text — the parser never throws.
 *   • Invalid color values keep the inner text but drop the color.
 *
 * Pure module — no React, no side effects — so it can be unit-tested directly
 * and memoized in the UI.
 */

export interface RichTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

interface ActiveStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

const BOLD_MARK = '**';
const COLOR_OPEN = '[color=';
const COLOR_CLOSE = '[/color]';

function isValidColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * Find the next single `*` (italic marker) at or after `start`, skipping over
 * `**` bold markers so a nested `*italic **bold** italic*` closes correctly.
 * Returns -1 when there is no matching italic marker.
 */
function findItalicClose(input: string, start: number): number {
  let i = start;
  while (i < input.length) {
    if (input.startsWith(BOLD_MARK, i)) {
      i += 2;
      continue;
    }
    if (input[i] === '*') return i;
    i++;
  }
  return -1;
}

function pushSpan(out: RichTextSpan[], text: string, style: ActiveStyle): void {
  if (!text) return;
  const span: RichTextSpan = { text };
  if (style.bold) span.bold = true;
  if (style.italic) span.italic = true;
  if (style.color) span.color = style.color;
  out.push(span);
}

function parseInto(input: string, style: ActiveStyle, out: RichTextSpan[]): void {
  let i = 0;
  let buffer = '';
  const flush = () => {
    pushSpan(out, buffer, style);
    buffer = '';
  };

  while (i < input.length) {
    // Bold: **...**
    if (input.startsWith(BOLD_MARK, i)) {
      const close = input.indexOf(BOLD_MARK, i + 2);
      if (close !== -1) {
        flush();
        parseInto(input.slice(i + 2, close), { ...style, bold: true }, out);
        i = close + 2;
        continue;
      }
      // Unclosed — treat the marker as literal text.
      buffer += BOLD_MARK;
      i += 2;
      continue;
    }

    // Italic: *...*
    if (input[i] === '*') {
      const close = findItalicClose(input, i + 1);
      if (close !== -1) {
        flush();
        parseInto(input.slice(i + 1, close), { ...style, italic: true }, out);
        i = close + 1;
        continue;
      }
      buffer += '*';
      i += 1;
      continue;
    }

    // Color: [color=#RRGGBB]...[/color]
    if (input.startsWith(COLOR_OPEN, i)) {
      const tagEnd = input.indexOf(']', i + COLOR_OPEN.length);
      if (tagEnd !== -1) {
        const closeIdx = input.indexOf(COLOR_CLOSE, tagEnd + 1);
        if (closeIdx !== -1) {
          const colorValue = input.slice(i + COLOR_OPEN.length, tagEnd);
          const inner = input.slice(tagEnd + 1, closeIdx);
          flush();
          const nextStyle = isValidColor(colorValue)
            ? { ...style, color: colorValue }
            : { ...style };
          parseInto(inner, nextStyle, out);
          i = closeIdx + COLOR_CLOSE.length;
          continue;
        }
      }
      // Malformed / unclosed — treat the '[' as literal text.
      buffer += input[i];
      i += 1;
      continue;
    }

    buffer += input[i];
    i += 1;
  }

  flush();
}

/**
 * Parse inline markup into a flat list of styled spans. Each span carries its
 * fully-resolved styling (bold/italic/color combined from any nesting).
 * A string with no markup yields a single plain span; empty input yields `[]`.
 */
export function parseRichText(input: string): RichTextSpan[] {
  const out: RichTextSpan[] = [];
  if (input) parseInto(input, {}, out);
  return out;
}

/**
 * Plain text with all markup removed (unclosed markers stay literal, matching
 * the parser). Use for word counts, previews, and history fallbacks.
 */
export function stripRichText(input: string): string {
  return parseRichText(input)
    .map((span) => span.text)
    .join('');
}

/** Visible character count — markup characters are not counted. */
export function richTextLength(input: string): number {
  return stripRichText(input).length;
}

/**
 * Truncate parsed spans to the first `visibleCount` visible characters,
 * preserving each span's styling. Used by the typewriter to reveal visible
 * characters only — markup is never flashed. A partially-revealed span keeps
 * its styling on the visible slice.
 */
export function sliceRichText(spans: RichTextSpan[], visibleCount: number): RichTextSpan[] {
  if (visibleCount <= 0) return [];
  const result: RichTextSpan[] = [];
  let remaining = visibleCount;
  for (const span of spans) {
    if (remaining <= 0) break;
    if (span.text.length <= remaining) {
      result.push(span);
      remaining -= span.text.length;
    } else {
      result.push({ ...span, text: span.text.slice(0, remaining) });
      remaining = 0;
    }
  }
  return result;
}
