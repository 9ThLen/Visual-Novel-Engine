/**
 * components/editor/properties/shared.tsx — Shared form-field helpers.
 *
 * Extracted from the original `PropertiesPanel.tsx`. All per-block form
 * subcomponents import from here to render consistent fields.
 */
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import type { ThemeColorPalette } from '@/constants/theme';

export const S = (c: ThemeColorPalette, error?: boolean) =>
  ({
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: error ? c.error : c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: c.foreground,
  }) as const;

export function Field({
  label,
  children,
  colors,
  error,
  t: tFn,
}: {
  label: string;
  children: React.ReactNode;
  colors: ThemeColorPalette;
  error?: boolean;
  t?: (key: string) => string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: error ? colors.error : colors.muted,
          }}
        >
          {label}
        </Text>
        {error && (
          <Text style={{ fontSize: 9, color: colors.error, fontWeight: '600' }}>
            {tFn ? tFn('editor.properties.required') : 'REQUIRED'}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function OptBtns({
  options,
  value,
  onChange,
  colors,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColorPalette;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: value === o ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: value === o ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={o}
        >
          <Text
            style={{
              fontSize: 11,
              color: value === o ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  colors,
  t: tFn,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ThemeColorPalette;
  t: (key: string) => string;
}) {
  return (
    <Field t={tFn} label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          onPress={() => onChange(true)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: value ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: value ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={tFn('common.yes')}
        >
          <Text
            style={{
              fontSize: 11,
              color: value ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {tFn('common.yes')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: !value ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: !value ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={tFn('common.no')}
        >
          <Text
            style={{
              fontSize: 11,
              color: !value ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {tFn('common.no')}
          </Text>
        </Pressable>
      </View>
    </Field>
  );
}
