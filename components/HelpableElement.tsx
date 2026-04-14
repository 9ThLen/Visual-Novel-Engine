/**
 * HelpableElement Component
 * Wraps any UI element to make it "explainable" in help mode
 */

import React, { useRef } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { useHelpSystem } from '@/lib/help-system-context';

interface HelpableElementProps {
  helpId: string;
  children: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  style?: any;
}

export function HelpableElement({
  helpId,
  children,
  disabled = false,
  onPress,
  style,
}: HelpableElementProps) {
  const { isHelpModeActive, isGuidedTourActive, showTooltip, getCurrentTour } = useHelpSystem();
  const viewRef = useRef<View>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Check if this element is the current tour step
  const tour = getCurrentTour();
  const isCurrentTourStep = tour?.steps[0]?.helpItemId === helpId;

  // Pulse animation for guided tour
  React.useEffect(() => {
    if (isGuidedTourActive && isCurrentTourStep) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isGuidedTourActive, isCurrentTourStep]);

  const handlePress = () => {
    console.log('[HelpableElement] handlePress called', {
      helpId,
      isHelpModeActive,
      isGuidedTourActive,
      hasOnPress: !!onPress,
      disabled,
    });

    if (isHelpModeActive || isGuidedTourActive) {
      // In help mode, show tooltip instead of normal action
      console.log('[HelpableElement] Showing tooltip for', helpId);
      viewRef.current?.measure((x, y, width, height, pageX, pageY) => {
        console.log('[HelpableElement] Measured position:', { x, y, width, height, pageX, pageY });
        showTooltip(helpId, { x: pageX, y: pageY, width, height });
      });
    } else if (onPress && !disabled) {
      // Normal mode - execute action (only if onPress is provided)
      console.log('[HelpableElement] Executing onPress for', helpId);
      onPress();
    }
  };

  const shouldHighlight = isHelpModeActive || (isGuidedTourActive && isCurrentTourStep);

  // Simple wrapper when not in help mode and no custom onPress
  if (!shouldHighlight && !onPress) {
    return (
      <View ref={viewRef} style={style}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      ref={viewRef}
      style={[
        style,
        shouldHighlight && styles.highlighted,
        isGuidedTourActive && isCurrentTourStep && {
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Overlay Pressable for help mode - captures events before children */}
      {shouldHighlight && (
        <Pressable
          onPress={handlePress}
          style={[
            StyleSheet.absoluteFillObject,
            styles.highlightedPressable,
            { zIndex: 1000 },
          ]}
        />
      )}
      {/* Normal content - disable pointer events in help mode */}
      <View pointerEvents={shouldHighlight ? 'none' : 'auto'}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  highlighted: {
    borderWidth: 2,
    borderColor: '#C17A5C',
    borderRadius: 8,
    shadowColor: '#C17A5C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  highlightedPressable: {
    backgroundColor: 'rgba(193, 122, 92, 0.08)',
  },
});
