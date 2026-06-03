/**
 * components/editor/properties/ChoicePropertiesForm.tsx
 * Form for `choice` block — list of choice options (text + target scene).
 */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Field, S } from './shared';
import type { PropertiesFormProps } from './types';

export default function ChoicePropertiesForm({
  data: d,
  upd: u,
  colors,
  t,
}: PropertiesFormProps<'choice'>) {
  return (
    <>
      {d.options?.map((opt, i: number) => (
        <View
          key={opt.id || i}
          style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              textTransform: 'uppercase',
              color: colors.muted,
              marginBottom: 6,
            }}
          >
            {t('editor.properties.choice', { number: i + 1 })}
          </Text>
          <Field t={t} label={t('editor.properties.text')} colors={colors}>
            <TextInput
              value={opt.text || ''}
              onChangeText={(v) => {
                const o = [...d.options];
                o[i] = { ...opt, text: v };
                u('options', o);
              }}
              placeholder={t('editor.properties.enterChoice')}
              placeholderTextColor={colors.muted}
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.targetScene')} colors={colors}>
            <TextInput
              value={opt.targetSceneId || ''}
              onChangeText={(v) => {
                const o = [...d.options];
                o[i] = { ...opt, targetSceneId: v || null };
                u('options', o);
              }}
              placeholder={t('editor.properties.emptyEnd')}
              placeholderTextColor={colors.muted}
              style={S(colors)}
            />
          </Field>
        </View>
      ))}
      {(d.options?.length || 0) < 20 && (
        <Pressable
          onPress={() =>
            u('options', [
              ...(d.options || []),
              { id: `c_${Date.now()}`, text: '', targetSceneId: null },
            ])
          }
          style={{
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
          }}
          accessibilityRole="button"
          accessibilityLabel={t('editor.addChoice')}
        >
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
            {t('editor.properties.addChoice')}
          </Text>
        </Pressable>
      )}
    </>
  );
}
