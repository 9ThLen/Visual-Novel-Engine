import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useColors } from '@/hooks/use-colors';
import { SaveSlot } from '@/lib/story-domain';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui';

function AutoSaveSlot({ slot, colors, t, onLoad, onDelete }: {
  slot: SaveSlot;
  colors: ReturnType<typeof useColors>;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  onLoad: (id: string) => void; onDelete: (id: string) => void;
}) {
  const slotId = 'autosave';
  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' }]}>
      {slot.thumbnailUri ? (
        <View className="relative">
          <Image source={{ uri: slot.thumbnailUri }} className="w-full h-28"
            style={{ backgroundColor: colors.background }} resizeMode="cover" />
          <View
            className="absolute bottom-0 left-0 right-0 h-15"
            style={{ backgroundColor: colors.backdrop ?? 'rgba(0,0,0,0.6)' }}
          />
          <View className="absolute bottom-2 left-2 right-2">
            <Text style={{ color: colors['text-inverse'] ?? '#fff', fontSize: 12, fontWeight: '600' }}>
              {new Date(slot.timestamp).toLocaleDateString()}
            </Text>
          </View>
        </View>
      ) : (
        <View className="h-28 items-center justify-center" style={{ backgroundColor: colors.background }}>
          <Text style={{ fontSize: 48, opacity: 0.3 }}>💾</Text>
        </View>
      )}
      <View className="p-3">
        <View className="gap-1.5 mb-3">
          <Text style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: 'bold' }]} numberOfLines={1}>
            {slot.storyTitle || slot.storyId}
          </Text>
          {slot.sceneText ? (
            <Text style={[{ color: colors.muted }, { fontSize: 12, lineHeight: 16 }]} numberOfLines={2}>{slot.sceneText}</Text>
          ) : null}
          <Text style={[{ color: colors.primary }, { fontSize: 12, fontWeight: '600' }]}>
            📍 {slot.sceneName || slot.sceneId}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            variant="primary"
            size="sm"
            onPress={() => onLoad(slotId)}
            className="flex-1"
            accessibilityLabel={t('save.loadSlotLabel', { slot: 'Auto-Save' })}
          >
            📂 {t('save.loadButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => onDelete(slotId)}
            style={{ borderColor: colors.error }}
            textStyle={{ color: colors.error }}
            accessibilityLabel={t('save.deleteSlotLabel', { slot: 'Auto-Save' })}
          >
            🗑
          </Button>
        </View>
      </View>
    </View>
  );
}

