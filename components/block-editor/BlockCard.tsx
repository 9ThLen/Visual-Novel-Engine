import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Block } from '../../lib/block-types';
import { getBlockEntry } from '../../lib/block-registry';

interface BlockCardProps {
  block: Block;
  isSelected: boolean;
  isDragging: boolean;
  isDropTargetBefore: boolean;
  isDropTargetAfter: boolean;
  onSelect: () => void;
  onDragStart: (e: any) => void;
  onPanGesture: any;
  colors: {
    foreground: string;
    background: string;
    surface: string;
    border: string;
    muted: string;
    primary: string;
  };
}

export const BlockCard: React.FC<BlockCardProps> = ({
  block,
  isSelected,
  isDragging,
  isDropTargetBefore,
  isDropTargetAfter,
  onSelect,
  onDragStart,
  onPanGesture,
  colors,
}) => {
  const entry = getBlockEntry(block.type);
  const summaryText = getSummaryText(block, entry);

  return (
    <View style={{ position: 'relative' }}>
      {isDropTargetBefore && (
        <View
          style={{
            height: 3,
            backgroundColor: colors.primary,
            borderRadius: 2,
            marginHorizontal: 8,
          }}
        />
      )}

      <Pressable
        onPress={onSelect}
        onLongPress={onDragStart}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 10,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? colors.primary : entry.borderColor,
          backgroundColor: isDragging ? entry.colorLight + '80' : entry.colorLight,
          marginHorizontal: 12,
          marginVertical: 4,
          opacity: isDragging ? 0.5 : 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isSelected ? 0.15 : 0.08,
          shadowRadius: 4,
          elevation: isSelected ? 3 : 1,
        }}
      >
        <View
          style={{
            width: 44,
            height: '100%',
            minHeight: 48,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: entry.color,
            borderRadius: 9,
            marginRight: 10,
          }}
        >
          <Text style={{ fontSize: 20 }}>{entry.icon}</Text>
        </View>

        <View style={{ flex: 1, paddingVertical: 8, paddingRight: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: entry.borderColor,
            }}
          >
            {entry.labelUa}
          </Text>
          {summaryText && (
            <Text
              style={{
                fontSize: 11,
                color: colors.muted,
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {summaryText}
            </Text>
          )}
        </View>

        {block.children && block.children.length > 0 && (
          <View
            style={{
              backgroundColor: entry.color + '40',
              borderRadius: 10,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '600', color: entry.borderColor }}>
              {block.children.length}
            </Text>
          </View>
        )}
      </Pressable>

      {isDropTargetAfter && (
        <View
          style={{
            height: 3,
            backgroundColor: colors.primary,
            borderRadius: 2,
            marginHorizontal: 8,
          }}
        />
      )}
    </View>
  );
};

function getSummaryText(block: Block, entry: any): string {
  const d = block.data;
  switch (block.type) {
    case 'dialogue':
      return d.character ? `${d.character}: ${d.text?.slice(0, 40) || ''}` : d.text?.slice(0, 50) || '';
    case 'narration':
      return d.text?.slice(0, 60) || '';
    case 'show_character':
      return `Show ${d.characterId || '???'} at ${d.position || 'center'}`;
    case 'hide_character':
      return `Hide ${d.characterId || '???'}`;
    case 'character_animation':
      return `${d.characterId || '???'} ${d.animation || 'shake'}`;
    case 'set_background':
      return d.backgroundUri ? `BG: ${d.backgroundUri.split('/').pop()}` : 'No background set';
    case 'play_music':
      return d.musicUri ? `Music: ${d.musicUri.split('/').pop()}` : 'No music set';
    case 'play_sfx':
      return d.sfxUri ? `SFX: ${d.sfxUri.split('/').pop()}` : 'No SFX set';
    case 'play_voice':
      return d.voiceUri ? `Voice: ${d.voiceUri.split('/').pop()}` : 'No voice set';
    case 'choice':
      return d.text || 'No choice text';
    case 'condition':
      return `${d.variable || '?'} ${d.operator || ''} ${d.value || ''}`;
    case 'set_variable':
      return `${d.variable || '?'} = ${d.value || ''}`;
    case 'transition':
      return `${d.type || 'fade'} ${d.duration || 500}ms`;
    case 'wait':
      return `${d.duration || 1000}ms`;
    case 'group':
      return d.title || 'Group';
    default:
      return '';
  }
}
