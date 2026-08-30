/**
 * The contract both halves of a build agree on.
 *
 * Kept pure and tested apart from the helper because the interesting questions
 * — what an idempotency key means, which transitions are legal, what a message
 * set does with something it has never seen — are answerable in a function, and
 * answering them inside a socket handler is how they end up answered twice and
 * differently.
 */
import {
  applyBuildEvent,
  canApplyBuildEvent,
  createBuildJob,
  isBuildArtifactExpired,
  isTerminalBuildState,
  summarizeBuildJob,
  withBuildLog,
  type BuildJob,
} from '@/lib/release/build-job';
import {
  MAX_BUILD_MESSAGE_BYTES,
  parseBuildClientMessage,
  parseBuildServerMessage,
} from '@/lib/release/build-protocol';
import {
  isBuildRequestId,
  isSameBuildRequest,
  parseBuildRequest,
  type BuildRequest,
} from '@/lib/release/build-request';

const HASH = 'a'.repeat(64);

function request(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    requestId: 'req_one',
    releaseId: 'release_1',
    target: 'apk',
    versionCode: 3,
    payloadHash: HASH,
    ...overrides,
  };
}

describe('a build request', () => {
  it('accepts a well-formed one', () => {
    expect(parseBuildRequest(request())).toEqual(request());
  });

  /**
   * The id becomes a filename in the upload directory and the job store. It
   * arrives over a socket, so it stops being text here rather than being
   * sanitised in three places that could disagree.
   */
  it('refuses an id that could mean something on a filesystem', () => {
    for (const requestId of ['../escape', 'a/b', 'a\\b', '', 'x'.repeat(65), 'has space']) {
      expect(isBuildRequestId(requestId), requestId).toBe(false);
    }
    expect(isBuildRequestId('req_one-2')).toBe(true);
  });

  it('refuses a request missing what a build needs', () => {
    expect(() => parseBuildRequest(null)).toThrow('Invalid build request');
    expect(() => parseBuildRequest(request({ target: 'ipa' as never }))).toThrow('target');
    expect(() => parseBuildRequest(request({ versionCode: 0 }))).toThrow('version code');
    expect(() => parseBuildRequest(request({ payloadHash: 'nope' }))).toThrow('payload hash');
    expect(() => parseBuildRequest(request({ releaseId: '../escape' }))).toThrow('release id');
  });

  /**
   * Same id and same payload is the same job, and a second submit rejoins it.
   * Same id and a different payload is a caller bug, and answering it with the
   * first job's artifact would attribute a build to the wrong release.
   */
  it('knows when two requests are the same job', () => {
    expect(isSameBuildRequest(request(), request())).toBe(true);
    expect(isSameBuildRequest(request(), request({ payloadHash: 'b'.repeat(64) }))).toBe(false);
    expect(isSameBuildRequest(request(), request({ versionCode: 4 }))).toBe(false);
    expect(isSameBuildRequest(request(), request({ target: 'aab' }))).toBe(false);
  });
});

describe('the build state machine', () => {
  const now = '2026-08-30T10:00:00.000Z';
  const job = (): BuildJob => createBuildJob(request(), now);

  it('starts queued and walks to succeeded', () => {
    let current = job();
    for (const event of ['stage', 'submit', 'verify', 'succeed'] as const) {
      current = applyBuildEvent(current, { type: event }, now);
    }
    expect(current.state).toBe('succeeded');
    expect(isTerminalBuildState(current.state)).toBe(true);
  });

  /**
   * Unchanged rather than thrown: a cancel that lands just after a build
   * finished is a race, not a fault, and every caller would otherwise have to
   * work out which of the two it was looking at.
   */
  it('ignores an event that does not belong in the current state', () => {
    const finished = applyBuildEvent(
      applyBuildEvent(
        applyBuildEvent(applyBuildEvent(job(), { type: 'stage' }, now), { type: 'submit' }, now),
        { type: 'verify' }, now,
      ),
      { type: 'succeed' }, now,
    );

    const cancelled = applyBuildEvent(finished, { type: 'cancel' }, now);
    expect(cancelled).toBe(finished);
  });

  it('can fail from anywhere it is still alive', () => {
    for (const state of ['queued', 'staging', 'submitted', 'building', 'verifying'] as const) {
      expect(canApplyBuildEvent(state, 'fail'), state).toBe(true);
    }
    for (const state of ['succeeded', 'cancelled', 'expired'] as const) {
      expect(canApplyBuildEvent(state, 'fail'), state).toBe(false);
    }
  });

  it('only retries from a finished state, and counts the attempt', () => {
    const failed = applyBuildEvent(job(), { type: 'fail', reason: 'boom' }, now);
    expect(failed.failureReason).toBe('boom');

    const retried = applyBuildEvent(failed, { type: 'retry' }, now);
    expect(retried.state).toBe('queued');
    expect(retried.attempt).toBe(2);
    // The previous run's verdict must not be mistaken for this one's.
    expect(retried.failureReason).toBeUndefined();

    expect(applyBuildEvent(job(), { type: 'retry' }, now).state).toBe('queued');
    expect(canApplyBuildEvent('building', 'retry')).toBe(false);
  });

  it('keeps the log bounded so a runaway builder cannot fill the store', () => {
    const lines = Array.from({ length: 40 }, (_, index) => `line ${index}`);
    const logged = withBuildLog(job(), lines, now, 10);
    expect(logged.log).toHaveLength(10);
    expect(logged.log[9]).toBe('line 39');
  });

  it('calls an artifact expired once its stated time has passed', () => {
    const succeeded: BuildJob = {
      ...job(),
      state: 'succeeded',
      artifact: {
        fileName: 'x.apk',
        bytes: 10,
        sha256: HASH,
        expiresAt: '2026-08-30T11:00:00.000Z',
      },
    };
    expect(isBuildArtifactExpired(succeeded, Date.parse('2026-08-30T10:30:00.000Z'))).toBe(false);
    expect(isBuildArtifactExpired(succeeded, Date.parse('2026-08-30T11:30:00.000Z'))).toBe(true);
    // A job that never produced one cannot expire.
    expect(isBuildArtifactExpired(job(), Date.now())).toBe(false);
  });

  // The client is told a summary, not the whole job: the log is asked for.
  it('summarizes without the log', () => {
    const summary = summarizeBuildJob(withBuildLog(job(), ['secret-ish'], now));
    expect(summary).not.toHaveProperty('log');
    expect(summary.requestId).toBe('req_one');
  });
});

