/**
 * StoryNode Component
 * Visual representation of a story scene in the node editor
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { NodeData } from './types';

interface Props {
  node: NodeData;
  isSelected: boolean;
  isHovered: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onConnectionStart: () => void;
}

export function StoryNode({
  node,
  isSelected,
  isHovered,
  onPress,
  onLongPress,
  onConnectionStart,
}: Props) {
  const colors = useColors();

  const hasWarnings = node.warnings.length > 0;
  const isEndNode = node.isEnd;

  return (
    <View
      style={[
        styles.container,
        {
          width: node.size.width,
          minHeight: node.size.height,
          backgroundColor: isSelected ? colors.primary : colors.surface,
          borderColor: hasWarnings
            ? colors.warning
            : node.isStart
            ? colors.success
            : isSelected
            ? colors.primary
            : colors.border,
          borderWidth: node.isStart ? 2.5 : isSelected ? 2 : 1,
          shadowColor: isSelected ? colors.primary : '#000',
          shadowOpacity: isSelected ? 0.3 : 0.1,
          shadowRadius: isSelected ? 8 : 4,
          shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
          elevation: isSelected ? 6 : 2,
          transform: [{ scale: isHovered ? 1.02 : 1 }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={styles.pressable}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {node.isStart && (
              <View style={[styles.badge, { backgroundColor: colors.success }]}>
                <Text style={styles.badgeText}>START</Text>
              </View>
            )}
            {isEndNode && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>END</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {hasWarnings && (
              <Text style={styles.warningIcon}>⚠️</Text>
            )}
          </View>
        </View>

        {/* Node ID */}
        <Text
          style={[
            styles.nodeId,
            { color: isSelected ? '#fff' : colors.foreground },
          ]}
          numberOfLines={1}
        >
          {node.id}
        </Text>

        {/* Text Preview */}
        <Text
          style={[
            styles.preview,
            { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.muted },
          ]}
          numberOfLines={2}
        >
          {node.textPreview || 'No dialogue text'}
        </Text>

        {/* Media Indicators */}
        <View style={styles.indicators}>
          {node.hasImage && (
            <View style={[styles.indicator, { backgroundColor: colors.primary }]}>
              <Text style={styles.indicatorText}>🖼</Text>
            </View>
          )}
          {node.hasAudio && (
            <View style={[styles.indicator, { backgroundColor: colors.primary }]}>
              <Text style={styles.indicatorText}>🎵</Text>
            </View>
          )}
          {node.hasVoice && (
            <View style={[styles.indicator, { backgroundColor: colors.primary }]}>
              <Text style={styles.indicatorText}>🗣</Text>
            </View>
          )}
        </View>

        {/* Choice Count */}
        <View style={styles.footer}>
          <Text
            style={[
              styles.choiceCount,
              { color: isSelected ? 'rgba(255,255,255,0.9)' : colors.muted },
            ]}
          >
            {node.choiceCount} {node.choiceCount === 1 ? 'choice' : 'choices'}
          </Text>
        </View>

        {/* Connection Handle */}
        <Pressable
          style={[
            styles.connectionHandle,
            { backgroundColor: colors.primary, borderColor: colors.background },
          ]}
          onPress={onConnectionStart}
        >
          <Text style={styles.handleIcon}>+</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  pressable: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    minHeight: 18,
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 4,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  warningIcon: {
    fontSize: 14,
  },
  nodeId: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  preview: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  indicators: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorText: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  choiceCount: {
    fontSize: 10,
    fontWeight: '600',
  },
  connectionHandle: {
    position: 'absolute',
    bottom: -12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
