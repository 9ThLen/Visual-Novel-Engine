import React from 'react';
import { render, screen } from '@testing-library/react';

import { AppearancePreviewCard } from '@/components/ai-chat/AppearancePreviewCard';

describe('AppearancePreviewCard', () => {
  it('shows the reader layout before and after values', () => {
    render(
      <AppearancePreviewCard
        description={{
          storyId: 'story-1',
          colors: [],
          warnings: [],
          layoutPreset: { before: 'compact', after: 'top' },
        }}
        explanation="Move dialogue"
        onApply={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText('Layout preset')).toBeTruthy();
    expect(screen.getByText('compact → top')).toBeTruthy();
  });
});
