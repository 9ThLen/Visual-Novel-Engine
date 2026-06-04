import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type { ReaderChoice } from '@/lib/reader-runtime';

interface ReaderChoicesProps {
  choices: ReaderChoice[];
  colors: ReturnType<typeof useColors>;
  fontSize: number;
  getAccessibilityLabel: (text: string) => string;
  onSelectChoice: (choiceId: string) => void;
}

export const ReaderChoices = React.memo(function ReaderChoices({
  choices,
  colors,
  fontSize,
  getAccessibilityLabel,
  onSelectChoice,
}: ReaderChoicesProps) {
  const { t } = useI18n();
  if (choices.length === 0) return null;

  return (
    <View className="px-3 pt-1 pb-3 gap-2">
      {choices.map((choice) => (
        <Pressable
          key={choice.id}
          style={({ pressed }) => ({
            borderRadius: 12,
            borderWidth: 1,
            paddingVertical: 10,
            paddingHorizontal: 16,
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
              color: colors.foreground,
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
