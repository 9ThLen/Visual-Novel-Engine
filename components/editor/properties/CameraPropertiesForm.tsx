/**
 * components/editor/properties/CameraPropertiesForm.tsx
 * Form for `camera` block — action + zoom level + duration.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function CameraPropertiesForm({
  data: d,
  upd: u,
  colors,
  t,
}: PropertiesFormProps<'camera'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.action')} colors={colors}>
        <OptBtns
          options={['zoom', 'pan', 'focus', 'reset']}
          value={d.action}
          onChange={(v) => u('action', v as typeof d.action)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.zoomLevel')} colors={colors}>
        <TextInput
          value={String(d.zoomLevel || 1.0)}
          onChangeText={(v) => u('zoomLevel', parseFloat(v) || 1.0)}
          placeholder="1.0"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
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
