import { describe, expect, it } from 'vitest';

import { getTimelineItemLayout } from '@/lib/editor/timeline-item-layout';

describe('timeline-item-layout', () => {
  it('keeps vertical spacing inside the measured item layout', () => {
    const first = getTimelineItemLayout(0);
    const next = getTimelineItemLayout(1);

    expect(first.cardStyle.marginVertical).toBe(0);
    expect(next.cardStyle.marginVertical).toBe(0);
    expect(next.containerStyle.paddingBottom).toBeGreaterThan(0);
    expect(next.connectorStyle.height).toBe(16);
  });
});
