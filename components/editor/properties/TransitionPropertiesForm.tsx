/**
 * components/editor/properties/TransitionPropertiesForm.tsx
 * Form for `transition` block — target scene + transition type + duration.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function TransitionPropertiesForm({
  data: d,
  upd: u,
  colors,
  t,
}: PropertiesFormProps<'transition'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.targetScene')} colors={colors}>
        <TextInput
          value={d.targetSceneId || ''}
          onChangeText={(v) => u('targetSceneId', v || null)}
          placeholder={t('editor.properties.selectTargetScene')}
          placeholderTextColor={colors.muted}
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.transitionType')} colors={colors}>
        <OptBtns
          options={['fade', 'dissolve', 'slide-left', 'slide-right', 'slide-up', 'wipe']}
          value={d.transitionType}
          onChange={(v) => u('transitionType', v as typeof d.transitionType)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
        <TextInput
          value={String(d.duration || 1.0)}
          onChangeText={(v) => u('duration', parseFloat(v) || 1.0)}
          placeholder="1.0"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
