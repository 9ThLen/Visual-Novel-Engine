import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSceneStore } from '../../stores/scene-store';
import { TimelineEvent } from '../../lib/scene-types';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

type TimelineSortableItem = TimelineEvent & { id: string };

interface TimelineEditorProps {
  sceneId: string;
}

/**
 * Recalculate startTime values for reordered timeline events.
 * This domain logic is extracted to a pure utility function so it can be
 * reused across different views (e.g. read-only timeline previews).
 */
export function recalculateTimelineStartTimes(
  events: TimelineEvent[]
): TimelineEvent[] {
  let currentTime = 0;
  return events.map(event => {
    const updated = {
      ...event,
      startTime: Math.round(currentTime),
    };
    currentTime += event.duration;
    return updated;
  });
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({ sceneId }) => {
  const scenes = useSceneStore((state) => state.scenes);
  const addTimelineEvent = useSceneStore((state) => state.addTimelineEvent);
  const removeTimelineEvent = useSceneStore((state) => state.removeTimelineEvent);
  const batchUpdateTimelineEvents = useSceneStore((state) => state.batchUpdateTimelineEvents);
  const scene = scenes.find((s) => s.id === sceneId);
  const layout = useResponsiveLayout();

  // Handle scene not found
  if (!scene) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Scene not found</Text>
      </View>
    );
  }

  const timelineEvents: TimelineSortableItem[] = (scene.timeline || []).map((evt) => ({
    ...evt,
    // id is already present from TimelineEvent
  }));

  // Time scale factor (px per second)
  const timeScale = 100;

  // Calculate per-item widths based on actual duration so drag-and-drop
  // target calculations match the rendered layout
  const itemWidths = useMemo(() => {
    return timelineEvents.map((evt) => Math.max(evt.duration * timeScale, 80));
  }, [timelineEvents, timeScale]);

  // Use the average width as a rough itemWidth for HorizontalSortable,
  // or fall back to a reasonable minimum
  const avgItemWidth = itemWidths.length > 0
    ? Math.round(itemWidths.reduce((a, b) => a + b, 0) / itemWidths.length)
    : 120;

  // Calculate total timeline duration
  const totalDuration = timelineEvents.reduce((max, event) => {
    const eventEnd = event.startTime + event.duration;
    return eventEnd > max ? eventEnd : max;
  }, 0);

  const totalWidth = Math.max(totalDuration, 10) * timeScale;

  // Dynamic ruler interval calculation to prevent rendering thousands of components
  // for very long scenes (e.g. 1h+).
  const rulerInterval = useMemo(() => {
    if (totalDuration <= 60) return 1;
    if (totalDuration <= 300) return 5;
    if (totalDuration <= 1800) return 30;
    if (totalDuration <= 3600) return 60;
    return 300; // Every 5 minutes for very long scenes
  }, [totalDuration]);

  // Generate ruler marks with calculated interval
  const rulerMarks = useMemo(() => {
    const marks = [];
    const duration = Math.ceil(totalDuration);
    for (let i = 0; i <= duration; i += rulerInterval) {
      marks.push(i);
    }
    return marks;
  }, [totalDuration, rulerInterval]);

  // Render individual timeline block
  const renderTimelineItem = (event: TimelineSortableItem, index: number) => {
    const blockWidth = Math.max(event.duration * timeScale, 80);

    return (
      <TouchableOpacity
        key={event.id || `timeline-${index}`}
        onPress={() => { }}
        style={[
          styles.timelineBlock,
          layout.isTablet && styles.timelineBlockTablet,
          { width: blockWidth },
        ]}
      >
        <Text style={[styles.blockText, layout.isTablet && styles.blockTextTablet]}>
          ID: {event.elementId}
        </Text>
        <Text style={[styles.blockText, layout.isTablet && styles.blockTextTablet]}>
          {event.startTime}s - {event.duration}s
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, layout.isTablet && styles.containerTablet, !layout.isTablet && styles.containerPhone]}>
      {/* Timeline Ruler */}
      <ScrollView horizontal style={[styles.rulerContainer, !layout.isTablet && styles.rulerContainerPhone]}>
        <View style={[styles.ruler, { width: totalWidth }]}>
          {rulerMarks.map((second) => (
            <View
              key={`ruler-${second}`}
              style={[styles.rulerMark, { left: second * timeScale }]}
            >
              <Text style={[styles.rulerText, layout.isTablet && styles.rulerTextTablet, !layout.isTablet && styles.rulerTextPhone]}>
                {second}s
              </Text>
              <View style={styles.rulerTick} />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Timeline Events (DnD disabled - HorizontalSortable not exported by library) */}
      <ScrollView
        horizontal
        style={[styles.sortableContainer, !layout.isTablet && styles.sortableContainerPhone]}
        contentContainerStyle={styles.sortableContent}
      >
        {timelineEvents.map((event, index) => renderTimelineItem(event, index))}
        {timelineEvents.length === 0 && (
          <Text style={{ color: '#94a3b8', padding: 20 }}>
            No timeline events
          </Text>
        )}
      </ScrollView>

      {/* Detailed view below sortable */}
      <ScrollView style={[styles.detailContainer, !layout.isTablet && styles.detailContainerPhone]}>
        {timelineEvents.map((event, index) => (
          <View
            key={event.id || `detail-${index}`}
            style={[styles.detailCard, layout.isTablet && styles.detailCardTablet, !layout.isTablet && styles.detailCardPhone]}
          >
            <View style={styles.detailHeader}>
              <Text style={[styles.detailTitle, layout.isTablet && styles.detailTitleTablet, !layout.isTablet && styles.detailTitlePhone]}>
                🎬 {event.elementId}
              </Text>
              <Text style={[styles.detailBadge, !layout.isTablet && styles.detailBadgePhone]}>{event.easing}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, !layout.isTablet && styles.detailLabelPhone]}>Старт:</Text>
              <Text style={[styles.detailValue, !layout.isTablet && styles.detailValuePhone]}>{event.startTime}s</Text>
              <Text style={[styles.detailLabel, !layout.isTablet && styles.detailLabelPhone]}>Тривалість:</Text>
              <Text style={[styles.detailValue, !layout.isTablet && styles.detailValuePhone]}>{event.duration}s</Text>
            </View>
          </View>
        ))}
        {timelineEvents.length === 0 && (
          <View style={styles.emptyDetail}>
            <Text style={styles.emptyDetailText}>Немає подій на таймлайні</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  containerPhone: {
    backgroundColor: '#f8f9fa',
    // On phone, TimelineEditor is inside a maxHeight wrapper from the parent,
    // so we don't use flex:1 which would try to fill the whole screen.
    // Instead, just let content flow naturally.
  },
  containerTablet: {
    padding: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
    marginTop: 20,
  },
  rulerContainer: {
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
    backgroundColor: '#fff',
  },
  rulerContainerPhone: {
    height: 36,
  },
  ruler: {
    position: 'relative',
    height: '100%',
  },
  rulerMark: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    width: 40,
    marginLeft: -20,
  },
  rulerText: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 2,
  },
  rulerTextTablet: {
    fontSize: 14,
  },
  rulerTextPhone: {
    fontSize: 10,
    marginBottom: 1,
  },
  rulerTick: {
    width: 1,
    height: 12,
    backgroundColor: '#adb5bd',
  },
  // Sortable timeline area
  sortableContainer: {
    minHeight: 100,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  sortableContainerPhone: {
    minHeight: 72,
  },
  sortableContent: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  timelineBlock: {
    height: 72,
    backgroundColor: '#4a90e2',
    borderRadius: 6,
    padding: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c6cb0',
  },
  timelineBlockTablet: {
    height: 90,
    padding: 12,
    borderRadius: 8,
  },
  blockText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
  },
  blockTextTablet: {
    fontSize: 14,
    lineHeight: 20,
  },
  // Detail cards below
  detailContainer: {
    flex: 1,
    padding: 8,
  },
  detailContainerPhone: {
    padding: 4,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4a90e2',
  },
  detailCardTablet: {
    padding: 16,
    minHeight: 70,
  },
  detailCardPhone: {
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  detailTitleTablet: {
    fontSize: 17,
  },
  detailTitlePhone: {
    fontSize: 13,
  },
  detailBadge: {
    fontSize: 11,
    color: '#6c757d',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  detailBadgePhone: {
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  detailLabelPhone: {
    fontSize: 10,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  detailValuePhone: {
    fontSize: 10,
  },
  emptyDetail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyDetailText: {
    color: '#94a3b8',
    fontSize: 14,
  },
});

export default TimelineEditor;
