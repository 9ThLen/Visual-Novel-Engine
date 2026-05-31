import { createTimelineSortableProps } from '@/lib/editor/timeline-sortable';
import type { TimelineStep } from '@/lib/engine/types';

describe('timeline-sortable', () => {
  it('builds Sortable props for the editor timeline', () => {
    const timeline: TimelineStep[] = [
      {
        id: 'step-1',
        blockType: 'background',
        data: {
          assetId: null,
          transition: 'fade',
          duration: 500,
        },
        collapsed: false,
        enabled: true,
      },
    ];

    expect(createTimelineSortableProps(timeline)).toEqual({
      data: timeline,
      enableDynamicHeights: true,
      estimatedItemHeight: 80,
      useFlatList: false,
    });
  });
});
