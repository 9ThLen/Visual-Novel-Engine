import { showToast, useToastStore } from '@/lib/toast-store';

describe('toast-store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('adds info toasts by default', () => {
    showToast('Saved');

    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Saved', type: 'info' }),
    ]);
  });

  it('keeps the three newest toasts', () => {
    showToast('One');
    showToast('Two');
    showToast('Three');
    showToast('Four', 'error');

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'Two',
      'Three',
      'Four',
    ]);
  });

  it('dismisses a toast by id', () => {
    const id = showToast('Remove me', 'success');

    useToastStore.getState().dismissToast(id);

    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
