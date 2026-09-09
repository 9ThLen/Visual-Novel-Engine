import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { ToastMessage, useToastStore } from '@/lib/toast-store';

const TOAST_DURATION_MS = 3000;

function ToastItem({ toast }: { toast: ToastMessage }) {
  const colors = useColors();
  const dismissToast = useToastStore((state) => state.dismissToast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => dismissToast(toast.id));
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [dismissToast, opacity, toast.id, translateY]);

  const accentColor =
    toast.type === 'success' ? colors.success : toast.type === 'error' ? colors.error : colors.primary;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors['shadow-color'],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toast.message}
        onPress={() => dismissToast(toast.id)}
        style={styles.pressable}
      >
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
        <Text style={[styles.message, { color: colors.foreground }]} numberOfLines={3}>
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.viewport}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressable: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accent: {
    width: 4,
  },
  message: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typeScale.label,
  },
});
