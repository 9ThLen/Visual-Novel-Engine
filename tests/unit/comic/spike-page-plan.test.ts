import { buildSpikeStrip, SPIKE_IMAGE_KEYS, type ComicSpikeRect } from '@/lib/comic/spike/spike-page-plan';

function inUnit(rect: ComicSpikeRect) {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= 1.0001 && rect.y + rect.h <= 1.0001;
}

describe('the comic spike strip', () => {
  it('is a long strip by default — the plan asks for 20 pages or more', () => {
    expect(buildSpikeStrip().length).toBeGreaterThanOrEqual(20);
  });

  it('is the same strip on every call, so a measurement can be repeated', () => {
    expect(buildSpikeStrip(24)).toEqual(buildSpikeStrip(24));
  });

  it('keeps every panel inside its page and names only images the host can map', () => {
    const keys = new Set(SPIKE_IMAGE_KEYS);
    for (const page of buildSpikeStrip(30)) {
      expect(page.panels.length).toBeGreaterThan(0);
      for (const panel of page.panels) {
        expect(inUnit(panel.rect)).toBe(true);
        expect(keys.has(panel.background.image)).toBe(true);
        for (const sprite of panel.sprites) expect(keys.has(sprite.image)).toBe(true);
        for (const bubble of panel.bubbles) {
          expect(bubble.text.length).toBeGreaterThan(0);
          expect(bubble.maxWidth).toBeGreaterThan(0);
          expect(bubble.maxWidth).toBeLessThanOrEqual(1);
          if (bubble.kind === 'caption') expect(bubble.tail).toBeUndefined();
        }
      }
    }
  });

  it('gives every bubble an id of its own', () => {
    const ids = buildSpikeStrip(24).flatMap((page) => page.panels.flatMap((panel) => panel.bubbles.map((bubble) => bubble.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries Cyrillic text, so a bubble font without it shows up', () => {
    const text = buildSpikeStrip(24).flatMap((page) => page.panels.flatMap((panel) => panel.bubbles.map((bubble) => bubble.text))).join(' ');
    expect(text).toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
  });
});
