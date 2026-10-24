import { StyleSheet, type ViewStyle } from 'react-native';

export function shouldUseNativeDriverForPlatform(platformOS: string) {
  return platformOS !== 'web';
}

/**
 * `box-none` and `box-only` are not CSS. React Native Web drops them from an
 * inline style, and the element then takes every pointer: a full-screen layer
 * of interactive objects left the reader nothing to tap but the objects.
 * Registered here they become the classes that do it — `pointer-events: none`
 * on the element, `auto` on its children for `box-none`.
 */
const REGISTERED_POINTER_EVENTS = StyleSheet.create({
  'box-none': { pointerEvents: 'box-none' },
  'box-only': { pointerEvents: 'box-only' },
});

/**
 * Pointer events as a style. `auto` and `none` come back as plain objects, so
 * they may be spread into another style; `box-none` and `box-only` come back
 * registered, so put them in a style array — spread, they lose their class on
 * the web.
 */
export function getPointerEventsStyle(
  pointerEvents: NonNullable<ViewStyle['pointerEvents']>,
): Pick<ViewStyle, 'pointerEvents'> {
  if (pointerEvents === 'box-none' || pointerEvents === 'box-only') return REGISTERED_POINTER_EVENTS[pointerEvents];
  return { pointerEvents };
}
