/**
 * Talking to EAS: run a command, follow a build, fetch what it produced.
 *
 * There are two callers — the build helper the browser drives, and the
 * `stage:android --build` command — and for a while they were two
 * implementations. The helper polled, cancelled on abort and downloaded the
 * artifact; the command shelled out to `eas build` and let the CLI's own
 * waiting stand in for all of it, which meant it finished holding nothing. Two
 * paths to the same artifact drift, and the one used less is the one that
 * quietly stops matching.
 *
 * So the mechanics live here and both call them. What stays with each caller is
 * what genuinely differs: the helper reports to a socket and enforces an
 * identity registry; the command prints to a terminal.
 *
 * The `runCommand` seam is a parameter rather than a module-level function
 * because the helper's tests drive the whole submit/poll/download sequence
 * against a scripted EAS, and a real subprocess there would make that untested.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface EasCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type RunEasCommand = (
  args: string[],
  options: { cwd: string; signal?: AbortSignal; onLog?: (line: string) => void },
) => Promise<EasCommandResult>;

/** Build states EAS reports that mean it will not produce an artifact. */
const FAILED_STATES = ['ERRORED', 'CANCELED'];

export function easExecutable(): string {
  return process.platform === 'win32' ? 'eas.cmd' : 'eas';
}

/**
 * What may go through a Windows shell.
 *
 * Every argument is ours or an id echoed back by EAS, and this refuses rather
 * than trusting that — a build id is the one value arriving from outside, and
 * it is what this guards.
 */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./\\-]+$/;

/**
 * Run the EAS CLI, capturing output rather than inheriting the terminal.
 *
 * Both environment variables were each found by a failed build rather than by
 * reading anything, and they live here so neither caller has to remember them.
 *
 * On Windows the CLI is `eas.cmd`, which Node has refused to start without a
 * shell since the batch-argument escaping fix (CVE-2024-27980) — an EINVAL the
 * helper would have hit too, had anything ever run its spawn path rather than
 * the stub its tests supply.
 */
export function spawnEas(command: string = easExecutable()): RunEasCommand {
  const useShell = process.platform === 'win32';
  return (args, options) => new Promise<EasCommandResult>((resolve, reject) => {
    if (useShell) {
      const unsafe = args.find((argument) => !SHELL_SAFE.test(argument));
      if (unsafe !== undefined) {
        reject(new Error(`Refusing to pass ${JSON.stringify(unsafe)} through a shell.`));
        return;
      }
    }
    // One command line rather than a command plus an argument array: with a
    // shell, Node concatenates them anyway and warns that it does not escape
    // them. Doing it here makes the concatenation the guarded step above.
    const child = spawn(
      useShell ? [command, ...args].join(' ') : command,
      useShell ? [] : args,
      {
        cwd: options.cwd,
        shell: useShell,
        windowsHide: true,
        env: {
          ...process.env,
          EAS_NO_VCS: '1',
          // Staging links the repository's installed dependencies into a
          // project on an arbitrary drive. EAS fingerprinting follows that
          // junction and builds an invalid concatenated path on Windows.
          EAS_SKIP_AUTO_FINGERPRINT: '1',
        },
        signal: options.signal,
      },
    );
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

export function jsonFromCli(output: string): unknown {
  const array = output.indexOf('[');
  const object = output.indexOf('{');
  const start = array < 0 ? object : object < 0 ? array : Math.min(array, object);
  if (start < 0) throw new Error('EAS CLI returned no JSON.');
  return JSON.parse(output.slice(start));
}

export function firstBuild(raw: unknown): Record<string, unknown> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'object') throw new Error('EAS CLI returned no build record.');
  return value as Record<string, unknown>;
}

export function buildArtifactUrl(build: Record<string, unknown>): string | null {
  const artifacts = build.artifacts;
  if (!artifacts || typeof artifacts !== 'object') return null;
  const record = artifacts as Record<string, unknown>;
  for (const key of ['applicationArchiveUrl', 'buildUrl']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

/** One `build:view`, which is also how a past build is picked up by id. */
export async function readEasBuild(options: {
  runCommand: RunEasCommand;
  buildId: string;
  cwd: string;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
}): Promise<Record<string, unknown>> {
  const viewed = await options.runCommand(['build:view', options.buildId, '--json'], {
    cwd: options.cwd,
    signal: options.signal,
    onLog: options.onLog,
  });
  if (viewed.status !== 0) throw new Error(`Could not read EAS build status: ${viewed.stderr}`);
  return firstBuild(jsonFromCli(viewed.stdout));
}

export interface FollowOptions {
  runCommand: RunEasCommand;
  buildId: string;
  cwd: string;
  signal: AbortSignal;
  onLog: (line: string) => void;
  pollIntervalMs: number;
  /** The record submission already returned, so the first poll is not wasted. */
  initial?: Record<string, unknown>;
  /**
   * Ask EAS to stop the build when the caller aborts. True for whoever started
   * it; false when merely watching one, where cancelling would destroy work the
   * watcher does not own.
   */
  cancelOnAbort?: boolean;
}

/**
 * Follow a build to a finished state, or throw.
 *
 * Polling rather than the CLI's own `--wait`, because the caller needs the
 * finished record — the artifact URL and the metadata to check the build's
 * identity against — and because a build that outlives the process should be
 * resumable by id rather than lost.
 */
export async function followEasBuild(options: FollowOptions): Promise<Record<string, unknown>> {
  const { runCommand, buildId, cwd, signal, onLog, pollIntervalMs } = options;
  let finished = false;
  let cancellation: Promise<void> | null = null;

  const cancelRemote = (): Promise<void> => {
    if (finished || options.cancelOnAbort !== true) return Promise.resolve();
    cancellation ??= runCommand(['build:cancel', buildId, '--non-interactive'], { cwd })
      .then(() => undefined, () => undefined);
    return cancellation;
  };
  const onAbort = () => { void cancelRemote(); };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    let build = options.initial ?? await readEasBuild({ runCommand, buildId, cwd, signal, onLog });
    let lastStatus = '';
    for (;;) {
      if (signal.aborted) throw new Error('Build cancelled');
      const status = typeof build.status === 'string' ? build.status.toUpperCase() : '';
      if (status && status !== lastStatus) {
        onLog(`EAS build state: ${status.toLowerCase().replaceAll('_', ' ')}`);
        lastStatus = status;
      }
      if (status === 'FINISHED') {
        finished = true;
        return build;
      }
      if (FAILED_STATES.includes(status)) throw new Error(`EAS build ${status.toLowerCase()}.`);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, pollIntervalMs);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, { once: true });
      });
      if (signal.aborted) throw new Error('Build cancelled');
      build = await readEasBuild({ runCommand, buildId, cwd, signal, onLog });
    }
  } catch (error) {
    if (signal.aborted) {
      await cancelRemote();
      throw new Error('Build cancelled');
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Fetch the artifact.
 *
 * `wx` so a download never silently overwrites one already on disk, and HTTPS
 * only: the URL is signed and short-lived, and an artifact fetched over plain
 * HTTP is one an attacker on the path can replace with an app that installs
 * under the author's own signing identity.
 */
export async function downloadArtifact(url: string, target: string, signal: AbortSignal): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('EAS returned a non-HTTPS artifact URL.');
  const response = await fetch(parsed, { signal });
  if (!response.ok || !response.body) throw new Error(`Artifact download failed (${response.status}).`);
  mkdirSync(path.dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(target, { flags: 'wx' }));
}
