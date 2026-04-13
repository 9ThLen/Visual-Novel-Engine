/**
 * Item Notification Component
 * Shows a toast notification when item is acquired
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { InventoryItem } from '@/lib/interactive-types';

interface Props {
  item: InventoryItem | null;
  visible: boolean;
  onHide: () => void;
}

export function ItemNotification({ item, visible, onHide }: Props) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && item) {
      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after 3 seconds
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onHide();
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, item]);

  if (!visible || !item) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.primary,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Icon */}
      {item.iconUri ? (
        <Image
          source={{ uri: item.iconUri }}
          style={styles.icon}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.icon, { backgroundColor: colors.background }]}>
          <Text style={{ fontSize: 24 }}>📦</Text>
        </View>
      )}

      {/* Text */}
      <View style={styles.textContainer}>
        <Text style={[styles.label, { color: colors.primary }]}>
          Item Acquired
        </Text>
        <Text style={[styles.itemName, { color: colors.foreground }]}>
          {item.name}
        </Text>
      </View>

      {/* Checkmark */}
      <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
        <Text style={styles.checkmarkText}>✓</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
