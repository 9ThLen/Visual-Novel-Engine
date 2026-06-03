/**
 * components/editor/properties/VariablePropertiesForm.tsx
 * Form for `variable` block — name + operation + value.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { Field, OptBtns, S, Toggle } from './shared';
import type { PropertiesFormProps } from './types';

export default function VariablePropertiesForm({
  data: d,
  upd: u,
  colors,
  missingFields,
  t,
}: PropertiesFormProps<'variable'>) {
  return (
    <>
      <Field t={t} label={t('editor.properties.variableName')} colors={colors} error={missingFields.has('Variable Name')}>
        <TextInput
          value={d.variableName || ''}
          onChangeText={(v) => u('variableName', v)}
          placeholder={t('editor.properties.enterVariableName')}
          placeholderTextColor={colors.muted}
          style={S(colors, missingFields.has('Variable Name'))}
        />
      </Field>
      <Field t={t} label={t('editor.properties.operation')} colors={colors}>
        <OptBtns
          options={['set', 'add', 'subtract', 'multiply', 'toggle']}
          value={d.operation}
          onChange={(v) => u('operation', v as typeof d.operation)}
          colors={colors}
        />
      </Field>
      {d.operation === 'toggle' ? (
        <Toggle
          t={t}
          label={t('editor.properties.value')}
          value={d.value === true || d.value === 'true'}
          onChange={(v) => u('value', v)}
          colors={colors}
        />
      ) : (
        <Field t={t} label={t('editor.properties.value')} colors={colors}>
          <TextInput
            value={String(d.value ?? '')}
            onChangeText={(v) => u('value', v === '' ? v : isNaN(Number(v)) ? v : Number(v))}
            placeholder={t('editor.properties.enterValue')}
            placeholderTextColor={colors.muted}
            style={S(colors)}
          />
        </Field>
      )}
    </>
  );
}
