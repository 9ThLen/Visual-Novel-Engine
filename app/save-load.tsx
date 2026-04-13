import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { SaveSlot } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

export default function SaveLoadScreen() {
  const router = useRouter();
  const colors = useColors();
  const { saveSlots, saveGame, loadGame, deleteGame, currentStory, playbackState } = useStory();
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load');
  const { t } = useI18n();

  const handleSaveToSlot = async (slotId: string) => {
    if (!currentStory || !playbackState) {
      Alert.alert(t('common.error'), 'No active story to save');
      return;
    }

    await saveGame(slotId);
    Alert.alert(t('common.success'), t('save.success'));
  };

  const handleLoadFromSlot = async (slotId: string) => {
    await loadGame(slotId);
    Alert.alert(t('common.success'), t('save.loadSuccess'));
    router.back();
  };

  const handleDeleteSlot = (slotId: string) => {
    Alert.alert(t('save.delete'), t('save.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('save.delete'),
        style: 'destructive',
        onPress: () => deleteGame(slotId),
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
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

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const renderSaveSlot = ({ item, index }: { item: SaveSlot | null; index: number }) => {
    const slotId = `slot-${index + 1}`;
    const isEmpty = item === null;

    return (
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {/* Thumbnail Preview */}
        {!isEmpty && item.thumbnailUri ? (
          <View style={{ position: 'relative' }}>
            <Image
              source={{ uri: item.thumbnailUri }}
              style={{
                width: '100%',
                height: 120,
                backgroundColor: colors.background,
              }}
              resizeMode="cover"
            />
            {/* Gradient overlay */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 60,
                backgroundColor: 'rgba(0,0,0,0.6)',
              }}
            />
            {/* Slot number badge */}
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                #{index + 1}
              </Text>
            </View>
            {/* Timestamp */}
            <View
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                right: 8,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: '600',
                }}
              >
                {formatDate(item.timestamp)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={{
              height: 120,
              backgroundColor: colors.background,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 48, opacity: 0.3 }}>💾</Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.muted,
                marginTop: 8,
                fontWeight: '600',
              }}
            >
              {t('save.empty')} {index + 1}
            </Text>
          </View>
        )}

        {/* Content */}
        <View style={{ padding: 12 }}>
          {!isEmpty ? (
            <View style={{ gap: 6, marginBottom: 12 }}>
              {/* Story title */}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.foreground,
                }}
                numberOfLines={1}
              >
                {item.storyTitle || item.storyId}
              </Text>

              {/* Scene preview text */}
              {item.sceneText && (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    lineHeight: 16,
                  }}
                  numberOfLines={2}
                >
                  {item.sceneText}
                </Text>
              )}

              {/* Scene ID */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
                  📍 {item.sceneName || item.sceneId}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  • {item.choicesMade.length} choices
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                {t('save.noData')}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
            }}
          >
            {activeTab === 'save' && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => handleSaveToSlot(slotId)}
                style={{ flex: 1 }}
              >
                💾 {isEmpty ? t('save.saveHere') : t('save.overwrite')}
              </Button>
            )}

            {activeTab === 'load' && !isEmpty && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => handleLoadFromSlot(slotId)}
                style={{ flex: 1 }}
              >
                📂 Load
              </Button>
            )}

            {!isEmpty && (
              <Button
                variant="outline"
                size="sm"
                onPress={() => handleDeleteSlot(slotId)}
                style={{ borderColor: colors.error }}
                textStyle={{ color: colors.error }}
              >
                🗑
              </Button>
            )}
          </View>
        </View>
      </View>
    );
  };

  // Create array of 10 slots (filled or empty)
  const slots: (SaveSlot | null)[] = Array.from({ length: 10 }, (_, i) => {
    return saveSlots.find((s) => s.id === `slot-${i + 1}`) || null;
  });

  // Get autosave slot
  const autoSaveSlot = saveSlots.find((s) => s.id === 'autosave');

  return (
    <ScreenContainer className="p-4">
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: colors.foreground,
          }}
        >
          {activeTab === 'save' ? t('save.title') : t('load.title')}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.back()}
        >
          {t('menu.back')}
        </Button>
      </View>

      {/* Tab Buttons */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Button
          variant={activeTab === 'load' ? 'primary' : 'secondary'}
          size="sm"
          onPress={() => setActiveTab('load')}
          style={{ flex: 1 }}
        >
          {t('menu.load')}
        </Button>
        <Button
          variant={activeTab === 'save' ? 'primary' : 'secondary'}
          size="sm"
          onPress={() => setActiveTab('save')}
          style={{ flex: 1 }}
        >
          {t('menu.save')}
        </Button>
      </View>

      {/* Auto-save slot (only in load tab) */}
      {activeTab === 'load' && autoSaveSlot && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: colors.muted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            ⚡ {t('save.autosave')}
          </Text>
          {renderSaveSlot({ item: autoSaveSlot, index: -1 })}
        </View>
      )}

      {/* Manual saves header */}
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: colors.muted,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        💾 {t('save.manual')}
      </Text>

      {/* Save Slots List */}
      <FlatList
        data={slots}
        renderItem={({ item, index }) => renderSaveSlot({ item, index })}
        keyExtractor={(_, index) => `slot-${index}`}
        scrollEnabled={true}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </ScreenContainer>
  );
}
