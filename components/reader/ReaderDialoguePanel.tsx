import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import type { ReaderChoice } from '@/lib/reader-runtime';
import { RichText } from '@/components/RichText';
import { ReaderChoices } from '@/components/reader/ReaderChoices';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';

const DIALOGUE_MARGIN_BOTTOM = 28;

interface ReaderDialoguePanelProps {
  colors: ReturnType<typeof useColors>;
  speaker: string | null;
  speakerTextStyle: StyleProp<TextStyle>;
  displayedText: string;
  /** Visible-character limit for the typewriter reveal; omit to show all text. */
  visibleCount?: number;
  isTyping: boolean;
  dialogueTextStyle: StyleProp<TextStyle>;
  cursorStyle: StyleProp<TextStyle>;
  choices: ReaderChoice[];
  choicesFontSize: number;
  getChoiceAccessibilityLabel: (text: string) => string;
  onSelectChoice: (choiceId: string) => void;
  onTap: () => void;
  pagesLength: number;
  pageIndex: number;
  readerControls: React.ReactNode;
  layoutPreset?: StoryReaderLayoutPreset;
}

export const ReaderDialoguePanel = React.memo(function ReaderDialoguePanel({
  colors,
  speaker,
  speakerTextStyle,
  displayedText,
  visibleCount,
  isTyping,
  dialogueTextStyle,
  cursorStyle,
  choices,
  choicesFontSize,
  getChoiceAccessibilityLabel,
  onSelectChoice,
  onTap,
  pagesLength,
  pageIndex,
  readerControls,
  layoutPreset = 'classic',
}: ReaderDialoguePanelProps) {
  const dense = layoutPreset !== 'classic';
  return (
    <View
      className="rounded-2xl border overflow-hidden"
      testID={`reader-dialogue-panel-${layoutPreset}`}
      style={{
        backgroundColor: colors.dialogueBg,
        borderColor: colors.dialogueBorder,
        marginHorizontal: dense ? 8 : 12,
        marginBottom: dense ? 12 : DIALOGUE_MARGIN_BOTTOM,
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

      <Pressable
        className={dense ? undefined : 'p-4 min-h-[80]'}
        style={dense ? { padding: 12, minHeight: 60 } : undefined}
        onPress={onTap}
        accessible={false}
      >
        <Text testID="reader-dialogue-text" style={dialogueTextStyle}>
          <RichText text={displayedText} visibleCount={visibleCount} />
          {isTyping && <Text style={cursorStyle}>|</Text>}
        </Text>
      </Pressable>

      {!isTyping && (
        <ReaderChoices
          choices={choices}
          colors={colors}
          fontSize={choicesFontSize}
          getAccessibilityLabel={getChoiceAccessibilityLabel}
          onSelectChoice={onSelectChoice}
          layoutPreset={layoutPreset}
        />
      )}

      <View
        className={dense ? 'flex-row items-center justify-between' : 'flex-row items-center justify-between px-4 pb-3 pt-1'}
        style={dense ? { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 } : undefined}
      >
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
  );
});
