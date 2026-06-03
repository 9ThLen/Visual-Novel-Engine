/**
 * components/editor/properties/MusicPropertiesForm.tsx
 * Form for `music` block — music asset + action + volume + loop + fade.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S, Toggle } from './shared';
import type { PropertiesFormProps } from './types';

export default function MusicPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
  renderAssetField,
}: PropertiesFormProps<'music'>) {
  return (
    <>
      {renderAssetField
        ? renderAssetField(t('editor.properties.asset'), 'music', d.assetId, (v) => u('assetId', v))
        : (
            <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
              <TextInput
                value={d.assetId || ''}
                onChangeText={(v) => u('assetId', v)}
                placeholder={t('editor.properties.selectMusic')}
                placeholderTextColor={colors.muted}
                style={S(colors, missingFields.has('Asset'))}
              />
            </Field>
          )}
      <Field t={t} label={t('editor.properties.action')} colors={colors}>
        <OptBtns
          options={['play', 'stop', 'pause', 'fade']}
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
      <Field t={t} label={t('editor.properties.fadeDuration')} colors={colors}>
        <TextInput
          value={String(d.fadeDuration || 1000)}
          onChangeText={(v) => u('fadeDuration', parseInt(v) || 1000)}
          placeholder="1000"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
    </>
  );
}
