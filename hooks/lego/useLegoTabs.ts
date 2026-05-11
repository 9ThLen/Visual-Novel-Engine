import { useState, useRef } from 'react';
import { Animated } from 'react-native';

export type TabType = 'canvas' | 'timeline';

export function useLegoTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('canvas');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const switchTab = (tab: TabType) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setActiveTab(tab);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  return {
    activeTab,
    fadeAnim,
    switchTab,
  };
}
