/**
 * Where a build's state lives between messages.
 *
 * On disk, not in memory. A native build takes minutes; a browser tab does not
 * reliably stay open that long, and a reload must rejoin the job rather than
 * start a second paid one. That is the whole reason the helper is a service with
 * state instead of an adapter that forwards calls.
 *
 * Written durably — a unique temp file, fsync and rename — because the
 * alternative is a half-written record after a laptop lid closes. A record
 * that fails schema validation is quarantined and keeps its idempotency key
 * blocked; corruption must never look like a job that never existed.
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { BUILD_STATES, type BuildJob } from '../../../lib/release/build-job';
import { isBuildRequestId, parseBuildRequest } from '../../../lib/release/build-request';

export interface BuildJobStoreOptions {
  /** Directory the helper owns. Created if absent. */
  directory: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Disk is an untrusted boundary after a crash or manual edit. */
function parseBuildJob(value: unknown): BuildJob {
  if (!isRecord(value)) throw new Error('Job is not an object');
  const request = parseBuildRequest(value.request);
  if (typeof value.state !== 'string' || !BUILD_STATES.includes(value.state as never)) {
    throw new Error('Invalid job state');
  }
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
    throw new Error('Invalid job timestamp');
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    throw new Error('Invalid job attempt');
  }
  if (value.uploadedBytes !== undefined && (
    !Number.isSafeInteger(value.uploadedBytes) || (value.uploadedBytes as number) < 0
  )) {
    throw new Error('Invalid uploaded byte count');
  }
  if (value.failureReason !== undefined && typeof value.failureReason !== 'string') {
    throw new Error('Invalid failure reason');
  }
  if (!Array.isArray(value.log) || value.log.some((line) => typeof line !== 'string')) {
    throw new Error('Invalid job log');
  }
  if (value.artifact !== undefined) {
    if (!isRecord(value.artifact)) throw new Error('Invalid artifact');
    const artifact = value.artifact;
    if (
      typeof artifact.fileName !== 'string'
      || artifact.fileName.length === 0
      || artifact.fileName.length > 255
      || path.basename(artifact.fileName) !== artifact.fileName
      || /[\r\n]/.test(artifact.fileName)
      || !Number.isSafeInteger(artifact.bytes)
      || (artifact.bytes as number) < 0
      || typeof artifact.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(artifact.sha256)
      || !isTimestamp(artifact.expiresAt)
    ) {
      throw new Error('Invalid artifact metadata');
    }
  }
  return { ...value, request } as unknown as BuildJob;
}

export class BuildJobStore {
  private readonly directory: string;

  constructor(options: BuildJobStoreOptions) {
    this.directory = path.resolve(options.directory);
    mkdirSync(this.directory, { recursive: true });
  }

  /**
   * A request id is validated before it becomes a path. It arrives over a
   * socket, and the store is the point where it stops being text.
   */
  private fileFor(requestId: string): string {
    if (!isBuildRequestId(requestId)) throw new Error(`Unsafe build request id: ${requestId}`);
    return path.join(this.directory, `${requestId}.json`);
  }

  private corruptPrefix(requestId: string): string {
    return `${requestId}.json.corrupt-`;
  }

  private assertNoQuarantinedRecord(requestId: string): void {
    const prefix = this.corruptPrefix(requestId);
    if (readdirSync(this.directory).some((name) => name.startsWith(prefix))) {
      throw new Error(`Corrupt build job record is quarantined: ${requestId}`);
    }
  }

  private syncDirectory(): void {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(this.directory, 'r');
      fsyncSync(descriptor);
    } catch (error) {
      // Windows does not consistently allow directory handles to be flushed.
      // The file itself was fsynced before rename; POSIX also gets the durable
      // directory entry guarantee here.
      if (process.platform !== 'win32') throw error;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }

  private quarantine(requestId: string, file: string): never {
    const quarantined = `${file}.corrupt-${Date.now()}-${randomUUID()}`;
    renameSync(file, quarantined);
    this.syncDirectory();
    throw new Error(`Corrupt build job record was quarantined: ${requestId}`);
  }

  read(requestId: string): BuildJob | null {
    const file = this.fileFor(requestId);
    if (!existsSync(file)) {
      this.assertNoQuarantinedRecord(requestId);
      return null;
    }
    try {
      return parseBuildJob(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      // Never turn corruption into "unknown request": that would let the same
      // idempotency key start a second paid build after a crash.
      return this.quarantine(requestId, file);
    }
  }

  write(job: BuildJob): void {
    const file = this.fileFor(job.request.requestId);
    this.assertNoQuarantinedRecord(job.request.requestId);
    const temp = `${file}.${process.pid}-${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temp, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(parseBuildJob(job), null, 2), 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temp, file);
      this.syncDirectory();
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(temp, { force: true });
      throw error;
    }
  }

  delete(requestId: string): void {
    rmSync(this.fileFor(requestId), { force: true });
    this.syncDirectory();
  }

  list(): BuildJob[] {
    if (!existsSync(this.directory)) return [];
    const jobs: BuildJob[] = [];
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith('.json')) continue;
      const job = this.read(name.slice(0, -'.json'.length));
      if (job) jobs.push(job);
    }
    return jobs;
  }
}
