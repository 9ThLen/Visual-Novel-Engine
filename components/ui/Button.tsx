/**
 * Enhanced Button Component
 * Universal button with haptic feedback, sound, and animations
 */

import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { buttonFeedback } from '@/lib/ui-feedback';
import {
  getButtonOverlayPointerEventsStyle,
  shouldUseNativeDriver,
} from '@/lib/button-platform';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'base' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void | Promise<void>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  className?: string;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'base',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  className,
  textStyle,
  accessibilityLabel,
  accessibilityRole = 'button',
}: ButtonProps) {
  const colors = useColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const useNativeDriver = shouldUseNativeDriver(Platform.OS);
  const derivedAccessibilityLabel =
    accessibilityLabel ?? (typeof children === 'string' ? children : undefined);

  const handlePressIn = () => {
    if (disabled || loading) return;

    // Scale down animation
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver,
      tension: 300,
      friction: 10,
    }).start();

    // Glow effect
    Animated.timing(glowAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver,
    }).start();

    // Haptic feedback
    buttonFeedback();
  };

  const handlePressOut = () => {
    if (disabled || loading) return;

    // Scale back
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver,
      tension: 300,
      friction: 10,
    }).start();

    // Remove glow
    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver,
    }).start();
  };

  const handlePress = async () => {
    if (disabled || loading || !onPress) return;
    await onPress();
  };

  // Size styles
  const sizeStyles = {
    sm: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    base: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    lg: {
      height: 52,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
  };

  const textSizes = {
    sm: 13,
    base: 15,
    lg: 17,
  };

  // Variant styles — using new OKLCH design tokens
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: colors.primary,
          borderWidth: 0,
          textColor: colors['text-inverse'] ?? '#FFFFFF',
        };
      case 'secondary':
        return {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          textColor: colors.foreground,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: colors.primary,
          textColor: colors.primary,
        };
      case 'ghost':
        return {
          backgroundColor: colors.hover ?? 'transparent',
          borderWidth: 0,
          textColor: colors.primary,
        };
      case 'danger':
        return {
          backgroundColor: colors.error,
          borderWidth: 0,
          textColor: colors['text-inverse'] ?? '#FFFFFF',
        };
    }
  };

  const variantStyles = getVariantStyles();
  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[{ opacity: isDisabled ? 0.5 : 1 }, fullWidth && { width: '100%' }]}>
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        accessibilityLabel={derivedAccessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        className={className}
        style={[
          styles.button,
          sizeStyles[size],
          {
            backgroundColor: variantStyles.backgroundColor,
            borderWidth: variantStyles.borderWidth,
            borderColor: variantStyles.borderColor,
          },
          style,
        ]}
      >
        {/* Glow effect */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colors.primary,
              opacity: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.2],
              }),
              borderRadius: sizeStyles[size].borderRadius,
            },
            getButtonOverlayPointerEventsStyle(),
          ]}
          pointerEvents={undefined}
        />

        {/* Content */}
        {loading ? (
          <ActivityIndicator color={variantStyles.textColor} size="small" />
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <>{icon}</>
            )}
            <Text
              style={[
                styles.text,
                {
                  color: variantStyles.textColor,
                  fontSize: textSizes[size],
                  marginLeft: icon && iconPosition === 'left' ? 8 : 0,
                  marginRight: icon && iconPosition === 'right' ? 8 : 0,
                },
                textStyle,
              ]}
            >
              {children}
            </Text>
            {icon && iconPosition === 'right' && (
              <>{icon}</>
            )}
          </>
        )}
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
