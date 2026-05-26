/**
 * components/editor/modals/CharacterCreator.tsx — Modal for creating characters
 *
 * Form: name, color picker, voice selector, sprite upload slots.
 */

import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/stores/use-app-store';
import { generateId } from '@/lib/id-utils';
import type { Character } from '@/lib/character-types';

interface CharacterCreatorProps {
  visible: boolean;
  onClose: () => void;
  onSave: (character: Character) => void;
  editCharacter?: Character | null;
}

const COLOR_PALETTE = [
  '#ff6b6b', '#f5a623', '#ffd93d', '#50c878',
  '#00bcd4', '#7c5bf5', '#e91e63', '#9e9e9e',
  '#3f51b5', '#ff9800',
];

const VOICE_OPTIONS = [
  { key: 'male', label: '♂ Male' },
  { key: 'female', label: '♀ Female' },
  { key: 'none', label: '— None' },
];

export function CharacterCreator({
  visible,
  onClose,
  onSave,
  editCharacter,
}: CharacterCreatorProps) {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const characterLibraries = useAppStore((s) => s.characterLibraries);

  const [name, setName] = useState(editCharacter?.name || '');
  const [selectedColor, setSelectedColor] = useState(
    editCharacter?.sprites?.[0]?.tags?.find((t) => t.startsWith('#')) || COLOR_PALETTE[0]
  );
  const [voice, setVoice] = useState<'male' | 'female' | 'none'>('none');
  const [spriteSlots, setSpriteSlots] = useState<string[]>(
    editCharacter?.sprites?.map((s) => s.id) || []
  );

  const handleSave = () => {
    if (!name.trim()) return;

    const character: Character = {
      id: editCharacter?.id || generateId('char'),
      name: name.trim(),
      sprites: spriteSlots.map((id, i) => ({
        id,
        name: `Sprite ${i + 1}`,
        uri: '',
        tags: [selectedColor],
        createdAt: Date.now(),
      })),
      defaultSpriteId: spriteSlots[0] || undefined,
      createdAt: editCharacter?.createdAt || Date.now(),
    };

    onSave(character);
    onClose();
    // Reset form
    setName('');
    setSelectedColor(COLOR_PALETTE[0]);
    setVoice('none');
    setSpriteSlots([]);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}>
        <View style={{
          width: '90%',
          maxWidth: 600,
          backgroundColor: colors['surface-container'] || colors.surface,
          borderRadius: 12,
          overflow: 'hidden',
          maxHeight: '85%',
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
              {editCharacter ? 'Edit Character' : 'Create Character'}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
              <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Character Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter character name..."
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                }}
              />
            </View>

            {/* Color */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Theme Color
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {COLOR_PALETTE.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: color,
                      borderWidth: selectedColor === color ? 3 : 0,
                      borderColor: colors.foreground,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('editor.selectAsset')} ${color}`}
                  />
                ))}
              </View>
            </View>

            {/* Voice */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Voice
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {VOICE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setVoice(opt.key as any)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: voice === opt.key ? colors.primary : colors.background,
                      borderWidth: 1,
                      borderColor: voice === opt.key ? colors.primary : colors.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: voice === opt.key ? colors['text-inverse'] ?? '#fff' : colors.foreground,
                    }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Sprites */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Sprites
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      // TODO: Open sprite picker
                    }}
                    style={{
                      width: 100,
                      height: 120,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: colors.border,
                      borderStyle: spriteSlots[i] ? 'solid' : 'dashed',
                      backgroundColor: colors.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('editor.dialogueText')} ${i + 1}`}
                  >
                    {spriteSlots[i] ? (
                      <Text style={{ fontSize: 10, color: colors.foreground }}>
                        {spriteIds[spriteSlots[i]] || 'Sprite'}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 20, color: colors.muted }}>+</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
          }}>
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!name.trim()}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: name.trim() ? colors.primary : colors.border,
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
            >
              <Text style={{ fontSize: 13, color: colors['text-inverse'] ?? '#fff', fontWeight: '600' }}>
                {editCharacter ? 'Save Changes' : 'Create Character'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Simple sprite ID → name mapping for UI
const spriteIds: Record<string, string> = {};
