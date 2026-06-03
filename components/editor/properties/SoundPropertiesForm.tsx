/**
 * components/editor/properties/SoundPropertiesForm.tsx
 * Form for `sound` block — sfx asset + action + volume + loop + pitch variation.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S, Toggle } from './shared';
import type { PropertiesFormProps } from './types';

export default function SoundPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
  renderAssetField,
}: PropertiesFormProps<'sound'>) {
  return (
    <>
      {renderAssetField
        ? renderAssetField(t('editor.properties.asset'), 'sfx', d.assetId, (v) => u('assetId', v))
        : (
            <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
              <TextInput
                value={d.assetId || ''}
                onChangeText={(v) => u('assetId', v)}
                placeholder={t('editor.properties.selectSound')}
                placeholderTextColor={colors.muted}
                style={S(colors, missingFields.has('Asset'))}
              />
            </Field>
          )}
      <Field t={t} label={t('editor.properties.action')} colors={colors}>
        <OptBtns
          options={['play', 'stop']}
          value={d.action}
          onChange={(v) => u('action', v as typeof d.action)}
          colors={colors}
        />
      </Field>
      <Field t={t} label={t('editor.properties.volume')} colors={colors}>
        <TextInput
          value={String(Math.round((d.volume || 0.8) * 100))}
          onChangeText={(v) => u('volume', (parseInt(v) || 80) / 100)}
          placeholder="80"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Toggle t={t} label={t('editor.properties.loop')} value={!!d.loop} onChange={(v) => u('loop', v)} colors={colors} />
      <Field t={t} label={t('editor.properties.pitchVariation')} colors={colors}>
        <TextInput
          value={String(Math.round((d.pitchVariation || 0) * 100))}
          onChangeText={(v) => u('pitchVariation', (parseInt(v) || 0) / 100)}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
