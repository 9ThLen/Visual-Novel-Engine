/**
 * components/editor/properties/InteractiveObjectPropertiesForm.tsx
 * Form for `interactive_object` block — name + sprite + position + flags.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, S, Toggle } from './shared';
import type { PropertiesFormProps } from './types';

export default function InteractiveObjectPropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
}: PropertiesFormProps<'interactive_object'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.objectName')} colors={colors} error={missingFields.has('Object Name')}>
        <TextInput
          value={d.name || ''}
          onChangeText={(v) => u('name', v)}
          placeholder={t('editor.properties.enterObjectName')}
          placeholderTextColor={colors.muted}
          style={S(colors, missingFields.has('Object Name'))}
        />
      </Field>
      <Field t={t} label={t('editor.properties.sprite')} colors={colors}>
        <TextInput
          value={d.assetId || ''}
          onChangeText={(v) => u('assetId', v)}
          placeholder={t('editor.properties.selectSprite')}
          placeholderTextColor={colors.muted}
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.positionX')} colors={colors}>
        <TextInput
          value={String(d.position?.x ?? 50)}
          onChangeText={(v) =>
            u('position', { ...(d.position || {}), x: parseInt(v) || 0 })
          }
          placeholder="50"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.positionY')} colors={colors}>
        <TextInput
          value={String(d.position?.y ?? 50)}
          onChangeText={(v) =>
            u('position', { ...(d.position || {}), y: parseInt(v) || 0 })
          }
          placeholder="50"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.width')} colors={colors}>
        <TextInput
          value={String(d.position?.width ?? 10)}
          onChangeText={(v) =>
            u('position', { ...(d.position || {}), width: parseInt(v) || 10 })
          }
          placeholder="10"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Field t={t} label={t('editor.properties.height')} colors={colors}>
        <TextInput
          value={String(d.position?.height ?? 10)}
          onChangeText={(v) =>
            u('position', { ...(d.position || {}), height: parseInt(v) || 10 })
          }
          placeholder="10"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          style={S(colors)}
        />
      </Field>
      <Toggle t={t} label={t('editor.properties.pulseAnimation')} value={!!d.pulseAnimation} onChange={(v) => u('pulseAnimation', v)} colors={colors} />
      <Toggle t={t} label={t('editor.properties.oneTimeOnly')} value={!!d.oneTimeOnly} onChange={(v) => u('oneTimeOnly', v)} colors={colors} />
    </>
  );
}
