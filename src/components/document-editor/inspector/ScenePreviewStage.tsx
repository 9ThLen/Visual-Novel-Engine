/**
 * Renders one preview frame at a real device's pixel size, then scales the
 * whole device down onto the stage it was given.
 *
 * Everything inside the scaled layer uses the same numbers the reader uses at
 * that device size — font scale from `getResponsiveFontSize`, character width
 * from the device width, the dialogue panel's own component. The preview is
 * therefore proportionally what the reader draws, not a lookalike.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { ReaderDialoguePanel } from '@/components/reader/ReaderDialoguePanel';
import {
  DEFAULT_READER_LINE_HEIGHT_SCALE,
  DIALOGUE_LINE_HEIGHT_MULTIPLIER,
} from '@/components/reader/ReaderDisplay';
import { useResolvedAssetUris, type ResolvedSource } from '@/components/document-editor/inspector/useResolvedAssetUris';
import { useReaderColors } from '@/hooks/use-reader-colors';
import { useSpriteAspectRatio } from '@/hooks/use-sprite-aspect-ratio';
import { useI18n } from '@/hooks/use-i18n';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import { getCharacterSpriteSize } from '@/lib/character-layout';
import { getReaderLayout, getResponsiveFontSize } from '@/lib/responsive';
import { richTextAlignment } from '@/lib/rich-text';
import { getStoryReaderSpeakerTextStyle } from '@/lib/story-reader-platform';
import { getPreviewGeometry, getPreviewLayerStyle, type PreviewDevice } from '@/lib/document-editor/preview-viewport';
import type { PreviewFrame } from '@/lib/document-editor/preview-frames';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';
import type { CharacterPosition } from '@/lib/character-types';
import type { UserSettings } from '@/lib/user-settings';

/** Same anchor points CharacterDisplay uses. */
function positionPercent(position: CharacterPosition): `${number}%` {
  switch (position) {
    case 'far-left':
      return '10%';
    case 'left':
      return '25%';
    case 'right':
      return '75%';
    case 'far-right':
      return '90%';
    default:
      return '50%';
  }
}

/**
 * One sprite, sized by the reader's own rule: as tall as the stage allows, in
 * the file's real proportions.
 */
function PreviewCharacter({
  source,
  spriteUri,
  position,
  stageWidth,
  stageHeight,
  characterCount,
}: {
  source: ResolvedSource;
  spriteUri: string | null | undefined;
  position: CharacterPosition;
  stageWidth: number;
  stageHeight: number;
  characterCount: number;
}) {
  const { aspectRatio, onSpriteLoad } = useSpriteAspectRatio(spriteUri);
  const { width, height } = getCharacterSpriteSize({
    stageWidth,
    stageHeight,
    aspectRatio,
    characterCount,
  });

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: positionPercent(position),
        width,
        height,
        transform: [{ translateX: -width / 2 }],
      }}
    >
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        onLoad={onSpriteLoad}
      />
    </View>
  );
}

interface ScenePreviewStageProps {
  frame: PreviewFrame | null;
  device: PreviewDevice;
  stage: { width: number; height: number };
  storyId: string;
  layoutPreset: StoryReaderLayoutPreset;
  settings: Pick<UserSettings, 'textSize' | 'readerFontScale' | 'readerLineHeightScale'>;
  /** Cap on upscaling; the panel keeps 1, the expanded overlay may allow more. */
  maxScale?: number;
}

