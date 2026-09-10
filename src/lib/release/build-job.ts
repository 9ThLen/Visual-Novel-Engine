/**
 * The life of one build, as a state machine.
 *
 * Kept pure and apart from the helper that runs it, because the interesting
 * failures are not in the socket — they are in what happens when a browser
 * reloads mid-build, when the same request arrives twice, when a cancel lands
 * after a build already finished. Those are answerable here, in a function, and
 * so they are answered here rather than in an if-statement inside a message
 * handler.
 *
 * `verifying` is a state rather than a step inside `building` on purpose: the
 * helper re-checks the artifact it got back before handing it over, and a build
 * that produced something unusable must fail differently from one that never
 * produced anything.
 */
import type { BuildRequest, BuildTarget } from '@/lib/release/build-request';

export const BUILD_STATES = [
  'queued',
  'staging',
  'submitted',
  'building',
  'verifying',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const;

export type BuildState = (typeof BUILD_STATES)[number];

/** Nothing further happens on its own from here. */
export const TERMINAL_BUILD_STATES: readonly BuildState[] = [
  'succeeded',
  'failed',
  'cancelled',
  'expired',
];

export type BuildEvent =
  | { type: 'stage' }
  | { type: 'submit' }
  | { type: 'progress' }
  | { type: 'verify' }
  | { type: 'succeed' }
  | { type: 'fail'; reason: string }
  | { type: 'cancel' }
  | { type: 'expire' }
  | { type: 'retry' };

export interface BuildArtifact {
  fileName: string;
  bytes: number;
  sha256: string;
  /** When the artifact stops being downloadable. Shown, never implied. */
  expiresAt: string;
}

export interface BuildJob {
  request: BuildRequest;
  state: BuildState;
  createdAt: string;
  updatedAt: string;
  /** Increments on every retry, so a log line can say which attempt it belongs to. */
  attempt: number;
  /** Set once the upload has landed and been verified against `payloadHash`. */
  uploadedBytes?: number;
  artifact?: BuildArtifact;
  failureReason?: string;
  /** Sanitized; see `tools/build-helper/src/log-sanitizer.ts`. */
  log: string[];
}

/**
 * Which states each event may be applied in.
 *
 * A table rather than a switch: the shape of what is allowed is the thing worth
 * reading, and a missing entry is a refusal rather than an accident.
 */
const ALLOWED_FROM: Record<BuildEvent['type'], readonly BuildState[]> = {
  stage: ['queued'],
  submit: ['staging'],
  progress: ['submitted', 'building'],
  verify: ['building', 'submitted'],
  succeed: ['verifying'],
  // A build can fail at any point it is still alive, including while verifying.
  fail: ['queued', 'staging', 'submitted', 'building', 'verifying'],
  cancel: ['queued', 'staging', 'submitted', 'building', 'verifying'],
  expire: ['succeeded'],
  retry: ['failed', 'cancelled', 'expired'],
};

const NEXT_STATE: Record<BuildEvent['type'], BuildState> = {
  stage: 'staging',
  submit: 'submitted',
  progress: 'building',
  verify: 'verifying',
  succeed: 'succeeded',
  fail: 'failed',
  cancel: 'cancelled',
  expire: 'expired',
  retry: 'queued',
};

export function isTerminalBuildState(state: BuildState): boolean {
  return TERMINAL_BUILD_STATES.includes(state);
}

export function canApplyBuildEvent(state: BuildState, event: BuildEvent['type']): boolean {
  return ALLOWED_FROM[event]?.includes(state) ?? false;
}

export function createBuildJob(request: BuildRequest, now: string): BuildJob {
  return {
    request,
    state: 'queued',
    createdAt: now,
    updatedAt: now,
    attempt: 1,
    log: [],
  };
}

/**
 * Apply an event, or return the job unchanged.
 *
 * Unchanged rather than thrown: a cancel that arrives just after a build
 * finished is a race, not a fault, and every caller of this would otherwise have
 * to guess which of the two it was looking at.
 */
export function applyBuildEvent(job: BuildJob, event: BuildEvent, now: string): BuildJob {
  if (!canApplyBuildEvent(job.state, event.type)) return job;

  const next: BuildJob = {
    ...job,
    state: NEXT_STATE[event.type],
    updatedAt: now,
  };

  if (event.type === 'fail') next.failureReason = event.reason;
  if (event.type === 'retry') {
    next.attempt = job.attempt + 1;
    // A retry is a new attempt at the same request, so the previous run's
    // verdict must not be mistaken for this one's.
    delete next.failureReason;
    delete next.artifact;
  }

  return next;
}

export function withBuildArtifact(job: BuildJob, artifact: BuildArtifact, now: string): BuildJob {
  return { ...job, artifact, updatedAt: now };
}

export function withBuildLog(job: BuildJob, lines: readonly string[], now: string, max = 500): BuildJob {
  if (lines.length === 0) return job;
  // Bounded: a runaway builder must not turn the job store into a log file.
  const log = [...job.log, ...lines].slice(-max);
  return { ...job, log, updatedAt: now };
}

/** A finished artifact whose time is up, from the reader's clock. */
export function isBuildArtifactExpired(job: BuildJob, now: number): boolean {
  if (job.state !== 'succeeded' || !job.artifact) return false;
  return Date.parse(job.artifact.expiresAt) <= now;
}

export interface BuildJobSummary {
  requestId: string;
  releaseId: string;
  target: BuildTarget;
  state: BuildState;
  attempt: number;
  updatedAt: string;
  /** A queued job whose archive never finished uploading can be resumed by the browser. */
  needsUpload?: boolean;
  artifact?: BuildArtifact;
  failureReason?: string;
}

/** What a client is told. Deliberately not the whole job: the log is asked for. */
export function summarizeBuildJob(job: BuildJob): BuildJobSummary {
  const summary: BuildJobSummary = {
    requestId: job.request.requestId,
    releaseId: job.request.releaseId,
    target: job.request.target,
    state: job.state,
    attempt: job.attempt,
    updatedAt: job.updatedAt,
  };
  if (job.state === 'queued' && job.uploadedBytes === undefined) summary.needsUpload = true;
  if (job.artifact) summary.artifact = job.artifact;
  if (job.failureReason) summary.failureReason = job.failureReason;
  return summary;
}
