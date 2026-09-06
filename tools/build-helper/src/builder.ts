/**
 * The seam every native build goes through.
 *
 * One interface, so `eas`, `github-actions` and `local` are three
 * implementations of the same contract rather than three shapes the helper has
 * to know about. Two exist here: a fake one for the service contract and the
 * EAS implementation that stages, submits, follows and downloads an R9 project.
 *
 * The interface is deliberately narrow. A builder is handed a staged file and a
 * target and reports back; it is not given the socket, the job store or the
 * client. Anything a builder could say that should not reach a browser passes
 * through the sanitizer on the way out, and a builder that could bypass that by
 * writing to the client directly would make the sanitizer decorative.
 */
import type { BuildRequest } from '../../../lib/release/build-request';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

import {
  buildArtifactUrl,
  downloadArtifact,
  easExecutable,
  firstBuild,
  followEasBuild,
  jsonFromCli,
  spawnEas,
  type EasCommandResult,
  type RunEasCommand,
} from '../../vne-build/eas-run';
import { apksignerReadiness } from '../../vne-build/apksigner';
import {
  pendingPath,
  replaceFile,
  verifyBuiltArtifact,
  type VerifyOptions,
} from '../../vne-build/verify-artifact';

import {
  isEasProjectId,
  NATIVE_IDENTITY_FILE,
  stageAndroidProject,
} from '../../vne-build/stage-android';

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
    const entries: Record<string, Uint8Array> = input.request.target === 'apk'
      ? { 'AndroidManifest.xml': new Uint8Array([1]), 'classes.dex': new Uint8Array([2]) }
      : {
          'BundleConfig.pb': new Uint8Array([1]),
          'base/manifest/AndroidManifest.xml': new Uint8Array([2]),
          'base/dex/classes.dex': new Uint8Array([3]),
        };
    entries['assets/fake-padding.bin'] = new Uint8Array(this.options.artifactBytes ?? 1024).fill(7);
    const bytes = zipSync(entries, { level: 0 });
    writeFileSync(artifactPath, bytes);
    return { artifactPath, fileName };
  }
}

/** Re-exported: callers of the helper should not have to know where it moved. */
export type { EasCommandResult } from '../../vne-build/eas-run';

/** The real EAS path. Readiness fails before upload when CLI/account/project are unavailable. */
export interface EasBuilderOptions {
  repoRoot?: string;
  /** Durable helper-owned state; keeps one EAS project tied to one novel. */
  stateDirectory?: string;
  easProjectId?: string;
  command?: string;
  pollIntervalMs?: number;
  runCommand?: RunEasCommand;
  stage?: typeof stageAndroidProject;
  download?: (url: string, target: string, signal: AbortSignal) => Promise<void>;
  /**
   * The two seams onto the Android SDK. Injected only so the suite can run on a
   * machine without it -- the defaults are the real thing, and a helper started
   * without either is a helper that cannot certify what it builds.
   */
  apksignerReadiness?: typeof apksignerReadiness;
  signatureAuthority?: VerifyOptions['signatureAuthority'];
}

export class EasBuilder implements Builder {
  readonly name = 'eas';

  private readonly repoRoot: string;
  private readonly easProjectId?: string;
  private readonly stateDirectory: string;
  private readonly command: string;
  private readonly pollIntervalMs: number;
  private readonly runCommand: NonNullable<EasBuilderOptions['runCommand']>;
  private readonly stage: typeof stageAndroidProject;
  private readonly download: NonNullable<EasBuilderOptions['download']>;
  private readonly signingReadiness: typeof apksignerReadiness;
  private readonly signatureAuthority?: VerifyOptions['signatureAuthority'];

  constructor(options: EasBuilderOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.stateDirectory = path.resolve(options.stateDirectory ?? path.join(this.repoRoot, '.vne-builds'));
    this.easProjectId = options.easProjectId;
    this.command = options.command ?? easExecutable();
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.stage = options.stage ?? stageAndroidProject;
    this.download = options.download ?? downloadArtifact;
    this.runCommand = options.runCommand ?? spawnEas(this.command);
    this.signingReadiness = options.apksignerReadiness ?? apksignerReadiness;
    this.signatureAuthority = options.signatureAuthority;
  }

