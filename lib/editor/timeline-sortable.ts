import type { TimelineStep } from '@/lib/engine/types';

export function createTimelineSortableProps(timeline: TimelineStep[]) {
  return {
    data: timeline,
    enableDynamicHeights: true,
    estimatedItemHeight: 80,
    useFlatList: false,
  } as const;
}
