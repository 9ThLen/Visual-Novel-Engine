/**
 * Shows the author what the assistant is about to be told they are pointing at
 * — the selected text, or the block in hand — and lets them take it back.
 *
 * A bare caret gets no chip: it names a place, not content, and a chip that is
 * always there stops being read.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import { withAlpha } from '@/lib/_core/theme';
import { describeLiveEditorPointer, focusBlockNameKey } from '@/lib/ai/editor-context-capture';
import { selectVisibleEditorSelection, useEditorContextStore } from '@/stores/editor-context-store';
import { useAppStore } from '@/stores/use-app-store';

interface EditorContextChipProps {
  storyId: string;
  colorScheme?: ColorScheme;
}

export function EditorContextChip({ storyId, colorScheme }: EditorContextChipProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const reported = useEditorContextStore(selectVisibleEditorSelection);
  const selection = reported?.storyId === storyId ? reported : null;
  const dismiss = useEditorContextStore((state) => state.dismissSelection);
  const sceneName = useAppStore((state) =>
    (selection ? state.sceneRecordsByStory[storyId]?.[selection.sceneId]?.name : undefined));

  const pointer = describeLiveEditorPointer(selection);
  if (pointer.kind === 'none') return null;

  const place = sceneName ? t('aiChat.context.inScene', { scene: sceneName }) : '';
  const title = pointer.kind === 'selection'
    ? t('aiChat.context.selection')
    : t('aiChat.context.block', { name: t(focusBlockNameKey(pointer.command)) });
  const detail = pointer.kind === 'selection'
    ? t(pointer.truncated ? 'aiChat.context.wordsTruncated' : 'aiChat.context.words', { count: pointer.words })
    : t(`aiChat.context.state.${pointer.state}`);

  return (
    <View
      accessibilityLabel={t('aiChat.context.willSee')}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginHorizontal: 10,
        marginBottom: 6,
        paddingLeft: 10,
        paddingRight: 4,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: withAlpha(colors.primary, 0.35),
        backgroundColor: withAlpha(colors.primary, 0.08),
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}>
          {[title, place].filter(Boolean).join(' ')}
          <Text style={{ color: colors.muted, fontWeight: '500' }}>{` · ${detail}`}</Text>
        </Text>
        {pointer.kind === 'selection' ? (
          <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {`«${pointer.quote}»`}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('aiChat.context.dismiss')}
        hitSlop={6}
        onPress={dismiss}
        style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 16 }}>×</Text>
      </Pressable>
    </View>
  );
}
