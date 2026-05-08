import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSceneStore } from '../../stores/scene-store';
import { TimelineEvent } from '../../lib/scene-types';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

interface TimelineEditorProps {
  sceneId: string;
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({ sceneId }) => {
  // Get scene data from store
  const scenes = useSceneStore((state) => state.scenes);
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

  const timelineEvents: TimelineEvent[] = scene.timeline || [];
  
  // Calculate total timeline duration (max end time of all events)
  const totalDuration = timelineEvents.reduce((max, event) => {
    const eventEnd = event.startTime + event.duration;
    return eventEnd > max ? eventEnd : max;
  }, 0);
  
  // Timeline scale: 100px per second, minimum 10 seconds width
  const timeScale = 100;
  const totalWidth = Math.max(totalDuration, 10) * timeScale;

  // Generate ruler marks (0s, 1s, 2s, etc.)
  const rulerMarks = [];
  for (let i = 0; i <= Math.ceil(totalDuration); i++) {
    rulerMarks.push(i);
  }

  return (
    <View style={[styles.container, layout.isTablet && styles.containerTablet]}>
      {/* Timeline Ruler */}
      <ScrollView horizontal style={styles.rulerContainer}>
        <View style={[styles.ruler, { width: totalWidth }]}>
          {rulerMarks.map((second) => (
            <View 
              key={`ruler-${second}`} 
              style={[styles.rulerMark, { left: second * timeScale }]}
            >
              <Text style={[styles.rulerText, layout.isTablet && styles.rulerTextTablet]}>{second}s</Text>
              <View style={styles.rulerTick} />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Timeline Tracks with Blocks */}
      <ScrollView horizontal style={styles.timelineContainer}>
        <View style={[styles.timeline, { width: totalWidth }]}>
          {timelineEvents.map((event, index) => (
            <View
              key={event.elementId || `event-${index}`}
              style={[
                styles.timelineBlock,
                layout.isTablet && styles.timelineBlockTablet,
                {
                  left: event.startTime * timeScale,
                  width: Math.max(event.duration * timeScale, 60),
                },
              ]}
            >
              <Text style={[styles.blockText, layout.isTablet && styles.blockTextTablet]}>ID: {event.elementId}</Text>
              <Text style={[styles.blockText, layout.isTablet && styles.blockTextTablet]}>Start: {event.startTime}s</Text>
              <Text style={[styles.blockText, layout.isTablet && styles.blockTextTablet]}>Duration: {event.duration}s</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  timelineContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  timeline: {
    position: 'relative',
    height: '100%',
    minHeight: 200,
  },
  timelineBlock: {
    position: 'absolute',
    top: 16,
    height: 80,
    backgroundColor: '#4a90e2',
    borderRadius: 6,
    padding: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c6cb0',
  },
  timelineBlockTablet: {
    height: 100,
    padding: 12,
    minHeight: 60,
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
});

export default TimelineEditor;
