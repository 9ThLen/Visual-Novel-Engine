/**
 * What the app asks a build helper for.
 *
 * Small on purpose. The app never runs a toolchain and never holds a signing
 * credential; it hands over a release and a target and then watches. Everything
 * that could identify an account, a keystore or a cloud project belongs to the
 * helper and must never travel in this direction.
 *
 * `requestId` is an **idempotency key**, not a name. A native build costs money
 * and minutes, so a reconnect, a double click or a retried socket must rejoin
 * the job that is already running rather than start a second one. That only
 * works if the same id can never come to mean a different payload — which is why
 * `payloadHash` travels with it and why the helper refuses a reused id whose
 * hash has changed.
 */

export const BUILD_TARGETS = ['apk', 'aab'] as const;
export type BuildTarget = (typeof BUILD_TARGETS)[number];

export const BUILD_LIMITS = {
  /**
   * The largest release the helper will accept. Above Play's own per-device
   * ceiling by a wide margin — the point is to refuse a runaway upload early,
   * not to enforce a store's policy, which belongs to the channel.
   */
  maxUploadBytes: 2 * 1024 * 1024 * 1024,
  /** An upload that stops mid-stream leaves a `.part`; this is when it is swept. */
  abandonedUploadMs: 60 * 60 * 1000,
  /** How long a finished artifact stays downloadable. Shown, not implied. */
  artifactTtlMs: 7 * 24 * 60 * 60 * 1000,
  maxRequestIdLength: 64,
} as const;

export interface BuildRequest {
  /** The idempotency key. See the note above. */
  requestId: string;
  releaseId: string;
  target: BuildTarget;
  /** Android's monotonic build number. The helper owns nothing about it. */
  versionCode: number;
  /** SHA-256 of the `.vnerelease` payload this request is for. */
  payloadHash: string;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A request id is used as a filename by the upload endpoint and the job store,
 * so it is restricted to characters that cannot mean anything else on a
 * filesystem. Rejecting here is cheaper than sanitising in three places.
 */
export function isBuildRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= BUILD_LIMITS.maxRequestIdLength
    && REQUEST_ID_PATTERN.test(value);
}

export function parseBuildRequest(value: unknown): BuildRequest {
  const raw = isRecord(value) ? value : null;
  if (!raw) throw new Error('Invalid build request');

  if (!isBuildRequestId(raw.requestId)) throw new Error('Invalid build request id');
  if (typeof raw.releaseId !== 'string' || !raw.releaseId.trim()) {
    throw new Error('Invalid build release id');
  }
  if (typeof raw.target !== 'string' || !BUILD_TARGETS.includes(raw.target as BuildTarget)) {
    throw new Error('Invalid build target');
  }
  if (!Number.isSafeInteger(raw.versionCode) || (raw.versionCode as number) < 1) {
    throw new Error('Invalid build version code');
  }
  if (typeof raw.payloadHash !== 'string' || !SHA256_PATTERN.test(raw.payloadHash)) {
    throw new Error('Invalid build payload hash');
  }

  return {
    requestId: raw.requestId,
    releaseId: raw.releaseId,
    target: raw.target as BuildTarget,
    versionCode: raw.versionCode as number,
    payloadHash: raw.payloadHash,
  };
}

/**
 * Whether two requests are the same job.
 *
 * Same id and same payload: the same job, and a second submit rejoins it. Same
 * id and a different payload is not a coincidence to resolve — it is a caller
 * bug, and answering it with the first job's result would attribute one build to
 * a release it was never made from.
 */
export function isSameBuildRequest(a: BuildRequest, b: BuildRequest): boolean {
  return a.requestId === b.requestId
    && a.payloadHash === b.payloadHash
    && a.releaseId === b.releaseId
    && a.target === b.target
    && a.versionCode === b.versionCode;
}
