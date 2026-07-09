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
  return {
    fontWeight: span.bold ? '700' : undefined,
    fontStyle: span.italic ? 'italic' : undefined,
    color: span.color,
  };
}

export function RichText({
  text,
  visibleCount,
}: {
  text: string;
  /** Visible-character limit; omit to render the full text. */
  visibleCount?: number;
}) {
  const spans = useMemo(() => parseRichText(text), [text]);
  const visible = useMemo(
    () => (visibleCount == null ? spans : sliceRichText(spans, visibleCount)),
    [spans, visibleCount],
  );

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
