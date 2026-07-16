import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ReaderChoice } from '@/lib/reader-runtime';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';

interface ReaderChoicesProps {
  choices: ReaderChoice[];
  colors: ReturnType<typeof useColors>;
  fontSize: number;
  getAccessibilityLabel: (text: string) => string;
  onSelectChoice: (choiceId: string) => void;
  layoutPreset?: StoryReaderLayoutPreset;
}

export const ReaderChoices = React.memo(function ReaderChoices({
  choices,
  colors,
  fontSize,
  getAccessibilityLabel,
  onSelectChoice,
  layoutPreset = 'classic',
}: ReaderChoicesProps) {
  const { t } = useI18n();
  if (choices.length === 0) return null;

  return (
    <View
      className={layoutPreset === 'classic' ? 'px-3 pt-1 pb-3 gap-2' : undefined}
      style={layoutPreset === 'classic' ? undefined : { paddingHorizontal: 8, paddingTop: 2, paddingBottom: 8, gap: 6 }}
    >
      {choices.map((choice) => (
        <Pressable
          key={choice.id}
          style={({ pressed }) => ({
            borderRadius: 12,
            borderWidth: 1,
            paddingVertical: layoutPreset === 'classic' ? 10 : 7,
            paddingHorizontal: layoutPreset === 'classic' ? 16 : 12,
            backgroundColor: colors.choiceBg,
            borderColor: colors.choiceBorder ?? colors.primary,
            opacity: pressed ? 0.75 : 1,
          })}
          onPress={() => onSelectChoice(choice.id)}
          accessibilityRole="button"
          accessibilityLabel={getAccessibilityLabel(choice.text)}
          accessibilityHint={t('reader.hints.selectChoice')}
        >
          <Text
            className="text-center font-medium leading-5"
            style={{
              color: colors.choiceText,
              fontSize,
            }}
            numberOfLines={3}
          >
            {choice.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});
