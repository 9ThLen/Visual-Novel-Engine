import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Animated,
  Platform,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import {
  getPointerEventsStyle,
  shouldUseNativeDriverForPlatform,
} from '@/lib/react-native-web-interop';
import type { ReaderFontScale, ReaderLineHeightScale } from '@/lib/user-settings';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RichText } from '@/components/RichText';

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
  readerFontScale?: ReaderFontScale;
  readerLineHeightScale?: ReaderLineHeightScale;
}

const HISTORY_FONT_SIZE = 14;
const HISTORY_LINE_HEIGHT = 21;
const DEFAULT_READER_LINE_HEIGHT_SCALE = 1.2;

export function DialogueHistory({
  visible,
  entries,
  onClose,
  readerFontScale = 1.0,
  readerLineHeightScale = DEFAULT_READER_LINE_HEIGHT_SCALE,
}: Props) {
  const colors = useColors();
  const { t } = useI18n();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { height } = useWindowDimensions();
  const panelHeight = height * 0.72;
  const panelBg = colors.surface;
  const useNativeDriver = shouldUseNativeDriverForPlatform(Platform.OS);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideAnim, useNativeDriver]);

  const sheetTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight, 0],
  });

  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);
  const historyTextStyle = useMemo(
    () => ({
      fontSize: HISTORY_FONT_SIZE * readerFontScale,
      color: colors.foreground,
      lineHeight: HISTORY_LINE_HEIGHT * readerFontScale * (readerLineHeightScale / DEFAULT_READER_LINE_HEIGHT_SCALE),
    }),
    [colors.foreground, readerFontScale, readerLineHeightScale],
  );

  const renderEntry = useCallback(
    ({ item, index }: { item: HistoryEntry; index: number }) => (
      <View style={{ opacity: index === 0 ? 1 : Math.max(0, 0.72 - index * 0.04) }}>
        {item.speaker ? (
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {item.speaker}
          </Text>
        ) : null}
        <Text style={historyTextStyle}>
          <RichText text={item.text} />
        </Text>
        {index < entries.length - 1 && (
          <View style={{ height: 1, backgroundColor: colors.border, marginTop: 12 }} />
        )}
      </View>
    ),
    [colors, entries.length, historyTextStyle]
  );

  if (!visible) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 200 },
        getPointerEventsStyle('auto'),
      ]}
    >
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.backdrop }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
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
            {t('reader.log')}
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 12 })}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <IconSymbol name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        {entries.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: panelBg }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>{t('reader.noHistory')}</Text>
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
