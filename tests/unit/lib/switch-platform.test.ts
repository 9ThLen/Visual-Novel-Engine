import { getSwitchActiveThumbProps } from '@/lib/switch-platform';

describe('getSwitchActiveThumbProps', () => {
  it('names the active knob colour on web, where thumbColor stops applying', () => {
    expect(getSwitchActiveThumbProps('web', '#FFFFFF')).toEqual({ activeThumbColor: '#FFFFFF' });
  });

  it('passes nothing to the native Switch, which has no such prop', () => {
    expect(getSwitchActiveThumbProps('ios', '#FFFFFF')).toEqual({});
    expect(getSwitchActiveThumbProps('android', '#FFFFFF')).toEqual({});
  });
});
