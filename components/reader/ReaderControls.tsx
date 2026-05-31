import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { useColors } from '@/hooks/use-colors';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';

interface ReaderControlsProps {
  autoPlayActive: boolean;
  canAdvance: boolean;
  colors: ReturnType<typeof useColors>;
  hasChoices: boolean;
  isTyping: boolean;
  labels: {
    auto: string;
    log: string;
    openHistory: string;
    skip: string;
    skipText: string;
    startAuto: string;
    stopAuto: string;
    tapToContinue: string;
  };
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
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active ? colors.primary : 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: active ? colors.primary : 'rgba(255,255,255,0.18)',
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
  colors,
  hasChoices,
  isTyping,
  labels,
  onOpenHistory,
  onSetTurbo,
  onToggleAutoPlay,
  turbo,
}: ReaderControlsProps) {
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
        />
        <ControlButton
          label={`Log ${labels.log}`}
          onPress={onOpenHistory}
          colors={colors}
          accessibilityLabel={labels.openHistory}
        />
      </View>

      <View className="flex-row gap-2 items-center">
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
