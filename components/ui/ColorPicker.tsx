/**
 * A colour picker you drag rather than type into.
 *
 * React Native has no native picker, and the web one opens an operating-system
 * dialog that looks like a different application, so this is built from the
 * two libraries the project already carries: `react-native-svg` for the
 * gradients and core `PanResponder` for the dragging, which needs no provider
 * above it and behaves the same on web and native.
 *
 * The hex field stays, because sometimes you do know the value.
 */

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import {
  hexToHsva,
  hsvaToHex,
  hueHex,
  parseColorToHex,
  type Hsva,
} from '@/lib/color-picker';

const SQUARE_HEIGHT = 132;
const STRIP_HEIGHT = 22;
const THUMB = 16;

/** Reports where along a track a touch landed, as 0–1. */
function useTrackGesture(onMove: (ratioX: number, ratioY: number) => void) {
  const size = useRef({ width: 1, height: 1 });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    size.current = { width: Math.max(1, width), height: Math.max(1, height) };
  }, []);

  const responder = useMemo(
    () => {
      const handle = (locationX: number, locationY: number) => {
        onMove(
          Math.max(0, Math.min(1, locationX / size.current.width)),
          Math.max(0, Math.min(1, locationY / size.current.height)),
        );
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          handle(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          handle(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
      });
    },
    [onMove],
  );

  return { onLayout, handlers: responder.panHandlers };
}

interface Props {
  /** Current colour, in any form `parseColorToHex` understands. */
  value: string;
  onChange: (hex: string) => void;
  /** Shows the alpha strip. Off for colours that must stay opaque, like text. */
  allowAlpha?: boolean;
  /** Colours already in play elsewhere in the theme, offered as one tap. */
  palette?: readonly string[];
  accessibilityLabel: string;
}

export function ColorPicker({
  value,
  onChange,
  allowAlpha = false,
  palette = [],
  accessibilityLabel,
}: Props) {
  const colors = useColors();
  const { t } = useI18n();

  const instance = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = (name: string) => `${name}-${instance}`;

  const hsva = useMemo(() => hexToHsva(value), [value]);
  const [draftHex, setDraftHex] = useState(() => parseColorToHex(value) ?? '#000000');

  // The field follows the sliders, but only while it is not being typed into.
  const [editing, setEditing] = useState(false);
  const shownHex = editing ? draftHex : (parseColorToHex(value) ?? '#000000');

  const emit = useCallback(
    (next: Partial<Hsva>) => {
      const hex = hsvaToHex({ ...hsva, ...next });
      setDraftHex(hex);
      onChange(hex);
    },
    [hsva, onChange],
  );

  const square = useTrackGesture(
    useCallback((x: number, y: number) => emit({ s: x, v: 1 - y }), [emit]),
  );
  const hue = useTrackGesture(useCallback((x: number) => emit({ h: x * 360 }), [emit]));
  const alpha = useTrackGesture(useCallback((x: number) => emit({ a: x }), [emit]));

  const commitField = useCallback(() => {
    setEditing(false);
    const parsed = parseColorToHex(draftHex);
    if (parsed) onChange(parsed);
    else setDraftHex(parseColorToHex(value) ?? '#000000');
  }, [draftHex, onChange, value]);

  const pureHue = hueHex(hsva.h);
  const opaque = hsvaToHex({ ...hsva, a: 1 });

  return (
    <View style={styles.root} accessibilityLabel={accessibilityLabel}>
      <View
        style={[styles.square, { borderColor: colors['border-subtle'] }]}
        onLayout={square.onLayout}
        {...square.handlers}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId("saturation")} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#ffffff" />
              <Stop offset="1" stopColor={pureHue} />
            </LinearGradient>
            <LinearGradient id={gradientId("value")} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId("saturation")})`} />
          <Rect width="100%" height="100%" fill={`url(#${gradientId("value")})`} />
        </Svg>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              backgroundColor: opaque,
              borderColor: colors['control-knob'],
              left: `${hsva.s * 100}%`,
              top: `${(1 - hsva.v) * 100}%`,
            },
          ]}
        />
      </View>

      <View
        style={[styles.strip, { borderColor: colors['border-subtle'] }]}
        onLayout={hue.onLayout}
        {...hue.handlers}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId("hue")} x1="0" y1="0" x2="1" y2="0">
              {[0, 60, 120, 180, 240, 300, 360].map((degree) => (
                <Stop key={degree} offset={`${degree / 360}`} stopColor={hueHex(degree)} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId("hue")})`} />
        </Svg>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            styles.stripThumb,
            { backgroundColor: pureHue, borderColor: colors['control-knob'], left: `${(hsva.h / 360) * 100}%` },
          ]}
        />
      </View>

      {allowAlpha ? (
        <View
          style={[styles.strip, { borderColor: colors['border-subtle'] }]}
          onLayout={alpha.onLayout}
          {...alpha.handlers}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern id={gradientId("checks")} width="12" height="12" patternUnits="userSpaceOnUse">
                <Rect width="12" height="12" fill="#ffffff" />
                <Rect width="6" height="6" fill="#cccccc" />
                <Rect x="6" y="6" width="6" height="6" fill="#cccccc" />
              </Pattern>
              <LinearGradient id={gradientId("alpha")} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={opaque} stopOpacity="0" />
                <Stop offset="1" stopColor={opaque} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId("checks")})`} />
            <Rect width="100%" height="100%" fill={`url(#${gradientId("alpha")})`} />
          </Svg>
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              styles.stripThumb,
              { backgroundColor: opaque, borderColor: colors['control-knob'], left: `${hsva.a * 100}%` },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.fieldRow}>
        <TextInput
          value={shownHex}
          onFocus={() => { setEditing(true); setDraftHex(shownHex); }}
          onChangeText={setDraftHex}
          onBlur={commitField}
          onSubmitEditing={commitField}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel={t('themeStudio.hexValue', { label: accessibilityLabel })}
          style={[
            styles.field,
            {
              color: colors.foreground,
              borderColor: colors['border-subtle'],
              backgroundColor: colors['surface-2'],
            },
          ]}
        />
        {allowAlpha ? (
          <Text style={[styles.alphaReadout, { color: colors['foreground-tertiary'] }]}>
            {Math.round(hsva.a * 100)}%
          </Text>
        ) : null}
      </View>

      {palette.length > 0 ? (
        <View style={styles.palette}>
          {palette.map((swatch) => (
            <Pressable
              key={swatch}
              onPress={() => onChange(swatch)}
              accessibilityRole="button"
              accessibilityLabel={`${accessibilityLabel}: ${swatch}`}
              style={({ pressed }) => [
                styles.paletteSwatch,
                {
                  backgroundColor: swatch,
                  borderColor: swatch === parseColorToHex(value) ? colors.primary : colors['border-subtle'],
                  borderWidth: swatch === parseColorToHex(value) ? 2 : 1,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  square: {
    height: SQUARE_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  strip: {
    height: STRIP_HEIGHT,
    borderRadius: STRIP_HEIGHT / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    marginLeft: -THUMB / 2,
    marginTop: -THUMB / 2,
  },
  stripThumb: {
    top: '50%',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  field: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  alphaReadout: {
    fontSize: 13,
    minWidth: 40,
    textAlign: 'right',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteSwatch: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
});
