/**
 * The web half of the sound picker. Format and size are judged before the file
 * is turned into an object URL, so a rejected file never reaches memory or the
 * media library.
 */
import { pickAudioFromDevice } from '@/lib/pick-audio';
import { MAX_AUDIO_ASSET_BYTES } from '@/lib/media-library-service';

function currentFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('expected a transient file input in the DOM');
  return input;
}

/** Drive the dialog the way a browser does: put a file on it, fire change. */
function chooseFile(file: File | null): void {
  const input = currentFileInput();
  Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  input.dispatchEvent(new Event(file ? 'change' : 'cancel'));
}

function sizedFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

beforeEach(() => {
  // jsdom cannot decode audio; the picker only ever reads the metadata header,
  // and a probe that never fires would hold the promise for its whole timeout.
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const element = createElement(tag, options);
    if (tag === 'audio') {
      Object.defineProperty(element, 'duration', { value: 42, configurable: true });
      // `src` is what starts the load, so that is where the fake load ends.
      Object.defineProperty(element, 'src', {
        configurable: true,
        set() {
          queueMicrotask(() => (element as HTMLAudioElement).onloadedmetadata?.(new Event('loadedmetadata')));
        },
        get: () => '',
      });
    }
    return element;
  });
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: vi.fn(() => 'blob:audio'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.querySelectorAll('input[type="file"]').forEach((element) => element.remove());
});

describe('pickAudioFromDevice on web', () => {
  it('returns the chosen file with its duration read from the header', async () => {
    const promise = pickAudioFromDevice();
    chooseFile(sizedFile('theme.mp3', 'audio/mpeg', 2048));

    await expect(promise).resolves.toEqual({
      status: 'picked',
      audio: expect.objectContaining({
        uri: 'blob:audio',
        name: 'theme.mp3',
        size: 2048,
        mimeType: 'audio/mpeg',
        durationSeconds: 42,
      }),
    });
  });

  it('reports a cancelled dialog rather than an error', async () => {
    const promise = pickAudioFromDevice();
    chooseFile(null);

    await expect(promise).resolves.toEqual({ status: 'cancelled' });
  });

  it('refuses a format expo-audio cannot play', async () => {
    const promise = pickAudioFromDevice();
    chooseFile(sizedFile('track.flac', 'audio/flac', 2048));

    await expect(promise).resolves.toEqual({ status: 'unsupportedType', mimeType: 'audio/flac' });
    // Rejected before any object URL was made.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('refuses a file too large to survive a backup', async () => {
    const promise = pickAudioFromDevice();
    chooseFile(sizedFile('epic.wav', 'audio/wav', MAX_AUDIO_ASSET_BYTES + 1));

    await expect(promise).resolves.toEqual({
      status: 'tooLarge',
      size: MAX_AUDIO_ASSET_BYTES + 1,
      limit: MAX_AUDIO_ASSET_BYTES,
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  // A picker that reports no MIME type at all is routine on Android, and the
  // extension is then the only thing left to judge the file by.
  it('falls back to the extension when the picker reports no type', async () => {
    const promise = pickAudioFromDevice();
    chooseFile(sizedFile('sting.m4a', '', 1024));

    await expect(promise).resolves.toMatchObject({
      status: 'picked',
      audio: expect.objectContaining({ mimeType: 'audio/mp4' }),
    });
  });
});
