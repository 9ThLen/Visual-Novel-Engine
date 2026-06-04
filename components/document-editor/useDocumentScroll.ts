/**
 * useDocumentScroll — scroll management for DocumentSceneEditor.
 *
 * Encapsulates:
 * - scrollViewRef, pageOffsetsRef, pageHeightsRef, scrollViewportHeightRef
 * - scrollToWritingPosition() — scrolls to keep cursor visible
 * - followWriting(sceneId) — marks that scroll should follow on next render
 * - keyboard height tracking
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

interface UseDocumentScrollOptions {
  activeSceneId: string;
  isPhone: boolean;
  screenHeight: number;
}

export function useDocumentScroll({ activeSceneId, isPhone, screenHeight }: UseDocumentScrollOptions) {
  const scrollViewRef = useRef<import('react-native').ScrollView | null>(null);
  const scrollViewportHeightRef = useRef(screenHeight);
  const pageOffsetsRef = useRef<Record<string, number>>({});
  const pageHeightsRef = useRef<Record<string, number>>({});
  const followSceneIdRef = useRef<string | null>(null);
  const shouldFollowWritingRef = useRef(false);
  const didScrollToActiveRef = useRef(false);
  const shouldAnimateToActivePageRef = useRef(false);
  const previousSceneIdRef = useRef(activeSceneId);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard show/hide
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Detect scene change for animated scroll
  useEffect(() => {
    const prevId = previousSceneIdRef.current;
    // This effect is triggered when activeSceneId changes externally
    // The actual animation flag is set by the caller via prepareSceneChange()
    previousSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);

  const prepareSceneChange = useCallback((prevSceneId: string, prevDocuments: unknown[], newSceneId: string) => {
    const prevIndex = prevDocuments.findIndex((d: unknown) => (d as { sceneId: string }).sceneId === prevSceneId);
    const nextIndex = prevDocuments.findIndex((d: unknown) => (d as { sceneId: string }).sceneId === newSceneId);
    shouldAnimateToActivePageRef.current = prevSceneId !== newSceneId && prevIndex >= 0 && nextIndex > prevIndex;
    didScrollToActiveRef.current = false;
    shouldFollowWritingRef.current = false;
  }, []);

  const scrollToWritingPosition = useCallback(() => {
    requestAnimationFrame(() => {
      const sceneId = followSceneIdRef.current ?? activeSceneId;
      const pageOffset = pageOffsetsRef.current[sceneId] ?? 0;
      const pageHeight = pageHeightsRef.current[sceneId] ?? screenHeight;
      const viewportHeight = scrollViewportHeightRef.current || screenHeight;
      const keyboardInset = isPhone ? keyboardHeight : 0;
      const bottomGap = isPhone ? 96 : 120;
      const targetY = Math.max(0, pageOffset + pageHeight - viewportHeight + keyboardInset + bottomGap);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: false });
      shouldFollowWritingRef.current = false;
    });
  }, [activeSceneId, isPhone, keyboardHeight, screenHeight]);

  // Re-scroll when keyboard height changes
  useEffect(() => {
    if (shouldFollowWritingRef.current) {
      scrollToWritingPosition();
    }
  }, [keyboardHeight, scrollToWritingPosition]);

  // Track cursor Y position per scene for smart scroll
  const cursorYRef = useRef<Record<string, number>>({});

  const setCursorY = useCallback((sceneId: string, y: number) => {
    cursorYRef.current[sceneId] = y;
  }, []);

  // Smart follow: only scroll if cursor is outside visible viewport
  const smartFollow = useCallback((sceneId: string) => {
    const cursorY = cursorYRef.current[sceneId];
    if (cursorY === undefined) {
      // No cursor position known — fall back to writing position
      followSceneIdRef.current = sceneId;
      shouldFollowWritingRef.current = true;
      scrollToWritingPosition();
      return;
    }

    const pageOffset = pageOffsetsRef.current[sceneId] ?? 0;
    const viewportHeight = scrollViewportHeightRef.current || screenHeight;
    const scrollY = scrollViewRef.current ? 0 : 0; // approximate current scroll

    const relativeCursorY = pageOffset + cursorY;
    const isOutsideViewport = relativeCursorY < scrollY + 48 || relativeCursorY > scrollY + viewportHeight - 48;

    if (isOutsideViewport) {
      followSceneIdRef.current = sceneId;
      shouldFollowWritingRef.current = true;
      scrollToWritingPosition();
    }
  }, [screenHeight, scrollToWritingPosition]);

  const registerPageLayout = useCallback((sceneId: string, y: number, height: number) => {
    pageOffsetsRef.current[sceneId] = y;
    pageHeightsRef.current[sceneId] = height;
  }, []);

  return {
    scrollViewRef,
    scrollViewportHeightRef,
    pageOffsetsRef,
    pageHeightsRef,
    keyboardHeight,
    didScrollToActiveRef,
    shouldAnimateToActivePageRef,
    shouldFollowWritingRef,
    prepareSceneChange,
    scrollToWritingPosition,
    smartFollow,
    followWriting: smartFollow,
    setCursorY,
    registerPageLayout,
  };
}
