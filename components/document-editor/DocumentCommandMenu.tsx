import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { useI18n } from '@/hooks/use-i18n';
import { searchDocumentCommands } from '@/lib/document-editor/commands';
import type { DocumentCommand } from '@/lib/document-editor/types';
import { documentCommandIcons, getDocumentCommandTone } from './document-command-ui';

interface DocumentCommandMenuProps {
  query: string;
  visible: boolean;
  isPhone: boolean;
  onPick: (command: DocumentCommand) => void;
  onClose: () => void;
}

export function DocumentCommandMenu({
  query,
  visible,
  isPhone,
  onPick,
  onClose,
}: DocumentCommandMenuProps) {
  const colors = useColors();
  const { t } = useI18n();
  const commands = useMemo(() => searchDocumentCommands(query), [query]);

  const content = (
    <View
      style={{
        width: isPhone ? '100%' : 320,
        maxHeight: isPhone ? 460 : 420,
        borderRadius: isPhone ? 16 : 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors['surface-1'],
        overflow: 'hidden',
      }}
    >
      {isPhone ? (
        <View style={{ alignItems: 'center', paddingTop: 12 }}>
          <View style={{ width: 52, height: 5, borderRadius: 999, backgroundColor: colors.border }} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View
          style={{
            minHeight: 42,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <IconSymbol name="search" size={22} color={colors.muted} />
          <Text style={{ flex: 1, fontSize: 16, color: colors.foreground }}>
            /{query.replace(/^\//, '')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <IconSymbol name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {commands.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.muted }}>{t('document.noCommandsFound')}</Text>
          </View>
        ) : (
          commands.map((command) => {
            const tone = getDocumentCommandTone(command.id);
            const toneColor = tone === 'green' ? colors.success : tone === 'amber' ? colors.warning : colors.primary;

            return (
              <Pressable
                key={command.id}
                onPress={() => onPick(command)}
                accessibilityRole="button"
                accessibilityLabel={t(`document.command.${command.id}`, undefined, command.title)}
                style={({ pressed }) => ({
                  minHeight: 74,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.hover : colors['surface-1'],
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    backgroundColor: withAlpha(toneColor, 0x16 / 255),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconSymbol name={documentCommandIcons[command.id]} size={24} color={toneColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '700' }}>
                    {t(`document.command.${command.id}`, undefined, command.title)}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14, marginTop: 3 }}>
                    {t(`document.command.${command.id}.description`, undefined, command.description)}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={24} color={colors.muted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  if (!visible) return null;

  if (isPhone) {
    return (
      <Modal transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }} onPress={onClose}>
          <Pressable style={{ paddingHorizontal: 12, paddingBottom: 12 }} onPress={(event) => event.stopPropagation()}>
            {content}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={{ position: 'absolute', left: 38, bottom: 74, zIndex: 20 }}>
      {content}
    </View>
  );
}
