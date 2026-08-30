/**
 * The seam every native build goes through.
 *
 * One interface, so `eas`, `github-actions` and `local` are three
 * implementations of the same contract rather than three shapes the helper has
 * to know about. Only two exist here: a fake one, which is what R7's acceptance
 * runs against, and EAS, which refuses until R9 has produced a project to build.
 *
 * The interface is deliberately narrow. A builder is handed a staged file and a
 * target and reports back; it is not given the socket, the job store or the
 * client. Anything a builder could say that should not reach a browser passes
 * through the sanitizer on the way out, and a builder that could bypass that by
 * writing to the client directly would make the sanitizer decorative.
 */
import type { BuildRequest } from '../../../lib/release/build-request';

export interface BuilderInput {
  request: BuildRequest;
  /** The verified `.vnerelease` on disk. */
  archivePath: string;
  /** Where the builder should leave what it produces. */
  outputDirectory: string;
  /** Raw output; the helper sanitizes before anyone else sees it. */
  onLog: (line: string) => void;
  /** Resolves when the client asked to stop. */
  signal: AbortSignal;
}

export interface BuilderResult {
  artifactPath: string;
  fileName: string;
}

export interface Builder {
  readonly name: string;
  /**
   * Whether this builder can run at all right now, and why not. Asked before a
   * job leaves `queued`, so an author on an unconfigured machine is told
   * immediately rather than after an upload.
   */
  readiness(): Promise<{ ready: true } | { ready: false; reason: string }>;
  build(input: BuilderInput): Promise<BuilderResult>;
}

export interface FakeBuilderOptions {
  /** Milliseconds between progress lines. Zero in tests. */
  stepMs?: number;
  /** Make the build fail after this many steps, to exercise the failure path. */
  failAfterSteps?: number;
  /** Bytes to write into the fake artifact. */
  artifactBytes?: number;
}

const FAKE_STEPS = [
  'Resolving build configuration',
  'Uploading project archive',
  'Waiting for a build worker',
  'Compiling',
  'Signing',
];

/**
 * A builder that does everything except build.
 *
 * R7 exists to prove the transport, the upload and the state machine survive
 * abuse — reloads, cancels, retries, a resubmitted idempotency key. None of that
 * needs a cloud account, and requiring one would mean the kernel could not be
 * tested until R9 shipped.
 */
export class FakeBuilder implements Builder {
  readonly name = 'fake';

  constructor(private readonly options: FakeBuilderOptions = {}) {}

  async readiness(): Promise<{ ready: true }> {
    return { ready: true };
  }

  async build(input: BuilderInput): Promise<BuilderResult> {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const path = await import('node:path');
    const stepMs = this.options.stepMs ?? 0;

    for (const [index, step] of FAKE_STEPS.entries()) {
      if (input.signal.aborted) throw new Error('Build cancelled');
      if (this.options.failAfterSteps !== undefined && index >= this.options.failAfterSteps) {
        throw new Error(`Fake build failed at "${step}"`);
      }
      input.onLog(step);
      if (stepMs > 0) await new Promise((resolve) => setTimeout(resolve, stepMs));
    }

    mkdirSync(input.outputDirectory, { recursive: true });
    const fileName = `${input.request.requestId}.${input.request.target}`;
    const artifactPath = path.join(input.outputDirectory, fileName);
    writeFileSync(artifactPath, new Uint8Array(this.options.artifactBytes ?? 1024).fill(7));
    return { artifactPath, fileName };
  }
}

/**
 * The real one, once there is something to submit.
 *
 * R9 built the half that can be checked: `tools/vne-build` turns a verified
 * `.vnerelease` into an Expo project with the story inside it, the editor out of
 * it and the file pickers unlinked. That runs, and it is tested — through
 * `pnpm stage:android`, which is the command that exists today.
 *
 * Submitting does not run. `eas build` needs an Expo account, credentials the
 * account owns, and a paid queue; no build has ever gone through this helper. So
 * this refuses, and the job never leaves `queued` — the server asks
 * {@link readiness} before staging anything, which is the right order: an author
 * on an unconfigured machine should be told before an upload, not after.
 *
 * It would have been easy to have `build()` stage and then throw. It was written
 * that way and taken back out: the server never reaches `build()` while
 * readiness is false, so that code could not run, and the documentation around
 * it claimed a path the helper does not have. An unreachable branch that reads
 * like a working feature is worse than an honest refusal.
 */
export class EasBuilder implements Builder {
  readonly name = 'eas';


  async readiness(): Promise<{ ready: true } | { ready: false; reason: string }> {
    return {
      ready: false,
      reason:
        'Submitting an Android build from the helper is not implemented — no build has ever '
        + 'run through it. Stage the project with `pnpm stage:android` and run `eas build` '
        + 'in it; see wiki/releases-android.md.',
    };
  }

  async build(): Promise<BuilderResult> {
    // Deliberately unimplemented rather than half-implemented: a submit-poll-
    // download-verify path that has never run against a real account would be a
    // guess in the shape of working code.
    throw new Error('Submitting an Android build from the helper is not implemented; see R9 in RELEASE-PLAN.md.');
  }
}
