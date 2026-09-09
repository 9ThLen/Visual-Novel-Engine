import React from 'react';
import { render, screen } from '@testing-library/react';

import { AppModal } from '@/components/ui/AppModal';

// Guards the two react-native-web Modal workarounds: the content must reset the
// modal root's `pointer-events: none`, and a hidden modal must leave the tree.
describe('AppModal', () => {
  it('unmounts its content on the web when not visible', () => {
    render(
      <AppModal visible={false} animationType="fade" transparent>
        <span>dialog body</span>
      </AppModal>,
    );

    expect(screen.queryByText('dialog body')).toBeNull();
  });

  it('renders content with pointer events enabled when visible', () => {
    render(
      <AppModal visible animationType="fade" transparent>
        <span>dialog body</span>
      </AppModal>,
    );

    const content = screen.getByText('dialog body').parentElement!;
    expect(content.style.pointerEvents).toBe('auto');
  });
});
