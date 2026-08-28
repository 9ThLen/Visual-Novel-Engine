import { fireEvent, render } from '@testing-library/react';

import { PostFinaleRating } from '@/components/reader/PostFinaleRating';

describe('PostFinaleRating', () => {
  it('shows an explicit completion action when a rating is not requested', () => {
    const onDismiss = vi.fn();
    const screen = render(
      <PostFinaleRating
        sceneName="Final scene"
        onSubmit={vi.fn()}
        onDismiss={onDismiss}
        showRating={false}
        dismissLabel="Restart story"
      />,
    );

    expect(screen.getByText('Ending unlocked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restart story' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
