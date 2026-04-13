/**
 * GuidedTourOverlay Component
 * Sequential guided tour with step-by-step instructions
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
import { Button } from '@/components/ui/Button';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function GuidedTourOverlay() {
  const {
    isGuidedTourActive,
    currentTourStep,
    getCurrentTour,
    nextTourStep,
    previousTourStep,
    skipTour,
  } = useHelpSystem();
  const colors = useColors();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const tour = getCurrentTour();
  const currentStep = tour?.steps[currentTourStep];

  useEffect(() => {
    if (isGuidedTourActive && currentStep) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isGuidedTourActive, currentTourStep]);

  if (!isGuidedTourActive || !tour || !currentStep) return null;

  const isFirstStep = currentTourStep === 0;
  const isLastStep = currentTourStep === tour.steps.length - 1;
  const progress = ((currentTourStep + 1) / tour.steps.length) * 100;

  return (
    <Modal transparent visible={isGuidedTourActive}>
      <View style={styles.overlay}>
        {/* Tour card */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: fadeAnim,
            },
          ]}
        >
          {/* Progress bar */}
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${progress}%` },
              ]}
            />
          </View>

          {/* Step counter */}
          <Text style={[styles.stepCounter, { color: colors.muted }]}>
            Step {currentTourStep + 1} of {tour.steps.length}
          </Text>

          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            {currentStep.title}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.muted }]}>
            {currentStep.message}
          </Text>

          {/* Navigation buttons */}
          <View style={styles.buttonRow}>
            <Button
              variant="ghost"
              size="sm"
              onPress={skipTour}
              style={{ flex: 1 }}
            >
              Skip Tour
            </Button>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!isFirstStep && (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={previousTourStep}
                >
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onPress={nextTourStep}
              >
                {isLastStep ? 'Finish' : 'Next'}
              </Button>
            </View>
          </View>
        </Animated.View>

        {/* Spotlight hint */}
        <View style={styles.spotlightHint}>
          <Text style={styles.spotlightText}>
            👆 Look for the highlighted element
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  stepCounter: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  spotlightHint: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  spotlightText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
