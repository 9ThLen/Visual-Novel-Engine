import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useAppStore } from '@/stores/use-app-store';
import { useColors } from '@/hooks/use-colors';
import { SaveSlot } from '@/lib/story-domain';
import { useI18n, type Language } from '@/hooks/use-i18n';
import { formatDate, formatRelativeTime } from '@/lib/format-date';
import { Button, ConfirmDialog, IconSymbol } from '@/components/ui';
import {
  describeSaveCompatibility,
  needsSaveCompatibilityWarning,
  type SaveCompatibility,
} from '@/lib/release/save-compatibility';
import { showToast } from '@/lib/toast-store';
import { typeScale } from '@/lib/design-tokens';
import { isQuickSaveSlotId } from '@/stores/app-store-slices/saves-slice';
import { ShowcaseImage } from '@/components/showcase/ShowcaseImage';

/** What to tell the reader about a save that no longer fits. */
function describeMismatch(
  compatibility: SaveCompatibility,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (compatibility.kind === 'missingScene') return t('save.missingSceneMessage');
  if (compatibility.kind === 'otherVersion') {
    return compatibility.savedVersion
      ? t('save.versionMismatchMessage', {
          saved: compatibility.savedVersion,
          current: compatibility.currentVersion,
        })
      : t('save.versionUnknownMessage', { current: compatibility.currentVersion });
  }
  return '';
}

function ReservedSaveSlot({ slot, slotId, label, colors, t, language, onLoad, onDelete }: {
  slot: SaveSlot;
  slotId: string;
  label: string;
  colors: ReturnType<typeof useColors>;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  language: Language;
  onLoad: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' }]}>
      {slot.thumbnailUri ? (
        <View className="relative">
          <ShowcaseImage assetRef={slot.thumbnailUri} className="w-full h-28"
            style={{ backgroundColor: colors.background }} resizeMode="cover" />
          <View
            className="absolute bottom-0 left-0 right-0 h-15"
            style={{ backgroundColor: colors.backdrop }}
          />
          <View className="absolute bottom-2 left-2 right-2">
            <Text style={{ color: colors['text-inverse'], fontSize: 12, fontWeight: '600' }}>
              {formatDate(slot.timestamp, language)}
            </Text>
          </View>
        </View>
      ) : (
        <View className="h-28 items-center justify-center" style={{ backgroundColor: colors.background }}>
          <IconSymbol name="save" size={48} color={colors.muted} style={{ opacity: 0.3 }} />
        </View>
      )}
      <View className="p-3">
        <View className="gap-1.5 mb-3">
          <Text style={[{ color: colors.primary }, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }]}>
            {label}
          </Text>
          <Text style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: 'bold' }]} numberOfLines={1}>
            {slot.storyTitle || slot.storyId}
          </Text>
          {slot.sceneText ? (
            <Text style={[{ color: colors.muted }, { fontSize: 12, lineHeight: 16 }]} numberOfLines={2}>{slot.sceneText}</Text>
          ) : null}
          <Text style={[{ color: colors.primary }, { fontSize: 12, fontWeight: '600' }]}>
            {slot.sceneName || slot.sceneId}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            variant="primary"
            size="sm"
            onPress={() => onLoad(slotId)}
            className="flex-1"
            accessibilityLabel={t('save.loadSlotLabel', { slot: label })}
            icon={<IconSymbol name="load" size={16} color={colors['text-inverse']} />}
          >
            {t('save.loadButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => onDelete(slotId)}
            style={{ borderColor: colors.error }}
            textStyle={{ color: colors.error }}
            accessibilityLabel={t('save.deleteSlotLabel', { slot: label })}
            icon={<IconSymbol name="delete" size={16} color={colors.error} />}
          >
            {t('common.delete')}
          </Button>
        </View>
      </View>
    </View>
  );
}

