/**
 * One colour of the reader theme, as a list row.
 *
 * Nine of these replace nine two-storey blocks of twelve swatches each. The
 * row shows what the colour currently is; tapping it opens the picker inside
 * the group, so the panel behind stays in view while you drag.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SettingsRow } from '@/components/settings/list';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useColors } from '@/hooks/use-colors';
import { parseColorToHex } from '@/lib/color-picker';

interface Props {
  label: string;
  /** The colour in force — the story's own value, or the theme default. */
  value: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (hex: string) => void;
  allowAlpha?: boolean;
  palette?: readonly string[];
}

export function ColorRow({
  label,
  value,
  expanded,
  onToggle,
  onChange,
  allowAlpha = false,
  palette,
}: Props) {
  const colors = useColors();
  const hex = parseColorToHex(value) ?? '#000000';

  return (
    <View>
      <SettingsRow
        label={label}
        value={hex.toUpperCase()}
        onPress={onToggle}
        accessibilityLabel={`${label}: ${hex}`}
        right={
          <View style={[styles.swatchFrame, { borderColor: colors['border-subtle'] }]}>
            <View style={[styles.checker, { backgroundColor: colors['control-knob'] }]} />
            <View style={[styles.swatch, { backgroundColor: hex }]} />
          </View>
        }
      />
      {expanded ? (
        <ColorPicker
          value={hex}
          onChange={onChange}
          allowAlpha={allowAlpha}
          palette={palette}
          accessibilityLabel={label}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  swatchFrame: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // Sits under a translucent colour so its alpha is visible in the row.
  checker: {
    ...StyleSheet.absoluteFillObject,
  },
  swatch: {
    ...StyleSheet.absoluteFillObject,
  },
});
