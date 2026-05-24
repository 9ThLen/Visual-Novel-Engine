import { describe, it, expect, beforeEach } from 'vitest';
import {
  activateReaderAudioSession,
  deactivateReaderAudioSession,
  isReaderAudioSessionActive,
  isReaderAudioSessionValid,
  suspendReaderAudioSession,
  resumeReaderAudioSession,
} from '../../lib/reader-audio-session';

describe('reader-audio-session', () => {
  beforeEach(() => {
    deactivateReaderAudioSession();
  });

  it('starts inactive', () => {
    expect(isReaderAudioSessionActive()).toBe(false);
  });

  it('activates and validates session id', () => {
    const id = activateReaderAudioSession();
    expect(isReaderAudioSessionActive()).toBe(true);
    expect(isReaderAudioSessionValid(id)).toBe(true);
  });

  it('deactivate invalidates prior session', () => {
    const id = activateReaderAudioSession();
    deactivateReaderAudioSession();
    expect(isReaderAudioSessionActive()).toBe(false);
    expect(isReaderAudioSessionValid(id)).toBe(false);
  });

  it('suspend blocks playback until resumed', () => {
    const id = activateReaderAudioSession();
    suspendReaderAudioSession();
    expect(isReaderAudioSessionActive()).toBe(false);
    expect(isReaderAudioSessionValid(id)).toBe(false);
    resumeReaderAudioSession();
    expect(isReaderAudioSessionActive()).toBe(true);
    expect(isReaderAudioSessionValid(id)).toBe(true);
  });
});
