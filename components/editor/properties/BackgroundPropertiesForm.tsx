/**
 * components/editor/properties/BackgroundPropertiesForm.tsx
 * Form for `background` block — image asset + transition + duration.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function BackgroundPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
  renderAssetField,
}: PropertiesFormProps<'background'>) {
  return (
    <>
      {renderAssetField
        ? renderAssetField(t('editor.properties.asset'), 'backgrounds', d.assetId, (v) =>
            u('assetId', v),
          )
        : (
            <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
              <TextInput
                value={d.assetId || ''}
                onChangeText={(v) => u('assetId', v)}
                placeholder={t('editor.properties.selectBackground')}
                placeholderTextColor={colors.muted}
                style={S(colors, missingFields.has('Asset'))}
              />
            </Field>
          )}
      <Field t={t} label={t('editor.properties.transition')} colors={colors}>
        <OptBtns
          options={['fade', 'dissolve', 'instant', 'wipe']}
          value={d.transition}
          onChange={(v) => u('transition', v as typeof d.transition)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.durationMs')} colors={colors}>
        <TextInput
          value={String(d.duration || 500)}
          onChangeText={(v) => u('duration', parseInt(v) || 500)}
          placeholder="500"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
