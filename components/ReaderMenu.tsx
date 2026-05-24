import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/use-colors';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { buttonFeedback } from '@/lib/ui-feedback';

interface ReaderMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function ReaderMenu({ visible, onClose }: ReaderMenuProps) {
  const router = useRouter();
  const colors = useColors();

  if (!visible) return null;

  const leaveReader = () => {
    onClose();
    void stopReaderPlayback();
  };

  const menuItems = [
    { label: '💾 Save / Load', action: () => { leaveReader(); router.push('../save-load'); } },
    { label: '⚙️ Settings', action: () => { leaveReader(); router.push('../settings'); } },
    {
      label: '🏠 Home',
      action: () => {
        leaveReader();
        router.replace('/tabs');
      },
    },
    { label: '✕ Close menu', action: onClose },
  ];

  return (
    <>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
      />
      <View
        style={[
          styles.menuContainer,
          {
            backgroundColor: colors.dialogueBg ?? 'rgba(15, 14, 23, 0.95)',
            borderColor: colors.border,
          },
        ]}
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
