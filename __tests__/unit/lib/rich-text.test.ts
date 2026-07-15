import {
  parseRichText,
  stripRichText,
  richTextLength,
  sliceRichText,
  richTextAlignment,
  withRichTextAlignment,
} from '@/lib/rich-text';

describe('parseRichText', () => {
  it('returns a single plain span for text with no markup', () => {
    expect(parseRichText('hello world')).toEqual([{ text: 'hello world' }]);
  });

  it('returns no spans for an empty string', () => {
    expect(parseRichText('')).toEqual([]);
  });

  it('parses bold', () => {
    expect(parseRichText('a **b** c')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c' },
    ]);
  });

  it('parses italic', () => {
    expect(parseRichText('a *b* c')).toEqual([
      { text: 'a ' },
      { text: 'b', italic: true },
      { text: ' c' },
    ]);
  });

  it('parses combined bold and italic', () => {
    expect(parseRichText('***both***')).toEqual([{ text: 'both', bold: true, italic: true }]);
  });

  it('parses underline and strikethrough', () => {
    expect(parseRichText('[u]under[/u] [s]gone[/s]')).toEqual([
      { text: 'under', underline: true },
      { text: ' ' },
      { text: 'gone', strikethrough: true },
    ]);
  });

  it('supports nested underline and bold', () => {
    expect(parseRichText('[u]under **bold**[/u]')).toEqual([
      { text: 'under ', underline: true },
      { text: 'bold', underline: true, bold: true },
    ]);
  });

  it('parses color', () => {
    expect(parseRichText('a [color=#ff0000]red[/color] b')).toEqual([
      { text: 'a ' },
      { text: 'red', color: '#ff0000' },
      { text: ' b' },
    ]);
  });

  it('parses a bounded font size and preserves nested formatting', () => {
    expect(parseRichText('[size=20]large **bold**[/size]')).toEqual([
      { text: 'large ', fontSize: 20 },
      { text: 'bold', fontSize: 20, bold: true },
    ]);
  });

  it('drops an out-of-range font size while preserving its text', () => {
    expect(parseRichText('[size=80]text[/size]')).toEqual([{ text: 'text' }]);
  });

  it('parses bold with nested italic', () => {
    expect(parseRichText('**bold *italic* bold**')).toEqual([
      { text: 'bold ', bold: true },
      { text: 'italic', bold: true, italic: true },
      { text: ' bold', bold: true },
    ]);
  });

  it('parses italic with nested bold', () => {
    expect(parseRichText('*a **b** c*')).toEqual([
      { text: 'a ', italic: true },
      { text: 'b', italic: true, bold: true },
      { text: ' c', italic: true },
    ]);
  });

  it('parses color wrapping nested bold', () => {
    expect(parseRichText('[color=#00ff00]hi **bold**[/color]')).toEqual([
      { text: 'hi ', color: '#00ff00' },
      { text: 'bold', color: '#00ff00', bold: true },
    ]);
  });

  it('treats an unclosed ** as literal text', () => {
    expect(parseRichText('a **b c')).toEqual([{ text: 'a **b c' }]);
  });

  it('treats an unclosed * as literal text', () => {
    expect(parseRichText('a *b c')).toEqual([{ text: 'a *b c' }]);
  });

  it('ignores an invalid color but keeps the inner text', () => {
    expect(parseRichText('[color=red]hi[/color]')).toEqual([{ text: 'hi' }]);
  });

  it('treats an unclosed color tag as literal text', () => {
    expect(parseRichText('[color=#ff0000]hi')).toEqual([{ text: '[color=#ff0000]hi' }]);
  });

  it('accepts 3-digit hex colors', () => {
    expect(parseRichText('[color=#f00]x[/color]')).toEqual([{ text: 'x', color: '#f00' }]);
  });
});

describe('stripRichText', () => {
  it('removes bold, italic, and color markup', () => {
    expect(stripRichText('Hello **brave** [color=#ff0000]world[/color]')).toBe(
      'Hello brave world',
    );
  });

  it('keeps unclosed markers literal', () => {
    expect(stripRichText('a **b')).toBe('a **b');
  });

  it('returns empty string for empty input', () => {
    expect(stripRichText('')).toBe('');
  });
});

describe('rich text alignment', () => {
  it('extracts alignment without exposing its marker as text', () => {
    expect(richTextAlignment('[align=center]Hello')).toBe('center');
    expect(stripRichText('[align=center]Hello')).toBe('Hello');
  });

  it('replaces and clears an existing alignment marker', () => {
    expect(withRichTextAlignment('[align=center]Hello', 'right')).toBe('[align=right]Hello');
    expect(withRichTextAlignment('[align=right]Hello', 'left')).toBe('Hello');
  });
});

describe('richTextLength', () => {
  it('counts visible characters only', () => {
    // "Hello brave world" = 17 visible characters, markup excluded.
    expect(richTextLength('Hello **brave** [color=#ff0000]world[/color]')).toBe(17);
  });
});

describe('sliceRichText', () => {
  it('returns no spans for a zero or negative count', () => {
    const spans = parseRichText('**brave**');
    expect(sliceRichText(spans, 0)).toEqual([]);
    expect(sliceRichText(spans, -3)).toEqual([]);
  });

  it('keeps styling on a partially-revealed bold word', () => {
    const spans = parseRichText('**brave**');
    expect(sliceRichText(spans, 3)).toEqual([{ text: 'bra', bold: true }]);
  });

  it('slices across span boundaries preserving each span style', () => {
    const spans = parseRichText('Hi **bold**');
    // "Hi " (3) + "bo" from the bold span.
    expect(sliceRichText(spans, 5)).toEqual([
      { text: 'Hi ' },
      { text: 'bo', bold: true },
    ]);
  });

  it('returns all spans when count exceeds visible length', () => {
    const spans = parseRichText('a *b*');
    expect(sliceRichText(spans, 100)).toEqual(spans);
  });
});
