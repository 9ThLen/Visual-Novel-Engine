/**
 * Mock for @react-native-community/slider.
 *
 * The package ships untranspiled source the harness's CJS loader cannot parse,
 * and a range input is what the component amounts to anyway: a test can set a
 * value on it and the change reaches `onSlidingComplete`, which is the callback
 * the seek is wired to.
 */
import React from 'react';

interface SliderProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  onValueChange?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  style?: unknown;
  testID?: string;
  [key: string]: unknown;
}

export default function Slider({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  disabled,
  accessibilityLabel,
  onValueChange,
  onSlidingComplete,
  testID,
}: SliderProps) {
  return React.createElement('input', {
    type: 'range',
    role: 'slider',
    value: String(value),
    min: String(minimumValue),
    max: String(maximumValue),
    step: 'any',
    disabled: disabled || undefined,
    ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
    ...(testID ? { 'data-testid': testID } : {}),
    onChange: (event: { target: { value: string } }) => {
      const next = Number(event.target.value);
      onValueChange?.(next);
      onSlidingComplete?.(next);
    },
  });
}
