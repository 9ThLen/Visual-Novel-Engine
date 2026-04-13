/**
 * FirstTimeGuide Component
 * Welcome modal for first-time users
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { useHelpSystem } from '@/lib/help-system-context';
import { useColors } from '@/hooks/use-colors';
import { Button } from '@/components/ui/Button';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function FirstTimeGuide() {
  const {
    hasSeenFirstTimeGuide,
    markFirstTimeGuideSeen,
    startGuidedTour,
  } = useHelpSystem();
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Show guide after a short delay if first time
    if (!hasSeenFirstTimeGuide) {
      const timer = setTimeout(() => {
        setVisible(true);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [hasSeenFirstTimeGuide]);

  const handleStartTour = () => {
    setVisible(false);
    markFirstTimeGuideSeen();
    startGuidedTour('firstTime');
  };

  const handleSkip = () => {
    setVisible(false);
    markFirstTimeGuideSeen();
  };

  if (!visible || hasSeenFirstTimeGuide) return null;

  return (
    <Modal transparent visible={visible}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Welcome icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>👋</Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            Welcome to the Editor!
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.muted }]}>
            This is your first time here. Would you like a quick tour to learn the basics?
          </Text>

          {/* Features list */}
          <View style={styles.featuresList}>
            <FeatureItem icon="📖" text="Create branching stories" colors={colors} />
            <FeatureItem icon="🎨" text="Add images and audio" colors={colors} />
            <FeatureItem icon="🎮" text="Test your story anytime" colors={colors} />
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              variant="secondary"
              size="base"
              onPress={handleSkip}
              style={{ flex: 1 }}
            >
              Skip
            </Button>
            <Button
              variant="primary"
              size="base"
              onPress={handleStartTour}
              style={{ flex: 1 }}
            >
              Start Tour
            </Button>
          </View>

          {/* Help hint */}
          <Text style={[styles.hint, { color: colors.muted }]}>
            💡 You can always access help by tapping the ? button
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function FeatureItem({ icon, text, colors }: { icon: string; text: string; colors: any }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={[styles.featureText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 40, 400),
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  featuresList: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