  async readiness(): Promise<{ ready: true } | { ready: false; reason: string }> {
    if (!isEasProjectId(this.easProjectId)) {
      return { ready: false, reason: 'Start the helper with --eas-project-id <UUID> from the author\'s EAS project.' };
    }
    try {
      const version = await this.runCommand(['--version'], { cwd: this.repoRoot });
      if (version.status !== 0) return { ready: false, reason: 'EAS CLI is not available. Install it with npm install -g eas-cli.' };
      const account = await this.runCommand(['whoami'], { cwd: this.repoRoot });
      if (account.status !== 0) return { ready: false, reason: 'EAS CLI is not signed in. Run eas login once.' };
      // Asked here rather than after the build: an artifact that cannot be
      // verified is not one this may hand back, and finding that out afterwards
      // means the author has already paid for it.
      const signing = this.signingReadiness();
      if (!signing.ready) return signing;
      return { ready: true };
    } catch {
      return { ready: false, reason: 'EAS CLI is not available. Install it with npm install -g eas-cli.' };
    }
  }

  async build(input: BuilderInput): Promise<BuilderResult> {
    if (!isEasProjectId(this.easProjectId)) throw new Error('The EAS project id is missing or invalid.');
    const projectDir = path.join(input.outputDirectory, 'project');
    const inspectDir = path.join(input.outputDirectory, 'eas-archive');
    const profile = input.request.target === 'apk' ? 'player-apk' : 'player-aab';

    await this.stage({
      releaseFile: input.archivePath,
      outDir: projectDir,
      repoRoot: this.repoRoot,
      easProjectId: this.easProjectId,
    });
    const identity = this.assertImmutableProjectIdentity(projectDir);
    input.onLog('Staged and verified the Android player project');

    const linked = await this.runCommand([
      'project:init', '--id', this.easProjectId, '--non-interactive',
    ], { cwd: projectDir, signal: input.signal, onLog: input.onLog });
    if (linked.status !== 0) {
      throw new Error('The signed-in EAS account cannot access the configured project id.');
    }
    input.onLog('Verified access to the novel\'s EAS project');

    const inspected = await this.runCommand([
      'build:inspect', '--platform', 'android', '--stage', 'archive',
      '--output', inspectDir, '--profile', profile, '--force',
    ], { cwd: projectDir, signal: input.signal, onLog: input.onLog });
    if (inspected.status !== 0) throw new Error(`EAS archive inspection failed: ${inspected.stderr}`);
    rmSync(inspectDir, { recursive: true, force: true });
    input.onLog('Verified the EAS upload archive');

    const submitted = await this.runCommand([
      'build', '--platform', 'android', '--profile', profile,
      '--json', '--non-interactive', '--no-wait', '--freeze-credentials',
    ], { cwd: projectDir, signal: input.signal, onLog: input.onLog });
    if (submitted.status !== 0) throw new Error(`EAS build submission failed: ${submitted.stderr}`);
    const submittedBuild = firstBuild(jsonFromCli(submitted.stdout));
    const buildId = typeof submittedBuild.id === 'string' ? submittedBuild.id : null;
    if (!buildId) throw new Error('EAS build submission returned no build id.');
    input.onLog('Submitted the build to EAS');

    const build = await followEasBuild({
      runCommand: this.runCommand,
      buildId,
      cwd: projectDir,
      signal: input.signal,
      onLog: input.onLog,
      pollIntervalMs: this.pollIntervalMs,
      initial: submittedBuild,
      // This helper started it, so stopping the job is the helper's to do.
      cancelOnAbort: true,
    });

    const url = buildArtifactUrl(build);
    if (!url) throw new Error('Finished EAS build carries no application artifact URL.');
    this.assertFinishedBuildIdentity(build, identity, input.request);
    const fileName = `${input.request.requestId}.${input.request.target}`;
    const artifactPath = path.join(input.outputDirectory, fileName);

    // Downloaded under a name of its own and put in place only once verified,
    // so a connection that drops mid-transfer cannot leave a truncated file
    // where a checked one belongs, and two jobs cannot share a scratch name.
    const pending = pendingPath(artifactPath);
    await this.download(url, pending, input.signal);
    input.onLog('Downloaded the build artifact');

    try {
      // The same check the command line runs, reached the same way. It was
      // missing here, so pressing Release — the route most authors take — was
      // the one route that returned an artifact nobody had looked inside.
      const report = await verifyBuiltArtifact({
        file: pending,
        target: input.request.target === 'aab' ? 'aab' : 'apk',
        expected: {
          applicationId: identity.applicationId,
          versionCode: input.request.versionCode,
        },
        repoRoot: this.repoRoot,
        // Where this helper kept records before they had one home. Its work
        // directory is chosen at startup and can be anywhere, so it is the one
        // legacy location nothing could have guessed.
        legacyStateDirectories: [this.stateDirectory],
        signatureAuthority: this.signatureAuthority,
        onLog: input.onLog,
      });
      input.onLog(`Verified the artifact: ${report.permissions.length} permission(s), `
        + `signature checked against the file, key ${report.signing.certificateFingerprint}`);
    } catch (error) {
      // Kept rather than deleted, and named so nothing serves it: the same
      // choice the command line makes, because a failed artifact is evidence.
      replaceFile(pending, `${artifactPath}.unverified`);
      throw error;
    }

    replaceFile(pending, artifactPath);
    return { artifactPath, fileName };
  }

