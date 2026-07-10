import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface ReaderControlsProps {
  autoPlayActive: boolean;
  canAdvance: boolean;
  canGoBack: boolean;
  colors: ReturnType<typeof useColors>;
  hasChoices: boolean;
  isTyping: boolean;
  labels: {
    auto: string;
    back: string;
    goBack: string;
    log: string;
    openHistory: string;
    skip: string;
    skipText: string;
    startAuto: string;
    stopAuto: string;
    tapToContinue: string;
  };
  onBack: () => void;
  onOpenHistory: () => void;
  onSetTurbo: (turbo: boolean) => void;
  onToggleAutoPlay: () => void;
  turbo: boolean;
}

const ControlButton = React.memo(function ControlButton({
  label,
  active = false,
  onPress,
  colors,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active ? colors.primary : colors.overlay,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors['border-subtle'],
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Text style={{ color: colors['text-inverse'], fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
});

export const ReaderControls = React.memo(function ReaderControls({
  autoPlayActive,
  canAdvance,
  canGoBack,
  colors,
  hasChoices,
  isTyping,
  labels,
  onBack,
  onOpenHistory,
  onSetTurbo,
  onToggleAutoPlay,
  turbo,
}: ReaderControlsProps) {
  const { t } = useI18n();
  return (
    <>
      <View
        className="absolute right-4 top-12 flex-row gap-2"
        style={getPointerEventsStyle('box-none')}
      >
        <ControlButton
          label={autoPlayActive ? `Pause ${labels.auto}` : `Play ${labels.auto}`}
          active={autoPlayActive}
          onPress={onToggleAutoPlay}
          colors={colors}
          accessibilityLabel={autoPlayActive ? labels.stopAuto : labels.startAuto}
          accessibilityHint={t('reader.hints.autoPlay')}
        />
        <ControlButton
          label={`Log ${labels.log}`}
          onPress={onOpenHistory}
          colors={colors}
          accessibilityLabel={labels.openHistory}
          accessibilityHint={t('reader.hints.history')}
        />
      </View>

      <View className="flex-row gap-2 items-center">
        <Pressable
          style={{
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: 'transparent',
            opacity: canGoBack ? 1 : 0.35,
          }}
          disabled={!canGoBack}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={labels.goBack}
          accessibilityState={{ disabled: !canGoBack }}
          accessibilityHint={t('reader.hints.rollback')}
        >
          <Text className="text-xs font-semibold" style={{ color: colors.muted }}>
            {`< ${labels.back}`}
          </Text>
        </Pressable>
        {!isTyping && canAdvance && !hasChoices && (
          <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>
            {labels.tapToContinue} v
          </Text>
        )}
        <Pressable
          style={{
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: turbo ? colors.primary : colors.border,
            backgroundColor: turbo ? colors.primary : 'transparent',
          }}
          onPressIn={() => onSetTurbo(true)}
          onPressOut={() => onSetTurbo(false)}
          accessibilityRole="button"
          accessibilityLabel={labels.skipText}
          accessibilityHint={t('reader.hints.fastForward')}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: turbo ? colors['text-inverse'] : colors.muted }}
          >
            Fast {labels.skip}
          </Text>
        </Pressable>
      </View>
    </>
  );
});
