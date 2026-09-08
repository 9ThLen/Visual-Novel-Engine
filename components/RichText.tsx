/**
 * components/RichText.tsx — Renders inline rich-text markup as nested <Text>.
 *
 * Parses a rich-text string (see lib/rich-text.ts) into styled spans and
 * renders each as a <Text> child, so it must be placed INSIDE a parent <Text>
 * that carries the base text style (font size, line height, default color).
 * Spans inherit that base style and only override fontWeight/fontStyle/color.
 *
 * When `visibleCount` is provided, only that many visible characters render —
 * used by the reader's typewriter to reveal characters without flashing markup.
 * When omitted, the full text renders (dialogue history, static text).
 */
import React, { useMemo } from 'react';
import { Text, type TextStyle } from 'react-native';
import { parseRichText, sliceRichText, type RichTextSpan } from '@/lib/rich-text';

function spanStyle(span: RichTextSpan): TextStyle {
  const decorations = [span.underline ? 'underline' : '', span.strikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  return {
    fontWeight: span.bold ? '700' : undefined,
    fontStyle: span.italic ? 'italic' : undefined,
    color: span.color,
    fontSize: span.fontSize,
    textDecorationLine: decorations ? decorations as TextStyle['textDecorationLine'] : undefined,
  };
}

export function RichText({
  text,
  visibleCount,
  reserveSpace = false,
}: {
  text: string;
  /** Visible-character limit; omit to render the full text. */
  visibleCount?: number;
  /** Keep unrevealed characters in layout so typing does not resize the panel. */
  reserveSpace?: boolean;
}) {
  const spans = useMemo(() => parseRichText(text), [text]);
  const visible = useMemo(
    () => (visibleCount == null ? spans : sliceRichText(spans, visibleCount)),
    [spans, visibleCount],
  );

  if (reserveSpace && visibleCount != null) {
    let remaining = Math.max(0, visibleCount);
    return <>{spans.map((span, index) => {
      const count = Math.min(remaining, span.text.length);
      remaining -= count;
      return <Text key={index} style={spanStyle(span)}>
        {span.text.slice(0, count)}
        {count < span.text.length && (
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            aria-hidden style={{ opacity: 0 }}>{span.text.slice(count)}</Text>
        )}
      </Text>;
    })}</>;
  }

  return (
    <>
      {visible.map((span, index) => (
        <Text key={index} style={spanStyle(span)}>
          {span.text}
        </Text>
      ))}
    </>
  );
}
