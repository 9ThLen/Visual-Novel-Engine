/**
 * components/editor/properties/DialoguePropertiesForm.tsx
 * Form for `dialogue` block — list of speaker entries with character + text.
 */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Field, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function DialoguePropertiesForm({
  data: d,
  upd: u,
  colors,
  t,
  renderAssetField,
}: PropertiesFormProps<'dialogue'>) {
  return (
    <>
      {d.entries?.map((entry, i: number) => (
        <View
          key={entry.id || i}
          style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              textTransform: 'uppercase',
              color: colors.muted,
              marginBottom: 6,
            }}
          >
            {t('editor.properties.speaker', { number: i + 1 })}
          </Text>
          {renderAssetField
            ? renderAssetField(t('editor.properties.character'), 'characters', entry.characterId, (v) => {
                const e = [...d.entries];
                e[i] = { ...entry, characterId: v };
                u('entries', e);
              })
            : (
                <Field t={t} label={t('editor.properties.character')} colors={colors}>
                  <TextInput
                    value={entry.characterId || ''}
                    onChangeText={(v) => {
                      const e = [...d.entries];
                      e[i] = { ...entry, characterId: v };
                      u('entries', e);
                    }}
                    placeholder={t('editor.properties.selectCharacter')}
                    placeholderTextColor={colors.muted}
                    style={S(colors)}
                  />
                </Field>
              )}
          <Field t={t} label={t('editor.properties.text')} colors={colors}>
            <TextInput
              value={entry.text || ''}
              onChangeText={(v) => {
                const e = [...d.entries];
                e[i] = { ...entry, text: v };
                u('entries', e);
              }}
              placeholder={t('editor.properties.enterDialogue')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[S(colors), { minHeight: 60, textAlignVertical: 'top' }]}
            />
          </Field>
        </View>
      ))}
      <Pressable
        onPress={() =>
          u('entries', [
            ...(d.entries || []),
            { id: `e_${Date.now()}`, characterId: '', spriteId: '', text: '' },
          ])
        }
        style={{
          paddingVertical: 8,
          alignItems: 'center',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderStyle: 'dashed',
        }}
        accessibilityRole="button"
        accessibilityLabel={t('editor.dialogueText')}
      >
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
          {t('editor.properties.addSpeaker')}
        </Text>
      </Pressable>
    </>
  );
}
