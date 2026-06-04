import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import type { useColors } from '@/hooks/use-colors';
import type { ImageSource } from '@/hooks/useSceneImages';
import type { ReaderChoice } from '@/lib/reader-runtime';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import { CharacterDisplay } from '@/components/CharacterDisplay';
import { ReaderChoices } from '@/components/reader/ReaderChoices';

const DIALOGUE_MARGIN_BOTTOM = 28;
const TAPPABLE_AREA_STYLE = { flex: 1 };
const CURSOR_STYLE = { opacity: 0.8 };
const BACKGROUND_PLACEHOLDER = { blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' };

const styles = StyleSheet.create({
  charactersLayer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});

function handleBackgroundError(err: unknown) {
  if (__DEV__) console.error('[StoryReader] Background load error:', err);
}

interface ReaderDisplayProps {
  backgroundAnimatedStyle: StyleProp<ViewStyle>;
  bgSource: ImageSource | null;
  characterAnimatedStyle: StyleProp<ViewStyle>;
  choices: ReaderChoice[];
  colors: ReturnType<typeof useColors>;
  dialogueAnimatedStyle: StyleProp<ViewStyle>;
  dialogueFontSize: number;
  displayedText: string;
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
}

function ReaderBackground({
  bgSource,
  animatedStyle,
  fallbackColor,
}: {
  bgSource: ImageSource | null;
  animatedStyle: StyleProp<ViewStyle>;
  fallbackColor: string;
}) {
  const fallbackStyle = useMemo(
    () => [StyleSheet.absoluteFillObject, { backgroundColor: fallbackColor }],
    [fallbackColor],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle]}>
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
    </Animated.View>
  );
}

function ReaderCharacters({
  animatedStyle,
  instances,
  resolvedCharUris,
  paddingBottom,
}: {
  animatedStyle: StyleProp<ViewStyle>;
  instances: React.ComponentProps<typeof CharacterDisplay>['instance'][];
  resolvedCharUris: Record<string, ImageSource | undefined>;
  paddingBottom: number;
}) {
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
      {instances.map((instance) => {
        const charSource = resolvedCharUris[instance.characterId];
        if (!charSource || typeof charSource === 'number') return null;
        const uri = typeof charSource === 'string' ? charSource : charSource.uri;
        return (
          <CharacterDisplay
            key={instance.characterId}
            instance={instance}
            spriteUri={uri}
          />
        );
      })}
    </Animated.View>
  );
}

export const ReaderDisplay = React.memo(function ReaderDisplay({
  backgroundAnimatedStyle,
  bgSource,
  characterAnimatedStyle,
  choices,
  colors,
  dialogueAnimatedStyle,
  dialogueFontSize,
  displayedText,
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
}: ReaderDisplayProps) {
  const dialogueTextStyle = useMemo(() => ({
    fontSize: dialogueFontSize,
    lineHeight: dialogueFontSize * 1.65,
    color: colors.foreground,
    fontWeight: '400' as const,
  }), [colors.foreground, dialogueFontSize]);

  const cursorStyle = useMemo(
    () => [CURSOR_STYLE, { color: colors.primary }],
    [colors.primary],
  );

  return (
    <>
      <ReaderBackground
        bgSource={bgSource}
        animatedStyle={backgroundAnimatedStyle}
        fallbackColor={fallbackColor}
      />

      {Object.keys(resolvedCharUris).length > 0 && (
        <ReaderCharacters
          animatedStyle={characterAnimatedStyle}
          instances={instances}
          resolvedCharUris={resolvedCharUris}
          paddingBottom={paddingBottom}
        />
      )}

      <Pressable
        style={TAPPABLE_AREA_STYLE}
        onPress={onTap}
        disabled={isLoading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={continueAccessibilityLabel}
        accessibilityHint={continueAccessibilityHint}
      />

      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          },
          dialogueAnimatedStyle,
          getPointerEventsStyle('box-none'),
        ]}
      >
        <View
          className="mx-3 mb-7 rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: colors.dialogueBg,
            borderColor: colors.border,
            marginBottom: DIALOGUE_MARGIN_BOTTOM,
          }}
        >
          {speaker ? (
            <View
              className="self-start px-3.5 py-1 rounded-br-lg rounded-tl-xl"
              style={{ backgroundColor: colors.nameBg ?? colors.primary }}
            >
              <Text className="text-xs font-bold tracking-wider" style={speakerTextStyle}>
                {speaker}
              </Text>
            </View>
          ) : null}

          <View className="p-4 min-h-[80]">
            <Text style={dialogueTextStyle}>
              {displayedText}
              {isTyping && <Text style={cursorStyle}>|</Text>}
            </Text>
          </View>

          {!isTyping && (
            <ReaderChoices
              choices={choices}
              colors={colors}
              fontSize={dialogueFontSize}
              getAccessibilityLabel={getChoiceAccessibilityLabel}
              onSelectChoice={onSelectChoice}
            />
          )}

          <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
            {false && pagesLength > 1 ? (
              <View className="flex-row gap-1">
                {Array.from({ length: pagesLength }).map((_, i) => (
                  <View
                    key={`dot-${i}`}
                    className={i === pageIndex ? 'rounded-full w-4 h-1.5' : 'rounded-full w-1.5 h-1.5'}
                    style={{
                      backgroundColor: i === pageIndex ? colors.primary : colors.border,
                    }}
                  />
                ))}
              </View>
            ) : (
              <View />
            )}

            {readerControls}
          </View>
        </View>
      </Animated.View>
    </>
  );
});
