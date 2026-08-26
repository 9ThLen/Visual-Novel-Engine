/**
 * The atoms of a grouped settings list.
 *
 * A group is held together by one shared surface and hairline separators
 * rather than by a border around every section, and a row is one line high:
 * 44pt for a plain choice, 58 when it carries an explanatory subtitle. The
 * explanation for a whole group goes in its footer, not in a paragraph
 * stacked inside it.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Slider from '@react-native-community/slider';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';

/** Row padding + icon tile + gap: separators start where the label does. */
export const SEPARATOR_INSET = 54;

export const SETTINGS_CONTENT_MAX_WIDTH = 560;

export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  // toArray already drops the nulls a conditional row leaves behind.
  const rows = React.Children.toArray(children);

  return (
    <View style={styles.group}>
      {title ? (
        <Text style={[styles.groupTitle, { color: colors['foreground-tertiary'] }]}>{title}</Text>
      ) : null}
      {rows.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {rows.map((row, index) => (
            <React.Fragment key={index}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors['border-subtle'] }]} />
              ) : null}
              {row}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {footer ? (
        <Text style={[styles.groupFooter, { color: colors['foreground-tertiary'] }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

interface RowProps {
  icon: IconSymbolName;
  label: string;
  /** Second line, kept to one line's worth of words where possible. */
  description?: string;
  /** Right-aligned reading, such as how much storage is in use. */
  value?: string;
  /** A control that lives at the right-hand end of the row. */
  right?: React.ReactNode;
  /** Lets the right-hand slot take the width the label leaves — for sliders. */
  rightFill?: boolean;
  /** Fixes the label column so sliders in one group line up. */
  labelWidth?: number;
  onPress?: () => void;
  chevron?: boolean;
  /** `action` paints the label in the accent, for a row that does something. */
  tone?: 'default' | 'action';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function SettingsRow({
  icon,
  label,
  description,
  value,
  right,
  rightFill = false,
  labelWidth,
  onPress,
  chevron = false,
  tone = 'default',
  accessibilityLabel,
  style,
}: RowProps) {
  const colors = useColors();

  const body = (
    <>
      <View style={[styles.tile, { backgroundColor: colors.primary }]}>
        <IconSymbol name={icon} size={15} color={colors['text-inverse']} />
      </View>
      <View style={[styles.text, labelWidth === undefined ? styles.textFlexible : { width: labelWidth }]}>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: tone === 'action' ? colors.primary : colors.foreground },
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={[styles.description, { color: colors['foreground-tertiary'] }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.value, { color: colors['foreground-tertiary'] }]}>{value}</Text>
      ) : null}
      {right ? <View style={rightFill ? styles.rightFill : undefined}>{right}</View> : null}
      {chevron ? (
        <IconSymbol name="chevron.right" size={16} color={colors['foreground-tertiary']} />
      ) : null}
    </>
  );

  const rowStyle = [styles.row, description ? styles.rowTall : null, style];

  if (!onPress) {
    return <View style={rowStyle}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: colors.pressed }]}
    >
      {body}
    </Pressable>
  );
}

/**
 * A volume or speed row. The percentage surfaces while a finger is on the
 * track and gets out of the way once it lifts, so the resting row is just a
 * label and a track.
 */
export function SettingsSliderRow({
  icon,
  label,
  value,
  onValueChange,
  labelWidth,
}: {
  icon: IconSymbolName;
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  labelWidth: number;
}) {
  const colors = useColors();
  const [sliding, setSliding] = React.useState(false);

  return (
    <SettingsRow
      icon={icon}
      label={label}
      labelWidth={labelWidth}
      rightFill
      right={
        <View style={styles.sliderWrap}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={value}
            onValueChange={onValueChange}
            onSlidingStart={() => setSliding(true)}
            onSlidingComplete={() => setSliding(false)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors['border-subtle']}
            thumbTintColor={colors['control-knob']}
            accessibilityLabel={label}
          />
          {sliding ? (
            <View style={[styles.bubble, { backgroundColor: colors.primary }]}>
              <Text style={[styles.bubbleText, { color: colors['text-inverse'] }]}>
                {Math.round(value * 100)}%
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

/** Version and one line about the app, with no surface of its own. */
export function SettingsFooter({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={[styles.footer, { color: colors['foreground-tertiary'] }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: 22,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 16,
    paddingBottom: 7,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  groupFooter: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingTop: 7,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  rowTall: {
    minHeight: 58,
    paddingVertical: 8,
  },
  tile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    minWidth: 0,
  },
  textFlexible: {
    flex: 1,
  },
  label: {
    fontSize: 15,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  value: {
    fontSize: 15,
  },
  rightFill: {
    flex: 1,
  },
  sliderWrap: {
    justifyContent: 'center',
  },
  slider: {
    width: '100%',
    height: 36,
    marginHorizontal: -4,
  },
  bubble: {
    position: 'absolute',
    right: 0,
    top: 0,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  bubbleText: {
    fontSize: 10,
    fontWeight: '600',
  },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 26,
  },
});
