/**
 * Help System Context
 * Manages help mode state and guided tours
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HelpSystemState,
  HelpTooltipPosition,
  GuidedTour,
  GUIDED_TOURS,
} from './help-system-types';

interface HelpSystemContextValue extends HelpSystemState {
  toggleHelpMode: () => void;
  showTooltip: (helpItemId: string, position: HelpTooltipPosition) => void;
  hideTooltip: () => void;
  startGuidedTour: (tourId: string) => void;
  nextTourStep: () => void;
  previousTourStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  markFirstTimeGuideSeen: () => void;
  getCurrentTour: () => GuidedTour | null;
}

const HelpSystemContext = createContext<HelpSystemContextValue | undefined>(undefined);

const STORAGE_KEY = 'help_system_state';

export function HelpSystemProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HelpSystemState>({
    isHelpModeActive: false,
    activeTooltip: null,
    tooltipPosition: null,
    isGuidedTourActive: false,
    currentTourId: null,
    currentTourStep: 0,
    hasSeenFirstTimeGuide: false,
  });

  // Load persisted state
  useEffect(() => {
    loadState();
  }, []);

  // Persist state changes
  useEffect(() => {
    saveState();
  }, [state.hasSeenFirstTimeGuide]);

  const loadState = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState((prev) => ({
          ...prev,
          hasSeenFirstTimeGuide: parsed.hasSeenFirstTimeGuide || false,
        }));
      }
    } catch (error) {
      console.error('Failed to load help system state:', error);
    }
  };

  const saveState = async () => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          hasSeenFirstTimeGuide: state.hasSeenFirstTimeGuide,
        })
      );
    } catch (error) {
      console.error('Failed to save help system state:', error);
    }
  };

  const toggleHelpMode = () => {
    setState((prev) => ({
      ...prev,
      isHelpModeActive: !prev.isHelpModeActive,
      activeTooltip: null,
      tooltipPosition: null,
    }));
  };

  const showTooltip = (helpItemId: string, position: HelpTooltipPosition) => {
    setState((prev) => ({
      ...prev,
      activeTooltip: helpItemId,
      tooltipPosition: position,
    }));
  };

  const hideTooltip = () => {
    setState((prev) => ({
      ...prev,
      activeTooltip: null,
      tooltipPosition: null,
    }));
  };

  const startGuidedTour = (tourId: string) => {
    const tour = GUIDED_TOURS[tourId];
    if (!tour) {
      console.warn(`Tour ${tourId} not found`);
      return;
    }

    setState((prev) => ({
      ...prev,
      isGuidedTourActive: true,
      currentTourId: tourId,
      currentTourStep: 0,
      isHelpModeActive: true,
      activeTooltip: null,
      tooltipPosition: null,
    }));
  };

  const nextTourStep = () => {
    const tour = getCurrentTour();
    if (!tour) return;

    setState((prev) => {
      const nextStep = prev.currentTourStep + 1;
      if (nextStep >= tour.steps.length) {
        // Tour completed
        return {
          ...prev,
          isGuidedTourActive: false,
          currentTourId: null,
          currentTourStep: 0,
          isHelpModeActive: false,
        };
      }
      return {
        ...prev,
        currentTourStep: nextStep,
        activeTooltip: null,
        tooltipPosition: null,
      };
    });
  };

  const previousTourStep = () => {
    setState((prev) => {
      const prevStep = Math.max(0, prev.currentTourStep - 1);
      return {
        ...prev,
        currentTourStep: prevStep,
        activeTooltip: null,
        tooltipPosition: null,
      };
    });
  };

  const skipTour = () => {
    setState((prev) => ({
      ...prev,
      isGuidedTourActive: false,
      currentTourId: null,
      currentTourStep: 0,
      isHelpModeActive: false,
      activeTooltip: null,
      tooltipPosition: null,
    }));
  };

  const completeTour = () => {
    setState((prev) => ({
      ...prev,
      isGuidedTourActive: false,
      currentTourId: null,
      currentTourStep: 0,
      isHelpModeActive: false,
      activeTooltip: null,
      tooltipPosition: null,
    }));
  };

  const markFirstTimeGuideSeen = () => {
    setState((prev) => ({
      ...prev,
      hasSeenFirstTimeGuide: true,
    }));
  };

  const getCurrentTour = (): GuidedTour | null => {
    if (!state.currentTourId) return null;
    return GUIDED_TOURS[state.currentTourId] || null;
  };

  const value: HelpSystemContextValue = {
    ...state,
    toggleHelpMode,
    showTooltip,
    hideTooltip,
    startGuidedTour,
    nextTourStep,
    previousTourStep,
    skipTour,
    completeTour,
    markFirstTimeGuideSeen,
    getCurrentTour,
  };

  return (
    <HelpSystemContext.Provider value={value}>
      {children}
    </HelpSystemContext.Provider>
  );
}

export function useHelpSystem() {
  const context = useContext(HelpSystemContext);
  if (!context) {
    throw new Error('useHelpSystem must be used within HelpSystemProvider');
  }
  return context;
}