export default function SaveLoadScreen() {
  const router = useRouter();
  const { saveBlocked } = useLocalSearchParams<{ saveBlocked?: string | string[] }>();
  useFocusEffect(
    useCallback(() => {
      return () => {
        void stopReaderPlayback();
      };
    }, []),
  );
  const colors = useColors();
  const saveSlots = useAppStore((state) => state.saveSlots);
  const currentStoryId = useAppStore((state) => state.currentStoryId);
  const playbackState = useAppStore((state) => state.playbackState);
  const saveGame = useAppStore((state) => state.saveGame);
  const readerBlockingMedia = useAppStore((state) => state.readerBlockingMedia);
  const loadGame = useAppStore((state) => state.loadGame);
  const readerRelease = useAppStore((state) => state.readerRelease);
  const [pendingLoad, setPendingLoad] = useState<{
    slotId: string;
    compatibility: SaveCompatibility;
  } | null>(null);
  const deleteSaveSlot = useAppStore((state) => state.deleteSaveSlot);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('load');
  const [slotIdToDelete, setSlotIdToDelete] = useState<string | null>(null);
  const { t, language } = useI18n();
  const saveBlockedByCutscene = readerBlockingMedia !== null
    || (Array.isArray(saveBlocked) ? saveBlocked.includes('cutscene') : saveBlocked === 'cutscene');

  const handleSaveToSlot = useCallback(async (slotId: string) => {
    if (saveBlockedByCutscene) {
      showToast(t('save.blockedByCutscene'), 'info');
      return;
    }
    if (!currentStoryId || !playbackState) {
      showToast(t('save.noActiveStory'), 'error');
      return;
    }
    try {
      await hydrateSceneRecordsForStory(currentStoryId);
      const saved = saveGame(slotId);
      if (!saved) {
        showToast(t('common.error'), 'error');
        return;
      }
      showToast(t('save.success'), 'success');
    } catch {
      showToast(t('common.error'), 'error');
    }
  }, [currentStoryId, playbackState, hydrateSceneRecordsForStory, saveBlockedByCutscene, saveGame, t]);

  /** Load without asking; the caller has already resolved any mismatch. */
  const loadSlotNow = useCallback(async (slotId: string) => {
    const slot = saveSlots.find((s) => s.id === slotId);
    if (!slot) return;

    try {
      await hydrateSceneRecordsForStory(slot.storyId);
      const loaded = loadGame(slotId);
      if (!loaded) {
        showToast(t('common.error'), 'error');
        return;
      }
      showToast(t('save.loadSuccess'), 'success');
      router.replace({
        pathname: '/reader',
        params: { storyId: slot.storyId, resume: '1' },
      });
    } catch {
      showToast(t('common.error'), 'error');
    }
  }, [saveSlots, hydrateSceneRecordsForStory, loadGame, router, t]);

  /**
   * A published story moves. Before dropping a reader back into a save taken
   * in a different version — or onto a scene that version no longer has — say
   * so and let them choose. Same version, or no release at all: load straight
   * through, because there is nothing to warn about.
   */
  const handleLoadFromSlot = useCallback(async (slotId: string) => {
    const slot = saveSlots.find((s) => s.id === slotId);
    if (!slot) return;

    const compatibility = describeSaveCompatibility({
      slot,
      release: readerRelease && readerRelease.storyId === slot.storyId
        ? {
            releaseId: readerRelease.releaseId,
            version: readerRelease.version,
            sceneIds: Object.keys(readerRelease.scenes),
          }
        : null,
    });

    if (needsSaveCompatibilityWarning(compatibility)) {
      setPendingLoad({ slotId, compatibility });
      return;
    }
    await loadSlotNow(slotId);
  }, [loadSlotNow, readerRelease, saveSlots]);

  const handleDeleteSlot = useCallback((slotId: string) => {
    setSlotIdToDelete(slotId);
  }, []);

  const confirmDeleteSlot = useCallback(() => {
    if (!slotIdToDelete) return;
    deleteSaveSlot(slotIdToDelete);
    setSlotIdToDelete(null);
  }, [deleteSaveSlot, slotIdToDelete]);

  const formatSaveTimestamp = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return formatRelativeTime(-diffMins, 'minute', language);
    if (diffHours < 24) return formatRelativeTime(-diffHours, 'hour', language);
    if (diffDays < 7) return formatRelativeTime(-diffDays, 'day', language);

    return formatDate(date, language, {
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
            <ShowcaseImage
              assetRef={item.thumbnailUri}
              className="w-full h-28"
              style={{ backgroundColor: colors.background }}
              resizeMode="cover"
            />
            <View
              className="absolute bottom-0 left-0 right-0 h-15"
              style={{ backgroundColor: colors.backdrop }}
            />
            <View
              className="absolute top-2 left-2 rounded-lg px-2.5 py-1"
              style={{ backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors['text-inverse'], fontSize: 12, fontWeight: '700' }}>
                #{index + 1}
              </Text>
            </View>
            <View className="absolute bottom-2 left-2 right-2">
              <Text style={{ color: colors['text-inverse'], fontSize: 12, fontWeight: '600' }}>
                {formatSaveTimestamp(item.timestamp)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            className="h-28 items-center justify-center"
            style={{ backgroundColor: colors.background }}
          >
            <IconSymbol name="save" size={48} color={colors.muted} style={{ opacity: 0.3 }} />
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
                  {item.sceneName || item.sceneId}
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
                icon={<IconSymbol name="save" size={16} color={colors['text-inverse']} />}
              >
                {isEmpty ? t('save.saveHere') : t('save.overwrite')}
              </Button>
            )}
            {activeTab === 'load' && !isEmpty && (
              <Button
                variant="primary"
                size="sm"
                onPress={() => handleLoadFromSlot(slotId)}
                className="flex-1"
                accessibilityLabel={t('save.loadSlotLabel', { slot: index + 1 })}
                icon={<IconSymbol name="load" size={16} color={colors['text-inverse']} />}
              >
                {t('save.loadButton')}
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
                icon={<IconSymbol name="delete" size={16} color={colors.error} />}
              >
                {t('common.delete')}
              </Button>
            )}
          </View>
        </View>
      </View>
    );
  }, [activeTab, colors, t, formatSaveTimestamp, handleSaveToSlot, handleLoadFromSlot, handleDeleteSlot]);

  const slots = useMemo<(SaveSlot | null)[]>(
    () => Array.from({ length: 10 }, (_, i) =>
      saveSlots.find((s) => s.id === `slot-${i + 1}`) || null
    ),
    [saveSlots]
  );

  const autoSaveSlot = saveSlots.find((s) => s.id === 'autosave');
  const quickSaveSlots = useMemo(
    () => saveSlots
      .filter((slot) => isQuickSaveSlotId(slot.id))
      .sort((a, b) => b.timestamp - a.timestamp),
    [saveSlots],
  );

  const renderSlot = useCallback(
    ({ item, index }: { item: SaveSlot | null; index: number }) => renderSaveSlot({ item, index }),
    [renderSaveSlot]
  );

  return (
    <ScreenContainer className="p-4">
      <View className="flex-row justify-between items-center mb-5">
        <Text style={[{ color: colors.foreground }, typeScale.sectionTitle]}>
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
          disabled={saveBlockedByCutscene}
          className="flex-1"
          accessibilityLabel={t('menu.save')}
        >
          {t('menu.save')}
        </Button>
      </View>

      {saveBlockedByCutscene ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>
          {t('save.blockedByCutscene')}
        </Text>
      ) : null}

      {activeTab === 'load' && quickSaveSlots.length > 0 && (
        <View className="mb-4">
          <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
            {t('save.quickSave')}
          </Text>
          {quickSaveSlots.map((slot) => (
            <ReservedSaveSlot
              key={slot.id}
              slot={slot}
              slotId={slot.id}
              label={t('save.quickSave')}
              colors={colors}
              t={t}
              language={language}
              onLoad={handleLoadFromSlot}
              onDelete={handleDeleteSlot}
            />
          ))}
        </View>
      )}

      {activeTab === 'load' && autoSaveSlot && (
        <View className="mb-4">
          <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
            {t('save.autosave')}
          </Text>
          <ReservedSaveSlot
            slot={autoSaveSlot}
            slotId="autosave"
            label={t('save.autosave')}
            colors={colors}
            t={t}
            language={language}
            onLoad={handleLoadFromSlot}
            onDelete={handleDeleteSlot}
          />
        </View>
      )}

      <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }]}>
        {t('save.manual')}
      </Text>

      <FlatList
        data={slots}
        renderItem={renderSlot}
        keyExtractor={(_, index) => `slot-${index}`}
        scrollEnabled={true}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <ConfirmDialog
        visible={pendingLoad !== null}
        title={t('save.versionMismatchTitle')}
        message={pendingLoad ? describeMismatch(pendingLoad.compatibility, t) : ''}
        confirmLabel={t('save.loadAnyway')}
        onConfirm={() => {
          const slotId = pendingLoad?.slotId;
          setPendingLoad(null);
          if (slotId) void loadSlotNow(slotId);
        }}
        onCancel={() => setPendingLoad(null)}
        destructive={false}
      />
      <ConfirmDialog
        visible={slotIdToDelete !== null}
        title={t('save.delete')}
        message={t('save.deleteConfirm')}
        confirmLabel={t('save.delete')}
        onConfirm={confirmDeleteSlot}
        onCancel={() => setSlotIdToDelete(null)}
        destructive
      />
    </ScreenContainer>
  );
}
