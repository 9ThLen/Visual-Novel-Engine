import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

interface NativeScriptInputProps {
  value: string;
  onChangeText: (value: string) => void;
}

export const nativeScriptInputStyle = {
  minHeight: 240,
  padding: 12,
  fontSize: 16,
  lineHeight: 23,
  color: '#111827',
  backgroundColor: '#FFFFFF',
  borderColor: '#D1D5DB',
  borderWidth: 1,
  borderRadius: 8,
} as const satisfies TextInputProps['style'];

export function NativeScriptInput({ value, onChangeText }: NativeScriptInputProps) {
  return (
    <TextInput
      multiline
      value={value}
      onChangeText={onChangeText}
      textAlignVertical="top"
      autoCorrect={false}
      autoCapitalize="sentences"
      style={nativeScriptInputStyle}
    />
  );
}
