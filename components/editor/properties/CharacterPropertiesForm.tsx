/**
 * components/editor/properties/CharacterPropertiesForm.tsx
 * Form for `character` block — character + sprite + position + transitions.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function CharacterPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
  renderAssetField,
}: PropertiesFormProps<'character'>) {
  return (
    <>
      {renderAssetField
        ? renderAssetField(t('editor.properties.character'), 'characters', d.characterId, (v) =>
            u('characterId', v),
          )
        : (
            <Field t={t} label={t('editor.properties.character')} colors={colors} error={missingFields.has('Character')}>
              <TextInput
                value={d.characterId || ''}
                onChangeText={(v) => u('characterId', v)}
                placeholder={t('editor.properties.selectCharacter')}
                placeholderTextColor={colors.muted}
                style={S(colors, missingFields.has('Character'))}
              />
            </Field>
          )}
      {renderAssetField
        ? renderAssetField(t('editor.properties.sprite'), 'sprites', d.spriteId, (v) =>
            u('spriteId', v),
          )
        : (
            <Field t={t} label={t('editor.properties.sprite')} colors={colors}>
              <TextInput
                value={d.spriteId || ''}
                onChangeText={(v) => u('spriteId', v)}
                placeholder={t('editor.properties.selectSprite')}
                placeholderTextColor={colors.muted}
                style={S(colors)}
              />
            </Field>
          )}
      <Field t={t} label={t('editor.properties.position')} colors={colors}>
        <OptBtns
          options={['far-left', 'left', 'center', 'right', 'far-right']}
          value={d.position}
          onChange={(v) => u('position', v as typeof d.position)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.entrance')} colors={colors}>
        <OptBtns
          options={['instant', 'fade', 'slide-left', 'slide-right', 'zoom']}
          value={d.transition}
          onChange={(v) => u('transition', v as typeof d.transition)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.delaySeconds')} colors={colors}>
        <TextInput
          value={String(d.delay || 0)}
          onChangeText={(v) => u('delay', parseFloat(v) || 0)}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
        <TextInput
          value={d.duration ? String(d.duration) : ''}
          onChangeText={(v) => u('duration', v ? parseFloat(v) : null)}
          placeholder={t('editor.properties.emptyPermanent')}
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
