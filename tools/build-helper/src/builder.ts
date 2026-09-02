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
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { zipSync } from 'fflate';

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

/** The real EAS path. Readiness fails before upload when CLI/account/project are unavailable. */
export interface EasCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface EasBuilderOptions {
  repoRoot?: string;
  /** Durable helper-owned state; keeps one EAS project tied to one novel. */
  stateDirectory?: string;
  easProjectId?: string;
  command?: string;
  pollIntervalMs?: number;
  runCommand?: (
    args: string[],
    options: { cwd: string; signal?: AbortSignal; onLog?: (line: string) => void },
  ) => Promise<EasCommandResult>;
  stage?: typeof stageAndroidProject;
  download?: (url: string, target: string, signal: AbortSignal) => Promise<void>;
}

function jsonFromCli(output: string): unknown {
  const array = output.indexOf('[');
  const object = output.indexOf('{');
  const start = array < 0 ? object : object < 0 ? array : Math.min(array, object);
  if (start < 0) throw new Error('EAS CLI returned no JSON.');
  return JSON.parse(output.slice(start));
}

function firstBuild(raw: unknown): Record<string, unknown> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'object') throw new Error('EAS CLI returned no build record.');
  return value as Record<string, unknown>;
}

function buildArtifactUrl(build: Record<string, unknown>): string | null {
  const artifacts = build.artifacts;
  if (!artifacts || typeof artifacts !== 'object') return null;
  const record = artifacts as Record<string, unknown>;
  for (const key of ['applicationArchiveUrl', 'buildUrl']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

async function defaultDownload(url: string, target: string, signal: AbortSignal): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('EAS returned a non-HTTPS artifact URL.');
  const response = await fetch(parsed, { signal });
  if (!response.ok || !response.body) throw new Error(`Artifact download failed (${response.status}).`);
  mkdirSync(path.dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(target, { flags: 'wx' }));
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

  constructor(options: EasBuilderOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.stateDirectory = path.resolve(options.stateDirectory ?? path.join(this.repoRoot, '.vne-builds'));
    this.easProjectId = options.easProjectId;
    this.command = options.command ?? (process.platform === 'win32' ? 'eas.cmd' : 'eas');
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.stage = options.stage ?? stageAndroidProject;
    this.download = options.download ?? defaultDownload;
    this.runCommand = options.runCommand ?? ((args, runOptions) => this.spawnCommand(args, runOptions));
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

    let remoteFinished = false;
    let cancellation: Promise<void> | null = null;
    const cancelRemote = (): Promise<void> => {
      if (remoteFinished) return Promise.resolve();
      cancellation ??= this.runCommand(
        ['build:cancel', buildId, '--non-interactive'],
        { cwd: projectDir },
      ).then(() => undefined, () => undefined);
      return cancellation;
    };
    const onAbort = () => { void cancelRemote(); };
    input.signal.addEventListener('abort', onAbort, { once: true });

    try {
      let build = submittedBuild;
      let lastStatus = '';
      for (;;) {
        if (input.signal.aborted) throw new Error('Build cancelled');
        const status = typeof build.status === 'string' ? build.status.toUpperCase() : '';
        if (status && status !== lastStatus) {
          input.onLog(`EAS build state: ${status.toLowerCase().replaceAll('_', ' ')}`);
          lastStatus = status;
        }
        if (status === 'FINISHED') {
          remoteFinished = true;
          break;
        }
        if (['ERRORED', 'CANCELED'].includes(status)) throw new Error(`EAS build ${status.toLowerCase()}.`);

        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, this.pollIntervalMs);
          function done() {
            clearTimeout(timer);
            input.signal.removeEventListener('abort', done);
            resolve();
          }
          input.signal.addEventListener('abort', done, { once: true });
        });
        if (input.signal.aborted) throw new Error('Build cancelled');
        const viewed = await this.runCommand(['build:view', buildId, '--json'], {
          cwd: projectDir,
          signal: input.signal,
          onLog: input.onLog,
        });
        if (viewed.status !== 0) throw new Error(`Could not read EAS build status: ${viewed.stderr}`);
        build = firstBuild(jsonFromCli(viewed.stdout));
      }

      const url = buildArtifactUrl(build);
      if (!url) throw new Error('Finished EAS build carries no application artifact URL.');
      this.assertFinishedBuildIdentity(build, identity, input.request);
      const fileName = `${input.request.requestId}.${input.request.target}`;
      const artifactPath = path.join(input.outputDirectory, fileName);
      await this.download(url, artifactPath, input.signal);
      input.onLog('Downloaded the signed build artifact');
      return { artifactPath, fileName };
    } catch (error) {
      if (input.signal.aborted) {
        await cancelRemote();
        throw new Error('Build cancelled');
      }
      throw error;
    } finally {
      input.signal.removeEventListener('abort', onAbort);
    }
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

  private spawnCommand(
    args: string[],
    options: { cwd: string; signal?: AbortSignal; onLog?: (line: string) => void },
  ): Promise<EasCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        cwd: options.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          EAS_NO_VCS: '1',
          // Staging links the repository's installed dependencies into a
          // project on an arbitrary drive. EAS fingerprinting follows that
          // junction and constructs an invalid concatenated path on Windows.
          EAS_SKIP_AUTO_FINGERPRINT: '1',
        },
        signal: options.signal,
      });
      const outputLimit = 4 * 1024 * 1024;
      let stdout = '';
      let stderr = '';
      const append = (kind: 'stdout' | 'stderr', chunk: unknown) => {
        const text = String(chunk);
        if (kind === 'stdout') stdout = (stdout + text).slice(-outputLimit);
        else stderr = (stderr + text).slice(-outputLimit);
        if (kind === 'stderr') {
          for (const line of text.split(/\r?\n/).filter(Boolean)) options.onLog?.(line);
        }
      };
      child.stdout?.on('data', (chunk) => append('stdout', chunk));
      child.stderr?.on('data', (chunk) => append('stderr', chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ status: code ?? 1, stdout, stderr }));
    });
  }
}
