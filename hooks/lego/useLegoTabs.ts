import { useState, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';

export type TabType = 'canvas' | 'timeline';

export function useLegoTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('canvas');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const switchTab = useCallback((tab: TabType) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (!isMountedRef.current) return;
      setActiveTab(tab);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  return {
    activeTab,
    fadeAnim,
    switchTab,
  };
}