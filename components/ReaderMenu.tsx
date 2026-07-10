import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { buttonFeedback } from '@/lib/ui-feedback';
import { showToast } from '@/lib/toast-store';
import { useI18n } from '@/hooks/use-i18n';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { getQuickSaveSlotId } from '@/stores/app-store-slices/saves-slice';
import { useAppStore } from '@/stores/use-app-store';

interface ReaderMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Called after a load replaces playback state so route-local history can be discarded. */
  onPlaybackReplaced?: () => void;
}

interface ReaderMenuItem {
  label: string;
  icon: IconSymbolName;
  action: () => void | Promise<void>;
  disabled?: boolean;
}

export function ReaderMenu({ visible, onClose, onPlaybackReplaced }: ReaderMenuProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const menuWidth = Math.min(320, screenWidth - 32);
  const currentStoryId = useAppStore((state) => state.currentStoryId);
  const playbackState = useAppStore((state) => state.playbackState);
  const saveSlots = useAppStore((state) => state.saveSlots);
  const saveGame = useAppStore((state) => state.saveGame);
  const loadGame = useAppStore((state) => state.loadGame);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);

  const activeStoryId = playbackState?.storyId ?? currentStoryId;
  const quickSlotId = activeStoryId ? getQuickSaveSlotId(activeStoryId) : null;
  const quickSaveSlot = quickSlotId
    ? saveSlots.find((slot) => slot.id === quickSlotId) ?? null
    : null;

  if (!visible) return null;

  const leaveReader = () => {
    onClose();
    void stopReaderPlayback();
  };

  const handleQuickSave = async () => {
    if (!activeStoryId || !playbackState) {
      showToast(t('save.noActiveStory'), 'error');
      return;
    }

    try {
      await hydrateSceneRecordsForStory(activeStoryId);
      const saved = saveGame(getQuickSaveSlotId(activeStoryId));
      if (!saved) {
        showToast(t('common.error'), 'error');
        return;
      }
      showToast(t('save.success'), 'success');
      onClose();
    } catch {
      showToast(t('common.error'), 'error');
    }
  };

  const handleQuickLoad = async () => {
    if (!quickSaveSlot) return;

    try {
      await hydrateSceneRecordsForStory(quickSaveSlot.storyId);
      const loaded = loadGame(quickSaveSlot.id);
      if (!loaded) {
        showToast(t('common.error'), 'error');
        return;
      }
      onPlaybackReplaced?.();
      showToast(t('save.loadSuccess'), 'success');
      onClose();
      void stopReaderPlayback();
      router.replace({
        pathname: '/reader',
        params: { storyId: quickSaveSlot.storyId, resume: '1' },
      });
    } catch {
      showToast(t('common.error'), 'error');
    }
  };

  const menuItems: ReaderMenuItem[] = [
    { label: t('reader.quickSave'), icon: 'save', action: handleQuickSave },
    { label: t('reader.quickLoad'), icon: 'load', action: handleQuickLoad, disabled: !quickSaveSlot },
    { label: t('reader.saveLoad'), icon: 'save' as IconSymbolName, action: () => { leaveReader(); router.push('../save-load'); } },
    { label: t('menu.settings'), icon: 'settings' as IconSymbolName, action: () => { leaveReader(); router.push('../settings'); } },
    {
      label: t('menu.home'),
      icon: 'home' as IconSymbolName,
      action: () => {
        leaveReader();
        router.replace('/tabs');
      },
    },
    { label: t('menu.close'), icon: 'close' as IconSymbolName, action: onClose },
  ];

  return (
    <>
      <Pressable
        style={[styles.overlay, { backgroundColor: colors.backdrop }]}
        onPress={onClose}
      />
      <View
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: [{ translateX: -(Math.min(320, screenWidth - 32) / 2) }, { translateY: -200 }],
          zIndex: 100,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          width: menuWidth,
          elevation: 8,
          backgroundColor: colors.dialogueBg,
          borderColor: colors.border,
        }}
      >
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            disabled={item.disabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: item.disabled }}
            style={({ pressed }) => [
              styles.menuItem,
              {
                backgroundColor: pressed && !item.disabled ? colors.hover : colors.surfaceElevated,
                opacity: item.disabled ? 0.45 : 1,
              },
            ]}
            onPress={() => {
              void buttonFeedback();
              void item.action();
            }}
          >
            <IconSymbol name={item.icon} size={18} color={colors.foreground} />
            <Text style={[styles.menuItemText, { color: colors.foreground }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  },
  menuContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -160 }, { translateY: -200 }],
    zIndex: 100,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    width: 320,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginBottom: 4,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
