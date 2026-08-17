import React, { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import type { useColors } from '@/hooks/use-colors';
import type { ImageSource } from '@/hooks/useSceneImages';
import type { ReaderChoice } from '@/lib/reader-runtime';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import type { ReaderFontScale, ReaderLineHeightScale } from '@/lib/user-settings';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { ReaderDialoguePanel } from '@/components/reader/ReaderDialoguePanel';
import { EffectsLayerStack, effectsForCharacter, effectsForTarget } from '@/components/reader/EffectsLayerStack';
import { PARALLAX_LAYERS, useParallaxLayer } from '@/components/reader/useParallaxLayer';
import { useCameraTransform } from '@/components/reader/useCameraTransform';
import { useShakeOffset } from '@/components/reader/useShakeOffset';
import { useVisibleEffects } from '@/components/reader/useVisibleEffects';
import { InteractiveObjectsLayer } from '@/components/InteractiveObjectsLayer';
import type { CameraFocusCharacter } from '@/lib/engine/camera-transform';
import type { ActiveEffect, CameraRuntimeState, RuntimeVideoState } from '@/lib/engine/runtime-types';
import type { InteractiveObject } from '@/lib/interactive-types';
import { richTextAlignment, richTextLength, stripRichText } from '@/lib/rich-text';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';
import { SceneVideoLayer } from '@/components/reader/SceneVideoLayer';
import { SceneCutsceneLayer } from '@/components/reader/SceneCutsceneLayer';

const DIALOGUE_LINE_HEIGHT_MULTIPLIER = 1.65;
const DEFAULT_READER_LINE_HEIGHT_SCALE = 1.2;
const TAPPABLE_AREA_STYLE = { flex: 1 };
const CURSOR_STYLE = { opacity: 0.8 };
const BACKGROUND_PLACEHOLDER = { blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' };

const styles = StyleSheet.create({
  charactersLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  screenEffectsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
});

function handleBackgroundError(err: unknown) {
  if (__DEV__) console.error('[StoryReader] Background load error:', err);
}

interface ReaderDisplayProps {
  backgroundAnimatedStyle: StyleProp<ViewStyle>;
  bgSource: ImageSource | null;
  activeVideo?: RuntimeVideoState | null;
  backgroundVideoEnabled?: boolean;
  /** Set while the timeline is blocked on a cutscene. */
  pendingVideo?: { stepId: string; session: number } | null;
  onCutsceneResolved?: (reason: 'ended' | 'skipped' | 'recovered') => void;
  characterAnimatedStyle: StyleProp<ViewStyle>;
  choices: ReaderChoice[];
  colors: ReturnType<typeof useColors>;
  dialogueAnimatedStyle: StyleProp<ViewStyle>;
  dialogueFontSize: number;
  readerFontScale?: ReaderFontScale;
  readerLineHeightScale?: ReaderLineHeightScale;
  displayedText: string;
  typewriterEnabled?: boolean;
  textSpeed?: number;
  onTypewriterStateChange?: (isTyping: boolean) => void;
  registerCompleteTypewriter?: (complete: () => void) => void;
  fallbackColor: string;
  getChoiceAccessibilityLabel: (text: string) => string;
  continueAccessibilityLabel: string;
  continueAccessibilityHint: string;
  isTyping: boolean;
  isLoading: boolean;
  onTap: () => void;
  onSelectChoice: (choiceId: string) => void;
  paddingBottom: number;
  pagesLength: number;
  pageIndex: number;
  readerControls: React.ReactNode;
  resolvedCharUris: Record<string, ImageSource | undefined>;
  speaker: string | null;
  speakerTextStyle: StyleProp<TextStyle>;
  instances: React.ComponentProps<typeof CharacterDisplay>['instance'][];
  activeSpeakerCharacterId?: string | null;
  activeSpeakerFocusScale?: number;
  dimNonSpeakerCharacters?: boolean;
  activeEffects?: ActiveEffect[];
  cameraState?: CameraRuntimeState;
  parallaxEnabled?: boolean;
  interactiveObjects?: InteractiveObject[];
  onInteractiveDialogue?: (text: string, speaker?: string, characterId?: string) => void;
  onInteractiveSceneTransition?: (sceneId: string) => void;
  onInteractivePlayAudio?: (audioUri: string, volume?: number, loop?: boolean) => void;
  layoutPreset?: StoryReaderLayoutPreset;
  layoutContainerWidth?: number;
  layoutContainerLeft?: number;
}

type TypewriterDialoguePanelProps = React.ComponentProps<typeof ReaderDialoguePanel> & {
  fullText: string;
  textSpeed: number;
  typewriterEnabled: boolean;
  onTypewriterStateChange: (isTyping: boolean) => void;
  registerCompleteTypewriter: (complete: () => void) => void;
};

function TypewriterDialoguePanel({ fullText, textSpeed, typewriterEnabled,
  onTypewriterStateChange, registerCompleteTypewriter, ...panelProps }: TypewriterDialoguePanelProps) {
  const { displayedText, isTyping, startTypewriter, completeTypewriter } = useTypewriter(textSpeed);

  React.useEffect(() => {
    if (typewriterEnabled) startTypewriter(stripRichText(fullText));
  }, [fullText, startTypewriter, typewriterEnabled]);
  React.useEffect(() => {
    onTypewriterStateChange(typewriterEnabled && isTyping);
  }, [isTyping, onTypewriterStateChange, typewriterEnabled]);
  React.useEffect(() => {
    registerCompleteTypewriter(completeTypewriter);
  }, [completeTypewriter, registerCompleteTypewriter]);

  return <ReaderDialoguePanel {...panelProps} displayedText={fullText}
    visibleCount={typewriterEnabled ? displayedText.length : richTextLength(fullText)}
    isTyping={typewriterEnabled ? isTyping : panelProps.isTyping} />;
}

function ReaderBackground({
  bgSource,
  activeVideo,
  backgroundVideoEnabled,
  animatedStyle,
  fallbackColor,
  parallaxEnabled,
}: {
  bgSource: ImageSource | null;
  activeVideo?: RuntimeVideoState | null;
  backgroundVideoEnabled: boolean;
  animatedStyle: StyleProp<ViewStyle>;
  fallbackColor: string;
  parallaxEnabled: boolean;
}) {
  const fallbackStyle = useMemo(
    () => [StyleSheet.absoluteFillObject, { backgroundColor: fallbackColor }],
    [fallbackColor],
  );
  const parallaxStyle = useParallaxLayer(parallaxEnabled, PARALLAX_LAYERS.background);

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, parallaxStyle]}>
        {bgSource ? (
          <Image
            source={bgSource}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={handleBackgroundError}
            placeholder={BACKGROUND_PLACEHOLDER}
            transition={300}
          />
        ) : (
          <View style={fallbackStyle} />
        )}
        {activeVideo && activeVideo.layer === 'background' ? (
          <SceneVideoLayer
            key={activeVideo.stepId}
            video={activeVideo}
            enabled={backgroundVideoEnabled}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

function ReaderCharacters({
  animatedStyle,
  instances,
  resolvedCharUris,
  paddingBottom,
  activeSpeakerCharacterId,
  activeSpeakerFocusScale,
  dimNonSpeakerCharacters,
  activeEffects,
  colors,
  parallaxEnabled,
}: {
  animatedStyle: StyleProp<ViewStyle>;
  instances: React.ComponentProps<typeof CharacterDisplay>['instance'][];
  resolvedCharUris: Record<string, ImageSource | undefined>;
  paddingBottom: number;
  activeSpeakerCharacterId?: string | null;
  activeSpeakerFocusScale?: number;
  dimNonSpeakerCharacters?: boolean;
  activeEffects: ActiveEffect[];
  colors: ReturnType<typeof useColors>;
  parallaxEnabled: boolean;
}) {
  const parallaxStyle = useParallaxLayer(parallaxEnabled, PARALLAX_LAYERS.characters);
  const containerStyle = useMemo(
    () => [
      StyleSheet.absoluteFillObject,
      animatedStyle,
      styles.charactersLayer,
      { paddingBottom },
      getPointerEventsStyle('none'),
    ],
    [animatedStyle, paddingBottom],
  );

  return (
    <Animated.View style={containerStyle}>
      <Animated.View style={[StyleSheet.absoluteFillObject, parallaxStyle]}>
      {instances.map((instance) => {
        const charSource = resolvedCharUris[instance.characterId];
        const uri = !charSource || typeof charSource === 'number'
          ? ''
          : typeof charSource === 'string'
            ? charSource
            : charSource.uri;
        const isActiveSpeaker = activeSpeakerCharacterId === instance.characterId;
        const characterSpecificEffects = effectsForCharacter(activeEffects, instance.characterId);
        return (
          <CharacterDisplay
            key={instance.characterId}
            instance={instance}
            spriteUri={uri}
            position={instance.position}
            isActiveSpeaker={isActiveSpeaker}
            dimmed={Boolean(dimNonSpeakerCharacters && activeSpeakerCharacterId && !isActiveSpeaker)}
            focusScale={activeSpeakerFocusScale}
            overlay={characterSpecificEffects.length > 0 ? (
              <EffectsLayerStack effects={characterSpecificEffects} colors={colors} target="character" />
            ) : null}
          />
        );
      })}
      </Animated.View>
    </Animated.View>
  );
}

export const ReaderDisplay = React.memo(function ReaderDisplay({
  backgroundAnimatedStyle,
  bgSource,
  activeVideo,
  backgroundVideoEnabled = true,
  pendingVideo,
  onCutsceneResolved,
  characterAnimatedStyle,
  choices,
  colors,
  dialogueAnimatedStyle,
  dialogueFontSize,
  readerFontScale = 1.0,
  readerLineHeightScale = DEFAULT_READER_LINE_HEIGHT_SCALE,
  displayedText,
  typewriterEnabled = false,
  textSpeed = 0.5,
  onTypewriterStateChange = () => {},
  registerCompleteTypewriter = () => {},
  fallbackColor,
  getChoiceAccessibilityLabel,
  continueAccessibilityLabel,
  continueAccessibilityHint,
  isTyping,
  isLoading,
  onTap,
  onSelectChoice,
  paddingBottom,
  pagesLength,
  pageIndex,
  readerControls,
  resolvedCharUris,
  speaker,
  speakerTextStyle,
  instances,
  activeSpeakerCharacterId,
  activeSpeakerFocusScale,
  dimNonSpeakerCharacters,
  activeEffects = [],
  cameraState,
  parallaxEnabled = false,
  interactiveObjects = [],
  onInteractiveDialogue,
  onInteractiveSceneTransition,
  onInteractivePlayAudio,
  layoutPreset = 'classic',
  layoutContainerWidth = 760,
  layoutContainerLeft = 0,
}: ReaderDisplayProps) {
  const visibleEffects = useVisibleEffects(activeEffects);
  const screenEffects = effectsForTarget(visibleEffects, 'screen');
  const backgroundEffects = effectsForTarget(visibleEffects, 'background');
  const characterEffects = effectsForTarget(visibleEffects, 'character');
  const genericCharacterEffects = characterEffects.filter((effect) => !effect.characterId);
  const shakeOffset = useShakeOffset(screenEffects);
  const hudParallaxStyle = useParallaxLayer(parallaxEnabled, PARALLAX_LAYERS.hud);
  const scaledDialogueFontSize = dialogueFontSize * readerFontScale;

  // Sprites are placed against the window, so the camera frames them by the
  // same width.
  const { width: windowWidth } = useWindowDimensions();
  const focusCharacters = useMemo<CameraFocusCharacter[]>(
    () => instances.map((instance) => ({ characterId: instance.characterId, position: instance.position })),
    [instances],
  );
  const camera = useCameraTransform(cameraState, focusCharacters, windowWidth);

  const cameraTransformStyle = useMemo(() => ({
    transform: [
      { translateX: camera.translateX + shakeOffset.x },
      { translateY: camera.translateY + shakeOffset.y },
      { scale: camera.scale },
    ],
  }), [camera, shakeOffset.x, shakeOffset.y]);

  const dialogueTextStyle = useMemo(() => ({
    fontSize: scaledDialogueFontSize,
    lineHeight: scaledDialogueFontSize
      * DIALOGUE_LINE_HEIGHT_MULTIPLIER
      * (readerLineHeightScale / DEFAULT_READER_LINE_HEIGHT_SCALE),
    color: colors.dialogueText,
    fontWeight: '400' as const,
    textAlign: richTextAlignment(displayedText),
  }), [colors.dialogueText, displayedText, readerLineHeightScale, scaledDialogueFontSize]);

  const cursorStyle = useMemo(
    () => [CURSOR_STYLE, { color: colors.primary }],
    [colors.primary],
  );

  return (
    <>
      <ReaderBackground
        bgSource={bgSource}
        activeVideo={activeVideo}
        backgroundVideoEnabled={backgroundVideoEnabled}
        animatedStyle={[backgroundAnimatedStyle, cameraTransformStyle]}
        fallbackColor={fallbackColor}
        parallaxEnabled={parallaxEnabled}
      />
      {backgroundEffects.length > 0 ? (
        <EffectsLayerStack effects={backgroundEffects} colors={colors} target="background" />
      ) : null}

      <ReaderCharacters
        animatedStyle={[characterAnimatedStyle, cameraTransformStyle]}
        instances={instances}
        resolvedCharUris={resolvedCharUris}
        paddingBottom={paddingBottom}
        activeSpeakerCharacterId={activeSpeakerCharacterId}
        activeSpeakerFocusScale={activeSpeakerFocusScale}
        dimNonSpeakerCharacters={dimNonSpeakerCharacters}
        activeEffects={characterEffects}
        colors={colors}
        parallaxEnabled={parallaxEnabled}
      />
      {genericCharacterEffects.length > 0 ? (
        <EffectsLayerStack effects={genericCharacterEffects} colors={colors} target="character" />
      ) : null}

      {interactiveObjects.length > 0 ? (
        <InteractiveObjectsLayer
          objects={interactiveObjects}
          onDialogue={onInteractiveDialogue}
          onSceneTransition={onInteractiveSceneTransition}
          onPlayAudio={onInteractivePlayAudio}
        />
      ) : null}

      <Pressable
        style={TAPPABLE_AREA_STYLE}
        onPress={onTap}
        disabled={isLoading || !!pendingVideo}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={continueAccessibilityLabel}
        accessibilityHint={continueAccessibilityHint}
        accessibilityState={{ disabled: isLoading, busy: isLoading }}
      />

      {screenEffects.length > 0 ? (
        <View style={[styles.screenEffectsLayer, getPointerEventsStyle('none')]}>
          <EffectsLayerStack effects={screenEffects} colors={colors} target="screen" />
        </View>
      ) : null}

      {pendingVideo && activeVideo && activeVideo.layer === 'cutscene' ? (
        <SceneCutsceneLayer
          key={pendingVideo.stepId + ':' + pendingVideo.session}
          video={activeVideo}
          colors={colors}
          onResolve={(reason) => onCutsceneResolved?.(reason)}
        />
      ) : null}

      <Animated.View
        testID={`reader-layout-${layoutPreset}`}
        style={[
          layoutPreset === 'classic'
            ? { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40 }
            : layoutPreset === 'top'
              ? { position: 'absolute', top: 72, left: layoutContainerLeft, zIndex: 40, width: layoutContainerWidth }
              : { position: 'absolute', bottom: 0, left: layoutContainerLeft, zIndex: 40, width: layoutContainerWidth },
          dialogueAnimatedStyle,
          hudParallaxStyle,
          getPointerEventsStyle('box-none'),
        ]}
      >
        <TypewriterDialoguePanel
          colors={colors}
          speaker={speaker}
          speakerTextStyle={speakerTextStyle}
          fullText={displayedText}
          textSpeed={textSpeed}
          typewriterEnabled={typewriterEnabled}
          onTypewriterStateChange={onTypewriterStateChange}
          registerCompleteTypewriter={registerCompleteTypewriter}
          displayedText={displayedText}
          isTyping={isTyping}
          dialogueTextStyle={dialogueTextStyle}
          cursorStyle={cursorStyle}
          choices={choices}
          choicesFontSize={scaledDialogueFontSize}
          getChoiceAccessibilityLabel={getChoiceAccessibilityLabel}
          onSelectChoice={onSelectChoice}
          onTap={onTap}
          pagesLength={pagesLength}
          pageIndex={pageIndex}
          readerControls={readerControls}
          layoutPreset={layoutPreset}
        />
      </Animated.View>
    </>
  );
});
