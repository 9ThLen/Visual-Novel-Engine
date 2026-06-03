/**
 * components/editor/properties/TextPropertiesForm.tsx
 * Form for `text` (narration) block — content + anchor + typewriter speed.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function TextPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
}: PropertiesFormProps<'text'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.content')} colors={colors} error={missingFields.has('Content')}>
        <TextInput
          value={d.content || ''}
          onChangeText={(v) => u('content', v)}
          placeholder={t('editor.properties.enterNarration')}
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          style={[S(colors, missingFields.has('Content')), { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </Field>
      <Field t={t} label={t('editor.properties.anchorTo')} colors={colors}>
        <OptBtns
          options={['background', 'character']}
          value={d.anchorTo}
          onChange={(v) => u('anchorTo', v as typeof d.anchorTo)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.typewriterSpeed')} colors={colors}>
        <TextInput
          value={String(d.typewriterSpeed || 0.5)}
          onChangeText={(v) => u('typewriterSpeed', parseFloat(v) || 0.5)}
          placeholder="0.5"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