export const ScenePreviewStage = React.memo(function ScenePreviewStage({
  frame,
  device,
  stage,
  storyId,
  layoutPreset,
  settings,
  maxScale = 1,
}: ScenePreviewStageProps) {
  const colors = useReaderColors(storyId);
  const { t } = useI18n();

  const geometry = useMemo(
    () => getPreviewGeometry(device, stage, { maxScale }),
    [device, stage, maxScale],
  );

  const assetIds = useMemo(
    () => [frame?.backgroundAssetId, ...(frame?.characters ?? []).map((item) => item.spriteUri)],
    [frame],
  );
  const sources = useResolvedAssetUris(assetIds);

  const { deviceWidth, deviceHeight } = geometry;

  // Phone portrait pushes the character layer up above the dialogue panel;
  // desktop landscape leaves it flush with the bottom. This is the single most
  // visible difference between the two devices.
  const readerLayout = useMemo(
    () => getReaderLayout({ width: deviceWidth, height: deviceHeight }),
    [deviceWidth, deviceHeight],
  );
  const charactersPaddingBottom =
    readerLayout.dialoguePosition === 'bottom' ? Math.max(0, readerLayout.dialogueHeight - 20) : 0;
  const previewCharacters = frame?.characters ?? [];

  const fontSize = useMemo(
    () => getResponsiveFontSize({ width: deviceWidth, height: deviceHeight }),
    [deviceWidth, deviceHeight],
  );
  const baseFontSize =
    settings.textSize === 'small' ? fontSize.sm : settings.textSize === 'large' ? fontSize.lg : fontSize.md;
  const dialogueFontSize = baseFontSize * settings.readerFontScale;

  const dialogueTextStyle = useMemo(
    () => ({
      fontSize: dialogueFontSize,
      lineHeight:
        dialogueFontSize
        * DIALOGUE_LINE_HEIGHT_MULTIPLIER
        * (settings.readerLineHeightScale / DEFAULT_READER_LINE_HEIGHT_SCALE),
      color: colors.dialogueText,
      fontWeight: '400' as const,
      textAlign: richTextAlignment(frame?.text ?? ''),
    }),
    [colors.dialogueText, dialogueFontSize, frame?.text, settings.readerLineHeightScale],
  );

  const choices = useMemo(
    () =>
      (frame?.choices ?? []).map((choice, index) => ({
        id: choice.id,
        text: choice.text,
        nextSceneId: choice.targetSceneId ?? '',
        targetSceneId: choice.targetSceneId,
        index,
      })),
    [frame],
  );

  // Mirrors ReaderDisplay: `classic` spans the full width, the dense presets sit
  // in a centered column capped at 760px.
  const containerWidth = Math.min(deviceWidth, 760);
  const containerLeft = Math.max(0, (deviceWidth - containerWidth) / 2);
  const panelPlacement =
    layoutPreset === 'classic'
      ? { position: 'absolute' as const, bottom: 0, left: 0, right: 0 }
      : layoutPreset === 'top'
        ? { position: 'absolute' as const, top: 72, left: containerLeft, width: containerWidth }
        : { position: 'absolute' as const, bottom: 0, left: containerLeft, width: containerWidth };

  const backgroundSource = frame?.backgroundAssetId ? sources[frame.backgroundAssetId] : null;

  return (
    <View
      style={{
        width: stage.width,
        height: stage.height,
        overflow: 'hidden',
        backgroundColor: colors.background,
        ...getPointerEventsStyle('none'),
      }}
    >
      <View style={getPreviewLayerStyle(geometry)}>
        {backgroundSource ? (
          <Image
            source={backgroundSource}
            style={{ position: 'absolute', left: 0, top: 0, width: deviceWidth, height: deviceHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: deviceWidth,
              height: deviceHeight,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 28 }}>
              {t('document.preview.noBackground')}
            </Text>
          </View>
        )}

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            paddingBottom: charactersPaddingBottom,
          }}
        >
          {previewCharacters.map((character) => {
            const source = character.spriteUri ? sources[character.spriteUri] : null;
            if (!source) return null;
            return (
              <PreviewCharacter
                key={character.characterId}
                source={source}
                spriteUri={character.spriteUri}
                position={character.position}
                stageWidth={deviceWidth}
                stageHeight={deviceHeight - charactersPaddingBottom}
                characterCount={previewCharacters.length}
              />
            );
          })}
        </View>

        {frame ? (
          <View style={panelPlacement}>
            <ReaderDialoguePanel
              colors={colors}
              speaker={frame.speaker}
              speakerTextStyle={getStoryReaderSpeakerTextStyle({ nameText: colors.nameText })}
              displayedText={frame.text}
              isTyping={false}
              dialogueTextStyle={dialogueTextStyle}
              cursorStyle={{ opacity: 0.8, color: colors.primary }}
              choices={choices}
              choicesFontSize={dialogueFontSize}
              getChoiceAccessibilityLabel={(text) => text}
              onSelectChoice={noop}
              onTap={noop}
              pagesLength={1}
              pageIndex={0}
              readerControls={null}
              layoutPreset={layoutPreset}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
});

function noop() {}
