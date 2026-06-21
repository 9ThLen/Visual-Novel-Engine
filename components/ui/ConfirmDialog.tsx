/**
 * components/ui/ConfirmDialog.tsx — Reusable confirmation dialog for destructive actions
 *
 * Modal-based dialog for delete confirmation and other destructive action prompts.
 */

import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: ConfirmDialogProps) {
  const colors = useColors();
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t(destructive ? 'common.delete' : 'common.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
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
          {/* Header */}
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
              {message}
            </Text>
          </View>

          {/* Footer */}
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
              accessibilityLabel={resolvedCancelLabel}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{resolvedCancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: destructive ? colors.error : colors.primary }}
              accessibilityRole="button"
              accessibilityLabel={resolvedConfirmLabel}
            >
              <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>{resolvedConfirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
