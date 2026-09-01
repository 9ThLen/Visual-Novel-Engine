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
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  isEasProjectId,
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
 * this refuses — the server asks {@link readiness} at startup and rejects a new
 * `submit` before creating a job, which is the right order: an author on an
 * unconfigured machine should be told before an upload, not after.
 *
 * It would have been easy to have `build()` stage and then throw. It was written
 * that way and taken back out: the server never reaches `build()` while
 * readiness is false, so that code could not run, and the documentation around
 * it claimed a path the helper does not have. An unreachable branch that reads
 * like a working feature is worse than an honest refusal.
 */
export interface EasCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface EasBuilderOptions {
  repoRoot?: string;
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
  private readonly command: string;
  private readonly pollIntervalMs: number;
  private readonly runCommand: NonNullable<EasBuilderOptions['runCommand']>;
  private readonly stage: typeof stageAndroidProject;
  private readonly download: NonNullable<EasBuilderOptions['download']>;

  constructor(options: EasBuilderOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
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

    let build = submittedBuild;
    let lastStatus = '';
    for (;;) {
      if (input.signal.aborted) {
        await this.runCommand(['build:cancel', buildId, '--non-interactive'], { cwd: projectDir });
        throw new Error('Build cancelled');
      }
      const status = typeof build.status === 'string' ? build.status.toUpperCase() : '';
      if (status && status !== lastStatus) {
        input.onLog(`EAS build state: ${status.toLowerCase().replaceAll('_', ' ')}`);
        lastStatus = status;
      }
      if (status === 'FINISHED') break;
      if (['ERRORED', 'CANCELED'].includes(status)) throw new Error(`EAS build ${status.toLowerCase()}.`);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.pollIntervalMs);
        input.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (input.signal.aborted) continue;
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
    const fileName = `${input.request.requestId}.${input.request.target}`;
    const artifactPath = path.join(input.outputDirectory, fileName);
    await this.download(url, artifactPath, input.signal);
    input.onLog('Downloaded the signed build artifact');
    return { artifactPath, fileName };
  }

  private spawnCommand(
    args: string[],
    options: { cwd: string; signal?: AbortSignal; onLog?: (line: string) => void },
  ): Promise<EasCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        cwd: options.cwd,
        windowsHide: true,
        env: { ...process.env, EAS_NO_VCS: '1' },
        signal: options.signal,
      });
      let stdout = '';
      let stderr = '';
      const append = (kind: 'stdout' | 'stderr', chunk: unknown) => {
        const text = String(chunk);
        if (kind === 'stdout') stdout += text;
        else stderr += text;
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
