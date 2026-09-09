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
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius } from '@/lib/design-tokens';

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
  /**
   * The palette of the surface this sits on. Screens that pin a scheme — the
   * studio is always light, whatever the reader's theme is — must pass theirs,
   * or the control paints itself in the app scheme and lands as a dark slab on
   * a light page.
   */
  colors?: ThemeColorPalette;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  segmentMinWidth = 36,
  colors: colorsProp,
  style,
}: Props<T>) {
  const themeColors = useColors();
  const colors = colorsProp ?? themeColors;

  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.track,
        { backgroundColor: colors['surface-2'], borderColor: colors['border-subtle'] },
        style,
      ]}
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
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected ? colors.primary : colors['foreground-secondary'],
                  fontSize: option.fontSize ?? 12,
                  fontWeight: selected ? '700' : '500',
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
    borderWidth: 1,
    borderRadius: radius.full,
    padding: 2,
    gap: 2,
  },
  segment: {
    // 24 + 2x2 track padding + the track's 1px ring = a 30pt control, the same
    // measure the studio's pills and chips stand at.
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    // The unselected segments carry a transparent ring so choosing one does not
    // change the control's measure.
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
});
