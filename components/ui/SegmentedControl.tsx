/**
 * A row-sized segmented control.
 *
 * Sits at the right-hand end of a settings row rather than spanning its own
 * line, so a choice between three or four short options costs 44pt instead of
 * a label above a row of full-width buttons.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/hooks/use-colors';

export interface SegmentedOption<T> {
  value: T;
  /** What the segment shows. May be a glyph or a bare number. */
  label: string;
  /** Announced instead of `label` when the visible label is not a word. */
  accessibilityLabel?: string;
  /** Overrides the label's type size — a text-size preview shows its own size. */
  fontSize?: number;
}

interface Props<T> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the whole control; each segment is announced as "label: option". */
  accessibilityLabel: string;
  /** Widens every segment to the same measure, for columns of digits. */
  segmentMinWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  segmentMinWidth = 36,
  style,
}: Props<T>) {
  const colors = useColors();

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.track, { backgroundColor: colors['surface-2'] }, style]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${accessibilityLabel}: ${option.accessibilityLabel ?? option.label}`}
            accessibilityState={{ checked: selected }}
            // react-native-web drops accessibilityState, so the chosen segment
            // has to be named again in ARIA or a screen reader hears three
            // identical options.
            aria-checked={selected}
            style={({ pressed }) => [
              styles.segment,
              { minWidth: segmentMinWidth, opacity: pressed ? 0.7 : 1 },
              selected && {
                backgroundColor: colors.surface,
                shadowColor: colors['shadow-color'],
                shadowOpacity: 0.16,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: colors.foreground,
                  fontSize: option.fontSize ?? 12,
                  fontWeight: selected ? '600' : '500',
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  segment: {
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
});
