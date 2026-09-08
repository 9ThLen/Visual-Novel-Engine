import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createBuildJob } from '../../../lib/release/build-job';
import type { BuildRequest } from '../../../lib/release/build-request';
import { BuildJobStore } from '../../../tools/build-helper/src/job-store';

const request: BuildRequest = {
  requestId: 'req_one',
  releaseId: 'release_one',
  target: 'apk',
  versionCode: 1,
  payloadHash: 'a'.repeat(64),
};

describe('BuildJobStore durability boundary', () => {
  let directory: string;
  let store: BuildJobStore;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'vne-job-store-'));
    store = new BuildJobStore({ directory });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips a validated job without leaving a shared temp file', () => {
    const job = createBuildJob(request, '2026-08-30T10:00:00.000Z');
    store.write(job);

    expect(store.read(request.requestId)).toEqual(job);
    expect(readdirSync(directory)).toEqual(['req_one.json']);
  });

  it('quarantines malformed JSON and keeps the idempotency key blocked', () => {
    writeFileSync(path.join(directory, 'req_one.json'), '{not json', 'utf8');

    expect(() => store.read(request.requestId)).toThrow('quarantined');
    expect(readdirSync(directory).some((name) => name.startsWith('req_one.json.corrupt-')))
      .toBe(true);
    expect(() => store.read(request.requestId)).toThrow('quarantined');
    expect(() => store.write(createBuildJob(request, '2026-08-30T10:00:00.000Z')))
      .toThrow('quarantined');
  });

  it('quarantines valid JSON that does not match the job schema', () => {
    const job = { ...createBuildJob(request, '2026-08-30T10:00:00.000Z'), state: 'invented' };
    writeFileSync(path.join(directory, 'req_one.json'), JSON.stringify(job), 'utf8');

    expect(() => store.read(request.requestId)).toThrow('quarantined');
  });
});
