/**
 * Where a build's state lives between messages.
 *
 * On disk, not in memory. A native build takes minutes; a browser tab does not
 * reliably stay open that long, and a reload must rejoin the job rather than
 * start a second paid one. That is the whole reason the helper is a service with
 * state instead of an adapter that forwards calls.
 *
 * Written atomically — a temp file and a rename — because the alternative is a
 * half-written job record after a laptop lid closes, and a job that cannot be
 * parsed is indistinguishable from a job that never existed.
 */
import { mkdirSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { BuildJob } from '../../../lib/release/build-job';
import { isBuildRequestId } from '../../../lib/release/build-request';

export interface BuildJobStoreOptions {
  /** Directory the helper owns. Created if absent. */
  directory: string;
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

  read(requestId: string): BuildJob | null {
    const file = this.fileFor(requestId);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as BuildJob;
    } catch {
      // A record we cannot read is not a record. Reporting "no such job" lets
      // the caller submit again, which is the recoverable outcome.
      return null;
    }
  }

  write(job: BuildJob): void {
    const file = this.fileFor(job.request.requestId);
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(job, null, 2));
    renameSync(temp, file);
  }

  delete(requestId: string): void {
    rmSync(this.fileFor(requestId), { force: true });
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
