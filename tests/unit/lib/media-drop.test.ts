/**
 * Sorting dropped files into the three things a story can hold.
 *
 * One drop can carry a background, a clip and two sounds, and the gesture says
 * nothing about which is which. These are the rules that decide, before any of
 * the bytes are read.
 */
import { classifyDroppedFiles, droppedFileKind } from '@/lib/media-drop';

const file = (name: string, type = '') => ({ name, type });

describe('what a dropped file is', () => {
  it('believes the browser when it declares a type', () => {
    expect(droppedFileKind(file('room.png', 'image/png'))).toBe('image');
    expect(droppedFileKind(file('intro.mp4', 'video/mp4'))).toBe('video');
    expect(droppedFileKind(file('theme.mp3', 'audio/mpeg'))).toBe('audio');
    // Case and parameters are the browser's business, not the caller's.
    expect(droppedFileKind(file('rain.wav', 'AUDIO/WAV; charset=binary'))).toBe('audio');
  });

  // A drop out of an archive or a network share often declares nothing at all,
  // and refusing those would fail exactly where dropping is handiest.
  it('falls back to the extension when nothing is declared', () => {
    expect(droppedFileKind(file('room.PNG'))).toBe('image');
    expect(droppedFileKind(file('intro.mp4'))).toBe('video');
    expect(droppedFileKind(file('door.m4a'))).toBe('audio');
    expect(droppedFileKind(file('notes.txt'))).toBeNull();
    expect(droppedFileKind(file('no-extension'))).toBeNull();
  });

  // A declared type the library cannot take is an answer, not a gap: an .avi is
  // a video, and guessing again from its name would only find the same file.
  it('refuses a media type the library cannot take', () => {
    expect(droppedFileKind(file('old.avi', 'video/x-msvideo'))).toBeNull();
    expect(droppedFileKind(file('voice.flac', 'audio/flac'))).toBeNull();
  });

  it('splits one drop into the three paths and what is left over', () => {
    const groups = classifyDroppedFiles([
      file('room.png', 'image/png'),
      file('intro.mp4', 'video/mp4'),
      file('theme.mp3', 'audio/mpeg'),
      file('rain.wav'),
      file('notes.txt', 'text/plain'),
    ]);

    expect(groups.image.map((entry) => entry.name)).toEqual(['room.png']);
    expect(groups.video.map((entry) => entry.name)).toEqual(['intro.mp4']);
    expect(groups.audio.map((entry) => entry.name)).toEqual(['theme.mp3', 'rain.wav']);
    expect(groups.rejected.map((entry) => entry.name)).toEqual(['notes.txt']);
  });

  it('has an answer for a drop of nothing', () => {
    expect(classifyDroppedFiles([])).toEqual({ image: [], video: [], audio: [], rejected: [] });
  });
});
