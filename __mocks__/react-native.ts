const React = require('react');

function flattenStyle(style: any): any {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle).filter(Boolean));
  }
  if (typeof style === 'function') return flattenStyle(style({ pressed: false }));
  return style || undefined;
}

function domProps(props: any = {}) {
  const {
    accessibilityHint,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    accessible,
    children,
    className,
    disabled,
    numberOfLines,
    onPress,
    onPressIn,
    onPressOut,
    style,
    testID,
    ...rest
  } = props;

  return {
    ...rest,
    ...(className ? { className } : {}),
    ...(testID ? { 'data-testid': testID } : {}),
    ...(accessibilityRole ? { role: accessibilityRole } : {}),
    ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
    ...(accessibilityHint ? { 'aria-description': accessibilityHint } : {}),
    ...(accessibilityState?.disabled || disabled ? { 'aria-disabled': true, disabled: true } : {}),
    style: flattenStyle(style),
    onClick: disabled ? undefined : onPress,
    onMouseDown: disabled ? undefined : onPressIn,
    onMouseUp: disabled ? undefined : onPressOut,
    children,
  };
}

function createElement(tag: string) {
  return React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...domProps(props), ref }));
}

export const Platform = {
  OS: 'web',
  select: (options: Record<string, any>) => options.web ?? options.default,
};
export const NativeModules = {};
export const DeviceInfo = {};
export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
export const PixelRatio = { get: () => 2 };
export const StyleSheet = {
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  create: (s: any) => s,
};
export const View = createElement('div');
export const Text = createElement('span');
export const Pressable = createElement('button');
export const Image = createElement('img');
export const ScrollView = createElement('div');
export const FlatList = createElement('div');
export const Modal = createElement('div');
export const ActivityIndicator = createElement('div');
export const Alert = { alert: () => {} };
export const AppState = { currentState: 'active', addEventListener: () => ({ remove: () => {} }) };
export const Linking = { openURL: () => Promise.resolve(), addEventListener: () => ({ remove: () => {} }) };
export const Appearance = { getColorScheme: () => 'light', addChangeListener: () => ({ remove: () => {} }) };
export const StatusBar = { currentHeight: 24 };
export const Keyboard = { addListener: () => ({ remove: () => {} }) };
export const useWindowDimensions = () => ({ width: 390, height: 844 });
export const Animated = {
  View,
  Text,
  multiply: (value: number, multiplier: number) => Number(value || 0) * multiplier,
  timing: () => ({ start: () => {} }),
  Value: class { constructor(v: number) { this._value = v } _value: number; setValue(v: number) { this._value = v } },
};
export const Easing = { linear: (t: number) => t, ease: (t: number) => t };

const mock = { Platform, NativeModules, StyleSheet };
export default mock;
