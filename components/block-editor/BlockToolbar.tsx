import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface BlockToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  blockCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  colors: {
    foreground: string;
    background: string;
    surface: string;
    border: string;
    muted: string;
    primary: string;
  };
}

export const BlockToolbar: React.FC<BlockToolbarProps> = ({
  canUndo,
  canRedo,
  blockCount,
  onUndo,
  onRedo,
  onSave,
  colors,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}
  >
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          backgroundColor: canUndo ? colors.background : colors.surface,
          borderWidth: 1,
          borderColor: canUndo ? colors.border : 'transparent',
          opacity: canUndo ? 1 : 0.4,
        }}
      >
        <Text style={{ fontSize: 14 }}>↩</Text>
      </Pressable>
      <Pressable
        onPress={onRedo}
        disabled={!canRedo}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          backgroundColor: canRedo ? colors.background : colors.surface,
          borderWidth: 1,
          borderColor: canRedo ? colors.border : 'transparent',
          opacity: canRedo ? 1 : 0.4,
        }}
      >
        <Text style={{ fontSize: 14 }}>↪</Text>
      </Pressable>
    </View>

    <Text style={{ fontSize: 12, color: colors.muted }}>
      {blockCount} {blockCount === 1 ? 'block' : 'blocks'}
    </Text>

    <Pressable
      onPress={onSave}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: colors.primary,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Save</Text>
    </Pressable>
  </View>
);
