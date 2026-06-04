import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type { DocumentTechnicalBlock } from '@/lib/document-editor/types';
import { documentCommandIcons, getDocumentCommandTone } from './document-command-ui';

interface DocumentChipProps {
  block: DocumentTechnicalBlock;
  selected: boolean;
  onPress: () => void;
}

export function DocumentChip({ block, selected, onPress }: DocumentChipProps) {
  const colors = useColors();
  const { t } = useI18n();
  const chipLabel = block.commandId === 'character' || block.commandId === 'sprite'
    ? block.label
    : t(`document.command.${block.commandId}`, undefined, block.label);
  const warning = block.warning ? t(`document.warning.${block.blockType}`, undefined, block.warning) : null;
  const tone = getDocumentCommandTone(block.commandId);
  const toneColor = tone === 'green' ? colors.success : tone === 'amber' ? colors.warning : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${chipLabel}: ${block.summary}`}
      style={{
        alignSelf: 'flex-start',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? colors.primary : block.warning ? colors.warning : `${toneColor}40`,
        backgroundColor: selected ? `${colors.primary}14` : `${toneColor}12`,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <IconSymbol name={documentCommandIcons[block.commandId]} size={18} color={selected ? colors.primary : toneColor} />
      <View>
        <Text style={{ color: selected ? colors.primary : colors.foreground, fontSize: 15, fontWeight: '700' }}>
          {chipLabel}: {block.summary}
        </Text>
        {warning ? (
          <Text style={{ color: colors.warning, fontSize: 11, marginTop: 2 }}>{warning}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
