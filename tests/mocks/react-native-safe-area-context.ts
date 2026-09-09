/**
 * The real package ships sources this harness cannot parse, which is why any
 * screen using ScreenContainer could not be rendered in a test at all. Insets
 * are irrelevant to the logic under test, so zero is the honest stand-in.
 */
import React from 'react';
import { View } from 'react-native';

const INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export const useSafeAreaInsets = () => INSETS;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });
export const initialWindowMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: INSETS };

export function SafeAreaProvider({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

/** Renders through RN's View so array styles are normalised like everywhere else. */
export function SafeAreaView({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) {
  return React.createElement(View, props as Record<string, unknown>, children);
}