describe('the build message set', () => {
  it('reads the messages a client may send', () => {
    expect(parseBuildClientMessage('{"type":"status","requestId":"req_one"}'))
      .toEqual({ type: 'status', requestId: 'req_one' });
    expect(parseBuildClientMessage(JSON.stringify({ type: 'submit', request: request() })))
      .toEqual({ type: 'submit', request: request() });
  });

  /**
   * Refused rather than ignored: a helper that quietly drops what it does not
   * understand leaves a client waiting for an answer that never comes.
   */
  it('refuses a message it has never heard of', () => {
    expect(() => parseBuildClientMessage('{"type":"tool_call"}')).toThrow('Unknown build message');
  });

  it('refuses what is not a message at all', () => {
    expect(() => parseBuildClientMessage('not json')).toThrow('not JSON');
    expect(() => parseBuildClientMessage('[]')).toThrow('not an object');
  });

  /**
   * The archive goes over HTTP. This cap is what stops anyone deciding to put a
   * few hundred megabytes through the socket instead.
   */
  it('refuses a frame larger than the cap', () => {
    const huge = JSON.stringify({ type: 'status', requestId: 'x'.repeat(MAX_BUILD_MESSAGE_BYTES) });
    expect(() => parseBuildClientMessage(huge)).toThrow('too large');
  });

  it('validates helper errors before they reach browser state', () => {
    expect(parseBuildServerMessage(JSON.stringify({
      type: 'error',
      code: 'UNKNOWN_REQUEST',
      message: 'No such build',
      requestId: 'req_one',
    }))).toMatchObject({ code: 'UNKNOWN_REQUEST', requestId: 'req_one' });
    expect(() => parseBuildServerMessage(JSON.stringify({
      type: 'error',
      code: 'MADE_UP',
      message: 'No',
    }))).toThrow('Invalid build error');
    expect(() => parseBuildServerMessage(JSON.stringify({
      type: 'error',
      code: 'UNKNOWN_REQUEST',
      message: 'No',
      requestId: '../escape',
    }))).toThrow('Invalid build error');
  });

  it('rejects malformed artifact metadata and mismatched message states', () => {
    const job = {
      requestId: 'req_one',
      releaseId: 'release_1',
      target: 'apk',
      state: 'succeeded',
      attempt: 1,
      updatedAt: '2026-08-30T10:00:00.000Z',
      artifact: {
        fileName: 'release.apk',
        bytes: 10,
        sha256: HASH,
        expiresAt: '2026-09-06T10:00:00.000Z',
      },
    };
    expect(parseBuildServerMessage(JSON.stringify({ type: 'completed', job })))
      .toMatchObject({ type: 'completed' });
    expect(() => parseBuildServerMessage(JSON.stringify({
      type: 'completed',
      job: { ...job, artifact: { ...job.artifact, fileName: 'bad\r\nname.apk' } },
    }))).toThrow('Invalid build artifact');
    expect(() => parseBuildServerMessage(JSON.stringify({
      type: 'progress',
      job,
    }))).toThrow('does not match job state');
  });
});
