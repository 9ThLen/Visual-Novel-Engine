/**
 * components/editor/modals/CharacterCreator.tsx — Modal for creating characters
 *
 * Form: name, color picker, voice selector, sprite upload slots.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { generateId } from '@/lib/id-utils';
import type { Character } from '@/lib/character-types';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface CharacterCreatorProps {
  visible: boolean;
  onClose: () => void;
  onSave: (character: Character) => void;
  editCharacter?: Character | null;
}

const COLOR_TOKEN_KEYS = [
  'lego-audio',
  'lego-character',
  'lego-fx',
  'lego-background',
  'lego-choice',
  'primary',
  'danger',
  'muted',
  'info',
  'warning',
] as const;

const VOICE_OPTIONS = [
  { key: 'male', labelKey: 'character.voice.male' },
  { key: 'female', labelKey: 'character.voice.female' },
  { key: 'none', labelKey: 'character.voice.none' },
] as const;

type VoiceOptionKey = (typeof VOICE_OPTIONS)[number]['key'];

export function CharacterCreator({
  visible,
  onClose,
  onSave,
  editCharacter,
}: CharacterCreatorProps) {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const colorPalette = useMemo(
    () => COLOR_TOKEN_KEYS.map((key) => ({ key, value: colors[key] ?? colors.primary })),
    [colors]
  );
  const spriteById = useMemo(
    () => new Map((editCharacter?.sprites ?? []).map((sprite) => [sprite.id, sprite])),
    [editCharacter?.sprites]
  );

  const [name, setName] = useState(editCharacter?.name || '');
  const [selectedColor, setSelectedColor] = useState(
    editCharacter?.sprites?.[0]?.tags?.find((item) => item.startsWith('#')) || colorPalette[0].value
  );
  const [voice, setVoice] = useState<VoiceOptionKey>('none');
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
        name: spriteById.get(id)?.name || t('character.spriteSlotName', { number: i + 1 }),
        uri: spriteById.get(id)?.uri || '',
        tags: [selectedColor],
        createdAt: spriteById.get(id)?.createdAt || Date.now(),
      })),
      defaultSpriteId: spriteSlots[0] || undefined,
      createdAt: editCharacter?.createdAt || Date.now(),
    };

    onSave(character);
    onClose();
    // Reset form
    setName('');
    setSelectedColor(colorPalette[0].value);
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
          backgroundColor: colors['surface-container'],
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
              {editCharacter ? t('character.edit') : t('character.create')}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
              <IconSymbol name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                {t('character.name')}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('character.namePlaceholder')}
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
                {t('character.themeColor')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {colorPalette.map(({ key, value }) => (
                  <Pressable
                    key={key}
                    onPress={() => setSelectedColor(value)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: value,
                      borderWidth: selectedColor === value ? 3 : 0,
                      borderColor: colors.foreground,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('character.selectColor', { color: key })}
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
                {t('character.voice')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {VOICE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setVoice(opt.key)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: voice === opt.key ? colors.primary : colors.background,
                      borderWidth: 1,
                      borderColor: voice === opt.key ? colors.primary : colors.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t(opt.labelKey)}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: voice === opt.key ? colors['text-inverse'] : colors.foreground,
                    }}>
                      {t(opt.labelKey)}
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
                {t('character.sprites')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Pressable
                    key={i}
                    disabled
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
                    accessibilityLabel={spriteSlots[i]
                      ? t('character.spriteSlotLabel', { number: i + 1, name: spriteById.get(spriteSlots[i])?.name || t('character.spriteSlotName', { number: i + 1 }) })
                      : t('character.spritePickerUnavailable', { number: i + 1 })}
                  >
                    {spriteSlots[i] ? (
                      <Text style={{ fontSize: 10, color: colors.foreground }}>
                        {spriteById.get(spriteSlots[i])?.name || t('character.spriteSlotName', { number: i + 1 })}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', paddingHorizontal: 8 }}>
                        {t('character.spritePickerSoon')}
                      </Text>
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
              <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>
                {editCharacter ? t('character.saveChanges') : t('character.create')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
