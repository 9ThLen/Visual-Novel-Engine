/**
 * The theme over the story it belongs to.
 *
 * The old preview was a navy card with two flat circles on it, in colours the
 * app uses nowhere. What an author needs to see instead is the panel over
 * their own art, because that is the only place the translucency of a dialogue
 * background means anything.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ReaderDialoguePanel } from '@/components/reader/ReaderDialoguePanel';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';

interface Props {
  previewColors: ReturnType<typeof useColors>;
  /** The story's own cover; a plain plate stands in when it has none. */
  backdropUri?: string;
  layoutPreset: StoryReaderLayoutPreset;
}

export function ScenePreview({ previewColors, backdropUri, layoutPreset }: Props) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View style={[styles.scene, { backgroundColor: colors['surface-2'], borderColor: colors['border-subtle'] }]}>
      {backdropUri ? (
        <Image source={{ uri: backdropUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      <View style={styles.label}>
        <Text style={[styles.labelText, { color: colors['foreground-tertiary'] }]}>
          {t('themeStudio.preview')}
        </Text>
        <Text style={[styles.labelText, { color: colors['foreground-tertiary'] }]}>
          {backdropUri ? t('themeStudio.previewBackdrop') : t('themeStudio.previewNoBackdrop')}
        </Text>
      </View>

      <View style={styles.panel}>
        <ReaderDialoguePanel
          colors={previewColors}
          speaker={t('themeStudio.previewSpeaker')}
          speakerTextStyle={{ color: previewColors.nameText, fontSize: 13 }}
          displayedText={t('themeStudio.previewDialogue')}
          isTyping={false}
          dialogueTextStyle={{ color: previewColors.dialogueText, fontSize: 17, lineHeight: 25 }}
          cursorStyle={{ color: previewColors.dialogueText }}
          choices={[
            { id: 'choice-1', text: t('themeStudio.previewChoiceOne'), nextSceneId: '', targetSceneId: null, index: 0 },
            { id: 'choice-2', text: t('themeStudio.previewChoiceTwo'), nextSceneId: '', targetSceneId: null, index: 1 },
          ]}
          choicesFontSize={15}
          getChoiceAccessibilityLabel={(text) => text}
          onSelectChoice={() => {}}
          onTap={() => {}}
          pagesLength={1}
          pageIndex={0}
          readerControls={null}
          layoutPreset={layoutPreset}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    minHeight: 320,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  label: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  panel: {
    paddingTop: 56,
  },
});
