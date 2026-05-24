/**
 * Reader-only audio session. Playback through enhancedAudioManager is allowed
 * only while the reader screen is focused, the session is active, and UI is not blocked.
 */

let activeSessionId: number | null = null;
let sessionEpoch = 0;
let playbackSuspended = false;

export function activateReaderAudioSession(): number {
  sessionEpoch += 1;
  activeSessionId = sessionEpoch;
  playbackSuspended = false;
  return activeSessionId;
}

export function deactivateReaderAudioSession(): void {
  activeSessionId = null;
  playbackSuspended = false;
  sessionEpoch += 1;
}

export function suspendReaderAudioSession(): void {
  playbackSuspended = true;
  sessionEpoch += 1;
}

export function resumeReaderAudioSession(): void {
  playbackSuspended = false;
}

export function isReaderAudioSessionActive(): boolean {
  return activeSessionId !== null && !playbackSuspended;
}

export function isReaderAudioSessionValid(sessionId: number): boolean {
  return activeSessionId === sessionId && !playbackSuspended;
}

export function getReaderAudioSessionId(): number | null {
  return activeSessionId;
}
