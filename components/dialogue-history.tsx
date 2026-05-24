import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Animated,
  useWindowDimensions,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

/** Solid panel — RN StyleSheet does not parse oklch(); rgba dialogue-bg is too transparent here. */
const HISTORY_PANEL_BG = '#0F0E17';
const HISTORY_PANEL_BG_LIGHT = '#FDFCF9';

export interface HistoryEntry {
  id: string;
  speaker?: string;
  text: string;
  sceneId: string;
}

interface Props {
  visible: boolean;
  entries: HistoryEntry[];
  onClose: () => void;
}

export function DialogueHistory({ visible, entries, onClose }: Props) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const panelHeight = height * 0.72;
  const panelBg = colorScheme === 'light' ? HISTORY_PANEL_BG_LIGHT : HISTORY_PANEL_BG;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideAnim]);

  const sheetTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight, 0],
  });

  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  const renderEntry = useCallback(
    ({ item, index }: { item: HistoryEntry; index: number }) => (
      <View style={{ opacity: index === 0 ? 1 : Math.max(0, 0.72 - index * 0.04) }}>
        {item.speaker ? (
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {item.speaker}
          </Text>
        ) : null}
        <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 21 }}>
          {item.text}
        </Text>
        {index < entries.length - 1 && (
          <View style={{ height: 1, backgroundColor: colors.border, marginTop: 12 }} />
        )}
      </View>
    ),
    [colors, entries.length]
  );

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 200 }]} pointerEvents="auto">
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.72)' }]}
        onPress={onClose}
      />

      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: panelHeight,
          transform: [{ translateY: sheetTranslateY }],
          backgroundColor: panelBg,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            paddingTop: 12,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
            backgroundColor: panelBg,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              position: 'absolute',
              top: 8,
              alignSelf: 'center',
              left: '50%',
              marginLeft: -18,
            }}
          />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground, marginTop: 12 }}>
            Dialogue History
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 12 })}
          >
            <Text style={{ fontSize: 22, color: colors.muted }}>✕</Text>
          </Pressable>
        </View>

        {entries.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: panelBg }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>No history yet.</Text>
          </View>
        ) : (
          <FlatList
            data={reversedEntries}
            keyExtractor={(e) => e.id}
            style={{ flex: 1, backgroundColor: panelBg }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={renderEntry}
          />
        )}
      </Animated.View>
    </View>
  );
}
