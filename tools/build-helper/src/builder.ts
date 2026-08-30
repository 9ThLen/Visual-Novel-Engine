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
 * The real one — as far as it has been run.
 *
 * Staging is implemented and tested: it turns the verified `.vnerelease` into an
 * Expo project with the story inside it, the editor out of it and the file
 * pickers unlinked, and it checks the result rather than assuming it. That part
 * runs here, for real, and leaves a project the author can build.
 *
 * Submitting it does not. `eas build` needs an Expo account, credentials the
 * account owns, and a paid queue; no build has ever been run through this
 * helper, and a submit-and-poll-and-verify path written blind would be a guess
 * in the shape of working code — the exact thing that makes a pipeline look
 * finished and fail on someone else's machine. So it stops at the line it has
 * not crossed and says where the staged project is.
 */
export class EasBuilder implements Builder {
  readonly name = 'eas';

  /**
   * `repoRoot` is what gets copied into the staged project. It defaults to the
   * working directory because the helper is started from the repository
   * (`pnpm build-helper`); `main.ts` passes the resolved path anyway, so the
   * default only covers a caller that constructed one directly.
   */
  constructor(
    private readonly repoRoot: string = process.cwd(),
    private readonly stagedProjectDir?: string,
  ) {}

  async readiness(): Promise<{ ready: true } | { ready: false; reason: string }> {
    return {
      ready: false,
      reason:
        'Submitting an Android build is not implemented: no build has ever been run through '
        + 'this helper. Staging works — the job will leave you a project to build by hand.',
    };
  }

  async build(input: BuilderInput): Promise<BuilderResult> {
    const path = await import('node:path');
    const { stageAndroidProject, verifyStagedAndroidProject } = await import(
      '../../vne-build/stage-android'
    );

    const outDir = this.stagedProjectDir
      ?? path.join(input.outputDirectory, `${input.request.requestId}-android`);

    input.onLog('Staging the Android project');
    const staged = await stageAndroidProject({
      releaseFile: input.archivePath,
      outDir,
      repoRoot: this.repoRoot,
    });
    input.onLog(
      `Staged ${staged.identity.applicationId} ${staged.identity.version} `
      + `(version code ${staged.identity.androidVersionCode})`,
    );
    input.onLog(`${staged.mediaFiles.length} media file(s); dropped ${staged.prunedAssets} unused asset(s)`);

    if (staged.unresolvedModules.length > 0) {
      throw new Error(
        `The staged project is missing ${staged.unresolvedModules.length} module(s) the player imports.`,
      );
    }
    const problems = verifyStagedAndroidProject(outDir);
    if (problems.length > 0) throw new Error(`The staged project is not usable: ${problems[0]}`);
    input.onLog('Verified the staged project');

    const profile = input.request.target === 'aab' ? 'player-aab' : 'player-apk';
    throw new Error(
      `The project is staged and checked, and submitting it is not implemented. `
      + `Build it with: eas build --platform android --profile ${profile}`,
    );
  }
}
