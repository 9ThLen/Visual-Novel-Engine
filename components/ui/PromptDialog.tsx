/**
 * components/ui/PromptDialog.tsx — ConfirmDialog with one line to type into.
 *
 * Naming a folder, renaming it, adding a tag: three places that need the same
 * small thing, and none of them is worth a screen. Confirming is refused while
 * the field is blank, so the dialog cannot produce the one value every caller
 * would have to reject anyway.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { AppModal } from './AppModal';

interface PromptDialogProps {
  visible: boolean;
  title: string;
  /** Prefilled for a rename, empty for a new name. */
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel,
  maxLength,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const colors = useColors();
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);

  // Reopening for a different folder must not show the previous one's name.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [initialValue, visible]);

  const trimmed = value.trim();
  const submit = () => {
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <AppModal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '85%',
          maxWidth: 360,
          backgroundColor: colors['surface-container'],
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <View style={{ padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>
              {title}
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              accessibilityLabel={title}
              maxLength={maxLength}
              autoFocus
              onSubmitEditing={submit}
              style={{
                minHeight: 44,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
          </View>

          <View style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
          }}>
            <Pressable
              onPress={onCancel}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!trimmed}
              accessibilityRole="button"
              accessibilityState={{ disabled: !trimmed }}
              accessibilityLabel={confirmLabel ?? t('common.confirm')}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: colors.primary,
                opacity: trimmed ? 1 : 0.45,
              }}
            >
              <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>
                {confirmLabel ?? t('common.confirm')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AppModal>
  );
}
