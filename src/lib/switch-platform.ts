import type { SwitchProps } from 'react-native';

/**
 * react-native-web stops honouring `thumbColor` the moment a switch is on and
 * falls back to its own teal knob, so the colour has to be named again for the
 * active state. The prop does not exist in the native Switch API, which is why
 * it is only handed over on web.
 */
export function getSwitchActiveThumbProps(platformOS: string, color: string): Partial<SwitchProps> {
  if (platformOS !== 'web') return {};
  return { activeThumbColor: color } as Partial<SwitchProps>;
}
