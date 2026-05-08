import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetId?: string; // ID елемента, на який вказуємо (опціонально)
}

interface TourGuideProps {
  visible: boolean;
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export const TourGuide: React.FC<TourGuideProps> = ({ visible, steps, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
      setCurrentStep(0);
    }
  }, [visible, currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  if (!visible || steps.length === 0) return null;

  const step = steps[currentStep];

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.overlay}>
        <Animated.View 
          style={[
            styles.container,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.stepCounter}>{currentStep + 1} / {steps.length}</Text>
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>

          <View style={styles.footer}>
            {currentStep > 0 && (
              <TouchableOpacity 
                style={[styles.button, styles.backButton]} 
                onPress={() => setCurrentStep(currentStep - 1)}
              >
                <Text style={styles.buttonText}>Назад</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={[styles.button, styles.nextButton]} 
              onPress={handleNext}
            >
              <Text style={styles.buttonText}>
                {currentStep === steps.length - 1 ? 'Завершити' : 'Далі'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: width * 0.9,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepCounter: {
    color: '#64748b',
    fontSize: 14,
  },
  skipButton: {
    padding: 4,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#334155',
  },
  nextButton: {
    backgroundColor: '#3b82f6',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
});
