import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import type { ReaderChoice } from '@/lib/reader-runtime';
import { RichText } from '@/components/RichText';
import { ReaderChoices } from '@/components/reader/ReaderChoices';

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
}: ReaderDialoguePanelProps) {
  return (
    <View
      className="mx-3 mb-7 rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: colors.dialogueBg,
        borderColor: colors.dialogueBorder,
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

      <Pressable className="p-4 min-h-[80]" onPress={onTap} accessible={false}>
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
  );
});
