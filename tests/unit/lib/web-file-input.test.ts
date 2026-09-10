import { openWebFileDialog } from '@/lib/web-file-input';

function currentFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('expected a transient file input in the DOM');
  return input;
}

describe('openWebFileDialog', () => {
  afterEach(() => {
    document.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
  });

  it('resolves with the selected file on change', async () => {
    const promise = openWebFileDialog('image/*');
    const input = currentFileInput();
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await expect(promise).resolves.toBe(file);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('resolves null when the dialog fires a cancel event', async () => {
    const promise = openWebFileDialog('application/json');
    const input = currentFileInput();
    input.dispatchEvent(new Event('cancel'));

    await expect(promise).resolves.toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('resolves null via the focus fallback when nothing was selected', async () => {
    vi.useFakeTimers();
    try {
      const promise = openWebFileDialog('application/json');
      // The dialog closed and focus returned with no file chosen.
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(300);
      await expect(promise).resolves.toBeNull();
      expect(document.querySelector('input[type="file"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cancel via focus when a file was actually chosen', async () => {
    vi.useFakeTimers();
    try {
      const promise = openWebFileDialog('image/*');
      const input = currentFileInput();
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      // change fires, then focus returns — the deferred focus check must be a no-op.
      input.dispatchEvent(new Event('change'));
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(300);
      await expect(promise).resolves.toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });
});
