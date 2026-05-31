import React, { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface ReaderTransitionsProps {
  children: (styles: {
    backgroundAnimatedStyle: StyleProp<ViewStyle>;
    characterAnimatedStyle: StyleProp<ViewStyle>;
    dialogueAnimatedStyle: StyleProp<ViewStyle>;
  }) => React.ReactNode;
  isComplete: boolean;
  isTransitioning: boolean;
  onTransition?: (targetSceneId: string | null) => void;
  routeOnExecutorComplete: boolean;
  sceneId: string;
  transitionTarget: string | null;
}

export function ReaderTransitions({
  children,
  isComplete,
  isTransitioning,
  onTransition,
  routeOnExecutorComplete,
  sceneId,
  transitionTarget,
}: ReaderTransitionsProps) {
  const sceneOpacity = useSharedValue(1);
  const bgScale = useSharedValue(1);
  const uiOpacity = useSharedValue(1);
  const lastTransitionTargetRef = useRef<string | null | undefined>(undefined);
  const completionHandledRef = useRef(false);

  useEffect(() => {
    sceneOpacity.value = 0;
    bgScale.value = 1.04;
    sceneOpacity.value = withTiming(1, { duration: 380 });
    bgScale.value = withTiming(1, { duration: 700 });
  }, [sceneId, sceneOpacity, bgScale]);

  useEffect(() => {
    if (!isTransitioning) return;
    if (lastTransitionTargetRef.current === transitionTarget) return;
    lastTransitionTargetRef.current = transitionTarget;
    onTransition?.(transitionTarget);
  }, [isTransitioning, onTransition, transitionTarget]);

  useEffect(() => {
    if (
      !routeOnExecutorComplete ||
      !isComplete ||
      isTransitioning ||
      completionHandledRef.current
    ) return;
    completionHandledRef.current = true;
    onTransition?.(null);
  }, [isComplete, isTransitioning, onTransition, routeOnExecutorComplete]);

  useEffect(() => {
    lastTransitionTargetRef.current = undefined;
    completionHandledRef.current = false;
  }, [sceneId]);

  const backgroundAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ scale: bgScale.value }],
  }));

  const characterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  const dialogueAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  return (
    <>
      {children({
        backgroundAnimatedStyle,
        characterAnimatedStyle,
        dialogueAnimatedStyle,
      })}
    </>
  );
}