export default function SaveLoadScreen() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void stopReaderPlayback();
      return () => {
        void stopReaderPlayback();
      };
    }, []),
  );
  const colors = useColors();
  const { saveSlots, currentStory, playbackState } = useStoryState();
  const { saveGame, loadGame, deleteSaveSlot } = useStoryActions();
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load');
  const { t, language } = useI18n();

  const handleSaveToSlot = useCallback(async (slotId: string) => {
    if (!currentStory || !playbackState) {
      Alert.alert(t('common.error'), t('save.noActiveStory'));
      return;
    }
    try {
      await saveGame(slotId);
      Alert.alert(t('common.success'), t('save.success'));
    } catch {
      Alert.alert(t('common.error'), t('common.error'));
    }
  }, [currentStory, playbackState, saveGame, t]);

  const handleLoadFromSlot = useCallback(async (slotId: string) => {
    const slot = saveSlots.find((s) => s.id === slotId);
    if (!slot) return;

    try {
      await loadGame(slotId);
      Alert.alert(t('common.success'), t('save.loadSuccess'));
      router.replace({
        pathname: '/reader',
        params: { storyId: slot.storyId, resume: '1' },
      });
    } catch {
      Alert.alert(t('common.error'), t('common.error'));
    }
  }, [saveSlots, loadGame, router, t]);

  const handleDeleteSlot = useCallback((slotId: string) => {
    Alert.alert(t('save.delete'), t('save.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('save.delete'),
        style: 'destructive',
        onPress: () => deleteSaveSlot(slotId),
      },
    ]);
  }, [deleteSaveSlot, t]);

  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return `${diffMins}${t('time.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours}${t('time.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays}${t('time.daysAgo')}`;

    return date.toLocaleDateString(language, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }, [language, t]);

  const renderSaveSlot = useCallback(({ item, index }: { item: SaveSlot | null; index: number }) => {
    const slotId = `slot-${index + 1}`;
    const isEmpty = item === null;

    return (
      <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' }]}>
        {!isEmpty && item.thumbnailUri ? (
          <View className="relative">
            <Image
              source={{ uri: item.thumbnailUri }}
              className="w-full h-28"
              style={{ backgroundColor: colors.background }}
              resizeMode="cover"
            />
            <View
              className="absolute bottom-0 left-0 right-0 h-15"
              style={{ backgroundColor: colors.backdrop ?? 'rgba(0,0,0,0.6)' }}
            />
            <View
              className="absolute top-2 left-2 rounded-lg px-2.5 py-1"
              style={{ backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors['text-inverse'] ?? '#fff', fontSize: 12, fontWeight: '700' }}>
                #{index + 1}
              </Text>
            </View>
            <View className="absolute bottom-2 left-2 right-2">
              <Text style={{ color: colors['text-inverse'] ?? '#fff', fontSize: 12, fontWeight: '600' }}>
                {formatDate(item.timestamp)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            className="h-28 items-center justify-center"
            style={{ backgroundColor: colors.background }}
          >
            <Text style={{ fontSize: 48, opacity: 0.3 }}>💾</Text>
            <Text style={[{ color: colors.muted }, { fontSize: 14, marginTop: 8, fontWeight: '600' }]}>
              {t('save.empty')} {index + 1}
            </Text>
          </View>
        )}

        <View className="p-3">
          {!isEmpty ? (
            <View className="gap-1.5 mb-3">
              <Text
                style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: 'bold' }]}
                numberOfLines={1}
              >
                {item.storyTitle || item.storyId}
              </Text>
              {item.sceneText ? (
                <Text
                  style={[{ color: colors.muted }, { fontSize: 12, lineHeight: 16 }]}
                  numberOfLines={2}
                >
                  {item.sceneText}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-1">
                <Text style={[{ color: colors.primary }, { fontSize: 12, fontWeight: '600' }]}>
                  📍 {item.sceneName || item.sceneId}
                </Text>
                <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>
                  • {t('save.slotChoiceCount', { count: item.choicesMade?.length ?? 0 })}
                </Text>
              </View>
            </View>
          ) : (
            <View className="mb-3">
              <Text style={[{ color: colors.muted }, { fontSize: 12, textAlign: 'center' }]}>
                {t('save.noData')}
              </Text>
            </View>
          )}

          <View className="flex-row gap-2">
            {activeTab === 'save' && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => handleSaveToSlot(slotId)}
                className="flex-1"
                accessibilityLabel={isEmpty
                  ? t('save.saveSlotLabel', { slot: index + 1 })
                  : t('save.overwriteSlotLabel', { slot: index + 1 })}
              >
                💾 {isEmpty ? t('save.saveHere') : t('save.overwrite')}
              </Button>
            )}
            {activeTab === 'load' && !isEmpty && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => handleLoadFromSlot(slotId)}
                className="flex-1"
                accessibilityLabel={t('save.loadSlotLabel', { slot: index + 1 })}
              >
                📂 {t('save.loadButton')}
              </Button>
            )}
            {!isEmpty && (
              <Button
                variant="outline"
                size="sm"
                onPress={() => handleDeleteSlot(slotId)}
                style={{ borderColor: colors.error }}
                textStyle={{ color: colors.error }}
                accessibilityLabel={t('save.deleteSlotLabel', { slot: index + 1 })}
              >
                🗑
              </Button>
            )}
          </View>
        </View>
      </View>
    );
  }, [activeTab, colors, t, formatDate, handleSaveToSlot, handleLoadFromSlot, handleDeleteSlot]);

  const slots = useMemo<(SaveSlot | null)[]>(
    () => Array.from({ length: 10 }, (_, i) =>
      saveSlots.find((s) => s.id === `slot-${i + 1}`) || null
    ),
    [saveSlots]
  );

  const autoSaveSlot = saveSlots.find((s) => s.id === 'autosave');

  const renderSlot = useCallback(
    ({ item, index }: { item: SaveSlot | null; index: number }) => renderSaveSlot({ item, index }),
    [renderSaveSlot]
  );

  return (
    <ScreenContainer className="p-4">
      <View className="flex-row justify-between items-center mb-5">
        <Text style={[{ color: colors.foreground }, { fontSize: 24, fontWeight: 'bold' }]}>
          {activeTab === 'save' ? t('save.title') : t('load.title')}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.back()}
          accessibilityLabel={t('menu.back')}
        >
          {t('menu.back')}
        </Button>
      </View>

      <View className="flex-row gap-2 mb-4">
        <Button
          variant={activeTab === 'load' ? 'primary' : 'secondary'}
          size="sm"
          onPress={() => setActiveTab('load')}
          className="flex-1"
          accessibilityLabel={t('menu.load')}
        >
          {t('menu.load')}
        </Button>
        <Button
          variant={activeTab === 'save' ? 'primary' : 'secondary'}
          size="sm"
          onPress={() => setActiveTab('save')}
          className="flex-1"
          accessibilityLabel={t('menu.save')}
        >
          {t('menu.save')}
        </Button>
      </View>

      {activeTab === 'load' && autoSaveSlot && (
        <View className="mb-4">
          <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
            ⚡ {t('save.autosave')}
          </Text>
          <AutoSaveSlot
            slot={autoSaveSlot}
            colors={colors}
            t={t}
            onLoad={handleLoadFromSlot}
            onDelete={handleDeleteSlot}
          />
        </View>
      )}

      <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
        💾 {t('save.manual')}
      </Text>

      <FlatList
        data={slots}
        renderItem={renderSlot}
        keyExtractor={(_, index) => `slot-${index}`}
        scrollEnabled={true}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </ScreenContainer>
  );
}