  private assertImmutableProjectIdentity(projectDir: string): {
    applicationId: string;
    easProjectId: string;
  } {
    if (!this.easProjectId) throw new Error('The EAS project id is missing.');
    const raw = JSON.parse(readFileSync(path.join(projectDir, NATIVE_IDENTITY_FILE), 'utf8')) as {
      version?: unknown;
      storyId?: unknown;
      applicationId?: unknown;
      easProjectId?: unknown;
    };
    if (
      raw.version !== 1
      || typeof raw.storyId !== 'string'
      || typeof raw.applicationId !== 'string'
      || raw.easProjectId !== this.easProjectId
    ) {
      throw new Error(`The staged ${NATIVE_IDENTITY_FILE} does not match this EAS project.`);
    }

    mkdirSync(this.stateDirectory, { recursive: true });
    const registryFile = path.join(this.stateDirectory, `${this.easProjectId}.identity.json`);
    const expected = {
      version: 1,
      easProjectId: this.easProjectId,
      storyId: raw.storyId,
      applicationId: raw.applicationId,
    };
    try {
      writeFileSync(registryFile, `${JSON.stringify(expected, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      return expected;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    let existing: unknown;
    try {
      existing = JSON.parse(readFileSync(registryFile, 'utf8'));
    } catch {
      throw new Error(`The EAS identity registry is unreadable: ${registryFile}`);
    }
    const record = existing as Partial<typeof expected> | null;
    if (
      !record
      || record.version !== expected.version
      || record.easProjectId !== expected.easProjectId
      || record.storyId !== expected.storyId
      || record.applicationId !== expected.applicationId
    ) {
      throw new Error(
        `EAS project ${this.easProjectId} is already bound to another novel; create a separate EAS project.`,
      );
    }
    return expected;
  }

  private assertFinishedBuildIdentity(
    build: Record<string, unknown>,
    identity: { applicationId: string; easProjectId: string },
    request: BuildRequest,
  ): void {
    const project = build.project && typeof build.project === 'object'
      ? build.project as Record<string, unknown>
      : null;
    const applicationId = typeof build.appIdentifier === 'string'
      ? build.appIdentifier
      : typeof build.applicationIdentifier === 'string'
        ? build.applicationIdentifier
        : null;
    if (
      project?.id !== identity.easProjectId
      || applicationId !== identity.applicationId
      || String(build.appBuildVersion ?? '') !== String(request.versionCode)
    ) {
      throw new Error('The finished EAS build metadata does not match the staged novel identity.');
    }
  }

}
