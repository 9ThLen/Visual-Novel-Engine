/**
 * Handing the finished bundle to the author.
 *
 * The case worth pinning is the one that is not a failure: closing the save
 * dialog. A browser reports that as an exception, and treating it as one meant
 * the studio answered "I changed my mind" with a red error line.
 */
import { savePlayerBundle } from '@/lib/release/bundle-file';

const BYTES = new Uint8Array([1, 2, 3]);

function stubPicker(behaviour: () => Promise<unknown>): () => void {
  const scope = globalThis as Record<string, unknown>;
  const previous = scope.showSaveFilePicker;
  scope.showSaveFilePicker = behaviour;
  return () => {
    if (previous === undefined) delete scope.showSaveFilePicker;
    else scope.showSaveFilePicker = previous;
  };
}

describe('saving a player bundle', () => {
  it('writes through the picker the author chose', async () => {
    const written: Uint8Array[] = [];
    let closed = false;
    const restore = stubPicker(async () => ({
      createWritable: async () => ({
        write: async (data: Uint8Array) => { written.push(data); },
        close: async () => { closed = true; },
      }),
    }));

    try {
      await expect(savePlayerBundle('story.zip', BYTES)).resolves.toBe(true);
      expect(written).toEqual([BYTES]);
      expect(closed).toBe(true);
    } finally {
      restore();
    }
  });

  /**
   * Downloading anyway would override the author's decision; reporting an error
   * would call it a fault. Neither is what "no thanks" means.
   */
  it('treats a closed dialog as a decision, not a failure', async () => {
    const restore = stubPicker(async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });

    try {
      await expect(savePlayerBundle('story.zip', BYTES)).resolves.toBe(false);
    } finally {
      restore();
    }
  });

  it('still reports a picker that genuinely failed', async () => {
    const restore = stubPicker(async () => {
      throw new Error('disk on fire');
    });

    try {
      await expect(savePlayerBundle('story.zip', BYTES)).rejects.toThrow('disk on fire');
    } finally {
      restore();
    }
  });

  // Browsers without the picker get the ordinary download path.
  it('falls back to a download when the browser offers no picker', async () => {
    const clicked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:stub';
    URL.revokeObjectURL = () => {};
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    };

    try {
      await expect(savePlayerBundle('story.zip', BYTES)).resolves.toBe(true);
      expect(clicked).toEqual(['story.zip']);
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
