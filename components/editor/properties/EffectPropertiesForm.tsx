/**
 * components/editor/properties/EffectPropertiesForm.tsx
 * Form for `effect` block — effect type + target + intensity + duration.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function EffectPropertiesForm({
  data: d,
  upd: u,
  colors,
  t,
}: PropertiesFormProps<'effect'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.effectType')} colors={colors}>
        <OptBtns
          options={['shake', 'flash', 'blur', 'rain', 'snow', 'glitch', 'vignette']}
          value={d.effectType}
          onChange={(v) => u('effectType', v as typeof d.effectType)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.target')} colors={colors}>
        <OptBtns
          options={['screen', 'character', 'background']}
          value={d.target}
          onChange={(v) => u('target', v as typeof d.target)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.intensity')} colors={colors}>
        <TextInput
          value={String(d.intensity || 50)}
          onChangeText={(v) => u('intensity', parseInt(v) || 50)}
          placeholder="50"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
        <TextInput
          value={String(d.duration || 0.5)}
          onChangeText={(v) => u('duration', parseFloat(v) || 0.5)}
          placeholder="0.5"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
