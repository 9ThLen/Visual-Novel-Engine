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
export const TextInput = React.forwardRef((props: any, ref: any) => {
  const { onChangeText, value, editable, onSubmitEditing, placeholderTextColor, style, testID, ...rest } = props;
  return React.createElement('input', {
    ...rest,
    ref,
    value,
    disabled: editable === false || undefined,
    style: flattenStyle(style),
    ...(testID ? { 'data-testid': testID } : {}),
    onChange: (e: any) => onChangeText?.(e.target.value),
    onKeyDown: (e: any) => { if (e.key === 'Enter') onSubmitEditing?.(); },
  });
});
/**
 * `source` is React Native's spelling of `src`. Mapping it lets a test assert
 * which file an image actually requested, which is the only way to see that a
 * thumbnail was used instead of the original.
 */
type ImageSource = string | number | { uri?: string } | null | undefined;

export const Image = React.forwardRef(function Image(
  props: Record<string, unknown> & { source?: ImageSource },
  ref: React.Ref<HTMLImageElement>,
) {
  const { source, ...rest } = props;
  const src = typeof source === 'string'
    ? source
    : source && typeof source === 'object' ? source.uri : undefined;
  return React.createElement('img', { ...domProps(rest), ...(src ? { src } : {}), ref });
});
type MockProps = Record<string, unknown>;

/** Exposes the imperative handle callers use; a bare div has no scrollTo. */
export const ScrollView = React.forwardRef((props: MockProps, ref: unknown) => {
  const { contentContainerStyle, style, onScroll: _onScroll, onContentSizeChange: _onSize, children, ...rest } = props;
  React.useImperativeHandle(ref, () => ({
    scrollTo: () => {},
    scrollToEnd: () => {},
    flashScrollIndicators: () => {},
  }), []);
  return React.createElement('div', { ...rest, style: flattenStyle([style, contentContainerStyle]) }, children as React.ReactNode);
});
/**
 * Renders its rows eagerly. A stub that ignored `data`/`renderItem` silently
 * produced an empty list, which makes any grid or list screen untestable.
 */
export const FlatList = React.forwardRef((props: MockProps, ref: unknown) => {
  const { data, renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent,
    contentContainerStyle, getItemLayout: _getItemLayout, style, ...rest } = props;
  const items = Array.isArray(data) ? (data as unknown[]) : [];
  const render = renderItem as ((info: { item: unknown; index: number }) => React.ReactNode) | undefined;
  const key = keyExtractor as ((item: unknown, index: number) => string) | undefined;
  const Empty = ListEmptyComponent as React.ComponentType | undefined;
  const Header = ListHeaderComponent as React.ComponentType | undefined;
  return React.createElement(
    'div',
    { ...rest, ref, style: flattenStyle([style, contentContainerStyle]) },
    Header ? React.createElement(Header) : null,
    items.length === 0 && Empty
      ? React.createElement(Empty)
      : items.map((item, index) => React.createElement(
          React.Fragment,
          { key: key ? key(item, index) : String(index) },
          render?.({ item, index }),
        )),
  );
});
export const Modal = createElement('div');
export const KeyboardAvoidingView = createElement('div');
export const SafeAreaView = createElement('div');
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
  timing: () => ({ start: () => {}, stop: () => {} }),
  loop: (animation: any) => ({ start: () => animation.start?.(), stop: () => animation.stop?.() }),
  sequence: (animations: any[]) => ({ start: () => animations.forEach((animation) => animation.start?.()), stop: () => animations.forEach((animation) => animation.stop?.()) }),
  delay: () => ({ start: () => {}, stop: () => {} }),
  Value: class {
    constructor(v: number) { this._value = v }
    _value: number;
    setValue(v: number) { this._value = v }
    interpolate(config: { outputRange: unknown[] }) { return config.outputRange[0] }
  },
};
export const Easing = { linear: (t: number) => t, ease: (t: number) => t };

const mock = { Platform, NativeModules, StyleSheet };
export default mock;
