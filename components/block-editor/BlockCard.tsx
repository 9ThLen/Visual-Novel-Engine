import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Block, getDialogueData, getNarrationData, getShowCharacterData, getHideCharacterData, getCharacterAnimationData, getSetBackgroundData, getPlayMusicData, getPlaySfxData, getPlayVoiceData, getChoiceData, getConditionData, getSetVariableData, getTransitionData, getWaitData, getGroupData } from '../../lib/block-types';
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

export const BlockCard = React.memo(({
  block,
  isSelected,
  isDragging,
  isDropTargetBefore,
  isDropTargetAfter,
  onSelect,
  onDragStart,
  onPanGesture,
  colors,
}: BlockCardProps) => {
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
  switch (block.type) {
    case 'dialogue': {
      const d = getDialogueData(block);
      return d ? `${d.character}: ${d.text.slice(0, 40)}` : '';
    }
    case 'narration': {
      const d = getNarrationData(block);
      return d ? d.text.slice(0, 60) : '';
    }
    case 'show_character': {
      const d = getShowCharacterData(block);
      return d ? `Show ${d.characterId || '???'} at ${d.position || 'center'}` : '';
    }
    case 'hide_character': {
      const d = getHideCharacterData(block);
      return d ? `Hide ${d.characterId || '???'}` : '';
    }
    case 'character_animation': {
      const d = getCharacterAnimationData(block);
      return d ? `${d.characterId || '???'} ${d.animation || 'shake'}` : '';
    }
    case 'set_background': {
      const d = getSetBackgroundData(block);
      return d ? (d.backgroundUri ? `BG: ${d.backgroundUri.split('/').pop()}` : 'No background set') : '';
    }
    case 'play_music': {
      const d = getPlayMusicData(block);
      return d ? (d.musicUri ? `Music: ${d.musicUri.split('/').pop()}` : 'No music set') : '';
    }
    case 'play_sfx': {
      const d = getPlaySfxData(block);
      return d ? (d.sfxUri ? `SFX: ${d.sfxUri.split('/').pop()}` : 'No SFX set') : '';
    }
    case 'play_voice': {
      const d = getPlayVoiceData(block);
      return d ? (d.voiceUri ? `Voice: ${d.voiceUri.split('/').pop()}` : 'No voice set') : '';
    }
    case 'choice': {
      const d = getChoiceData(block);
      return d ? d.text || 'No choice text' : '';
    }
    case 'condition': {
      const d = getConditionData(block);
      return d ? `${d.variable || '?'} ${d.operator || ''} ${d.value || ''}` : '';
    }
    case 'set_variable': {
      const d = getSetVariableData(block);
      return d ? `${d.variable || '?'} = ${d.value || ''}` : '';
    }
    case 'transition': {
      const d = getTransitionData(block);
      return d ? `${d.type || 'fade'} ${d.duration || 500}ms` : '';
    }
    case 'wait': {
      const d = getWaitData(block);
      return d ? `${d.duration || 1000}ms` : '';
    }
    case 'group': {
      const d = getGroupData(block);
      return d ? d.title || 'Group' : '';
    }
    default:
      return '';
  }
}
