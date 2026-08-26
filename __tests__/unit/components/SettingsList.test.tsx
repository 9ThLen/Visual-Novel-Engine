/**
 * The grouped-list atoms behind the settings screen. What matters here is the
 * shape of a group — hairlines between rows and nowhere else, a footnote that
 * belongs to the group rather than to a row, and a group that keeps its note
 * when it has nothing to list.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SEPARATOR_INSET, SettingsGroup, SettingsRow } from '@/components/settings/list';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

describe('SettingsGroup', () => {
  it('separates rows from each other and not from the group edges', () => {
    const { container } = render(
      <SettingsGroup title="Audio">
        <SettingsRow icon="music" label="Music" />
        <SettingsRow icon="voice" label="Voice" />
        <SettingsRow icon="sound" label="Effects" />
      </SettingsGroup>,
    );

    const separators = container.querySelectorAll(`[style*="margin-left: ${SEPARATOR_INSET}px"]`);
    expect(separators).toHaveLength(2);
  });

  it('carries its explanation as a footnote under the rows', () => {
    render(
      <SettingsGroup title="Storage" footer="This browser may clear your stories.">
        <SettingsRow icon="storage" label="Used" value="4 KB" />
      </SettingsGroup>,
    );

    expect(screen.getByText('Used')).toBeTruthy();
    expect(screen.getByText('4 KB')).toBeTruthy();
    expect(screen.getByText('This browser may clear your stories.')).toBeTruthy();
  });

  it('keeps the footnote and drops the surface when there is nothing to list', () => {
    const { container } = render(
      <SettingsGroup title="Storage" footer="This browser cannot say.">{null}</SettingsGroup>,
    );

    expect(screen.getByText('This browser cannot say.')).toBeTruthy();
    expect(container.querySelectorAll(`[style*="margin-left: ${SEPARATOR_INSET}px"]`)).toHaveLength(0);
  });
});

describe('SettingsRow', () => {
  it('reads as a button only when it does something', () => {
    const onPress = vi.fn();
    render(
      <SettingsGroup>
        <SettingsRow icon="cloud" label="Cloud backup" chevron onPress={onPress} />
        <SettingsRow icon="globe" label="Language" />
      </SettingsGroup>,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SegmentedControl', () => {
  it('announces each segment under the control it belongs to, and marks the current one', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        accessibilityLabel="Text size"
        value="medium"
        options={[
          { value: 'small', label: 'A', accessibilityLabel: 'Small' },
          { value: 'medium', label: 'A', accessibilityLabel: 'Medium' },
          { value: 'large', label: 'A', accessibilityLabel: 'Large' },
        ]}
        onChange={onChange}
      />,
    );

    const current = screen.getByLabelText('Text size: Medium');
    expect(current.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Text size: Small').getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByLabelText('Text size: Large'));
    expect(onChange).toHaveBeenCalledWith('large');
  });
});
