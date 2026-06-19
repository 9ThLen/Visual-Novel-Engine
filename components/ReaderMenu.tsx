import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { buttonFeedback } from '@/lib/ui-feedback';
import { useI18n } from '@/hooks/use-i18n';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

interface ReaderMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function ReaderMenu({ visible, onClose }: ReaderMenuProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const menuWidth = Math.min(320, screenWidth - 32);

  if (!visible) return null;

  const leaveReader = () => {
    onClose();
    void stopReaderPlayback();
  };

  const menuItems = [
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
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? colors.hover : colors.surfaceElevated },
              ]}
            onPress={() => {
              buttonFeedback();
              item.action();
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
