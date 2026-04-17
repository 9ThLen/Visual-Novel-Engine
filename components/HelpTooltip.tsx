/**
 * HelpTooltip Component
 * Displays contextual help information
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useHelpSystem } from '@/lib/help-system-context';
import { useColors } from '@/hooks/use-colors';
import { HELP_CONTENT, HELP_CATEGORIES } from '@/lib/help-system-types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function HelpTooltip() {
  const { activeTooltip, tooltipPosition, hideTooltip } = useHelpSystem();
  const colors = useColors();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (activeTooltip) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [activeTooltip]);

  if (!activeTooltip || !tooltipPosition) {
    return null;
  }

  const helpItem = HELP_CONTENT[activeTooltip];
  if (!helpItem) {
    return null;
  }

  const category = HELP_CATEGORIES[helpItem.category];

  // Calculate tooltip position
  const tooltipWidth = 280;
  const tooltipHeight = 160;
  const padding = 16;

  let tooltipX = tooltipPosition.x + tooltipPosition.width / 2 - tooltipWidth / 2;
  let tooltipY = tooltipPosition.y + tooltipPosition.height + 8;

  // Keep tooltip on screen
  if (tooltipX < padding) tooltipX = padding;
  if (tooltipX + tooltipWidth > SCREEN_WIDTH - padding) {
    tooltipX = SCREEN_WIDTH - tooltipWidth - padding;
  }

  // If tooltip would go off bottom, show above element
  if (tooltipY + tooltipHeight > SCREEN_HEIGHT - padding) {
    tooltipY = tooltipPosition.y - tooltipHeight - 8;
  }

  return (
    <Modal transparent visible={!!activeTooltip} onRequestClose={hideTooltip}>
      <Pressable style={styles.overlay} onPress={hideTooltip}>
        <Animated.View
          style={[
            styles.tooltip,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              left: tooltipX,
              top: tooltipY,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Category badge */}
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: category.color + '20' },
            ]}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text style={[styles.categoryText, { color: category.color }]}>
              {category.name}
            </Text>
          </View>

          {/* Label */}
          <Text style={[styles.label, { color: colors.foreground }]}>
            {helpItem.label}
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.muted }]}>
            {helpItem.description}
          </Text>

          {/* Hint */}
          {helpItem.hint && (
            <View style={[styles.hintBox, { backgroundColor: colors.background }]}>
              <Text style={styles.hintIcon}>💡</Text>
              <Text style={[styles.hint, { color: colors.muted }]}>
                {helpItem.hint}
              </Text>
            </View>
          )}

          {/* Close button */}
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.primary }]}
            onPress={hideTooltip}
          >
            <Text style={styles.closeButtonText}>Got it</Text>
          </Pressable>

          {/* Arrow pointer */}
          <View
            style={[
              styles.arrow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                top: tooltipY < tooltipPosition.y ? tooltipHeight - 4 : -8,
              },
            ]}
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  tooltip: {
    position: 'absolute',
    width: 280,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  categoryIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  hintIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  hint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  arrow: {
    position: 'absolute',
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
    left: '50%',
    marginLeft: -8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
});
