import { runReleasePreflight, type ReleasePreflightInput } from '@/lib/release/preflight';
import type { SceneConnection, SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';

/** Scenes connect by object, not by id string; a bare id is not a connection. */
function connectionTo(targetSceneId: string): SceneConnection {
  return { targetSceneId, outputPort: 'next' };
}

function scene(id: string, overrides: Partial<SceneRecord> = {}): SceneRecord {
  return {
    id,
    name: id,
    timeline: [
      {
        id: `${id}_text`,
        blockType: 'text',
        enabled: true,
        data: { content: 'Some words of narration go here.' },
      },
    ],
    connections: [],
    ...overrides,
  } as unknown as SceneRecord;
}

/** A story that passes the gate outright; every case narrows from here. */
function readyMetadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    id: 'story_1',
    title: 'A Complete Novel',
    description: 'A short but finished story.',
    author: 'A Writer',
    startSceneId: 'start',
    createdAt: 1,
    updatedAt: 2,
    sceneCount: 2,
    thumbnailUri: 'idb-media://cover',
    contentRating: 'everyone',
    languages: ['uk'],
    aiAssisted: false,
    ...overrides,
  };
}

function readyInput(overrides: Partial<ReleasePreflightInput> = {}): ReleasePreflightInput {
  return {
    metadata: readyMetadata(),
    scenes: [
      scene('start', { isStart: true, connections: [connectionTo('finish')] }),
      scene('finish'),
    ],
    channel: 'both',
    ...overrides,
  };
}

function codes(findings: { code: string }[]): string[] {
  return findings.map((finding) => finding.code);
}

describe('runReleasePreflight', () => {
  it('passes a complete story', () => {
    const report = runReleasePreflight(readyInput());
    expect(report.blockers).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it('reports stats alongside the findings', () => {
    const report = runReleasePreflight(readyInput());
    expect(report.stats.scenes).toBe(2);
    expect(report.stats.words).toBeGreaterThan(0);
    expect(report.stats.endings).toBe(1);
    expect(report.stats.readMinutes).toBeGreaterThanOrEqual(1);
  });

  it('is not ready when anything blocks, regardless of warnings', () => {
    const report = runReleasePreflight(readyInput({ metadata: readyMetadata({ title: '  ' }) }));
    expect(codes(report.blockers)).toContain('release.missingTitle');
    expect(report.ready).toBe(false);
  });

  it('separates blockers from warnings', () => {
    const report = runReleasePreflight(readyInput());
    for (const finding of report.blockers) expect(finding.severity).toBe('blocker');
    for (const finding of report.warnings) expect(finding.severity).toBe('warning');
  });
});

describe('presentation checks', () => {
  it('always blocks a missing title, whatever the channel', () => {
    for (const channel of ['page', 'app', 'both'] as const) {
      const report = runReleasePreflight(
        readyInput({ channel, metadata: readyMetadata({ title: '' }) }),
      );
      expect(codes(report.blockers)).toContain('release.missingTitle');
    }
  });

  it.each([
    ['author', { author: '' }, 'release.missingAuthor'],
    ['description', { description: '' }, 'release.missingDescription'],
    ['cover', { thumbnailUri: undefined }, 'release.missingCover'],
  ])('blocks a missing %s on a storefront release', (_label, overrides, code) => {
    const report = runReleasePreflight(
      readyInput({ channel: 'page', metadata: readyMetadata(overrides) }),
    );
    expect(codes(report.blockers)).toContain(code);
  });

  it.each([
    ['author', { author: '' }, 'release.missingAuthor'],
    ['description', { description: '' }, 'release.missingDescription'],
    ['cover', { thumbnailUri: undefined }, 'release.missingCover'],
  ])('only warns about a missing %s for a downloadable app', (_label, overrides, code) => {
    const report = runReleasePreflight(
      readyInput({ channel: 'app', metadata: readyMetadata(overrides) }),
    );
    expect(codes(report.blockers)).not.toContain(code);
    expect(codes(report.warnings)).toContain(code);
  });

  it('treats whitespace-only fields as missing', () => {
    const report = runReleasePreflight(
      readyInput({ metadata: readyMetadata({ description: '   \n  ' }) }),
    );
    expect(codes(report.blockers)).toContain('release.missingDescription');
  });
});

describe('publication checks', () => {
  it('blocks a storefront release with no content rating or language', () => {
    const report = runReleasePreflight(
      readyInput({
        channel: 'both',
        metadata: readyMetadata({ contentRating: undefined, languages: undefined }),
      }),
    );
    expect(codes(report.blockers)).toEqual(
      expect.arrayContaining(['release.missingContentRating', 'release.missingLanguages']),
    );
  });

  it('only warns for an app-only release', () => {
    const report = runReleasePreflight(
      readyInput({
        channel: 'app',
        metadata: readyMetadata({ contentRating: undefined, languages: undefined }),
      }),
    );
    expect(report.ready).toBe(true);
    expect(codes(report.warnings)).toEqual(
      expect.arrayContaining(['release.missingContentRating', 'release.missingLanguages']),
    );
  });

  it('treats an empty language list as missing', () => {
    const report = runReleasePreflight(
      readyInput({ metadata: readyMetadata({ languages: [] }) }),
    );
    expect(codes(report.blockers)).toContain('release.missingLanguages');
  });

  it('nudges an undeclared AI disclosure on a storefront release only', () => {
    const undeclared = readyMetadata({ aiAssisted: undefined });
    expect(codes(runReleasePreflight(readyInput({ channel: 'page', metadata: undeclared })).warnings))
      .toContain('release.undeclaredAiAssistance');
    expect(codes(runReleasePreflight(readyInput({ channel: 'app', metadata: undeclared })).warnings))
      .not.toContain('release.undeclaredAiAssistance');
  });

  it('accepts an explicit "no" as a declaration', () => {
    const report = runReleasePreflight(readyInput());
    expect(codes(report.warnings)).not.toContain('release.undeclaredAiAssistance');
  });
});

describe('playability checks', () => {
  it('blocks a story with no scenes and stops there', () => {
    const report = runReleasePreflight(readyInput({ scenes: [] }));
    expect(codes(report.blockers)).toContain('release.noScenes');
    expect(codes(report.blockers)).not.toContain('release.missingStartScene');
  });

  it('blocks a start scene that does not exist', () => {
    const report = runReleasePreflight(
      readyInput({ metadata: readyMetadata({ startSceneId: 'nowhere' }) }),
    );
    expect(codes(report.blockers)).toContain('release.missingStartScene');
  });

  it('blocks a story that can never end', () => {
    const report = runReleasePreflight(
      readyInput({
        scenes: [
          scene('start', { isStart: true, connections: [connectionTo('finish')] }),
          scene('finish', { connections: [connectionTo('start')] }),
        ],
      }),
    );
    expect(codes(report.blockers)).toContain('release.noEndings');
    expect(report.stats.endings).toBe(0);
  });

  it('blocks a story with scenes but no words', () => {
    const empty = { id: 'start', name: 'start', timeline: [], connections: [], isStart: true };
    const report = runReleasePreflight({
      ...readyInput(),
      scenes: [empty as unknown as SceneRecord],
    });
    expect(codes(report.blockers)).toContain('release.noContent');
  });
});

describe('version checks', () => {
  it('does not check a version the author has not chosen yet', () => {
    const report = runReleasePreflight(readyInput({ version: undefined, previousVersion: '1.0.0' }));
    expect(codes(report.blockers)).not.toContain('release.versionNotNewer');
  });

  it('accepts any valid version for a first release', () => {
    const report = runReleasePreflight(readyInput({ version: '0.1.0', previousVersion: null }));
    expect(report.ready).toBe(true);
  });

  it('blocks a malformed version', () => {
    const report = runReleasePreflight(readyInput({ version: '1.0' }));
    expect(codes(report.blockers)).toContain('release.invalidVersion');
  });

  it('blocks republishing the same version', () => {
    const report = runReleasePreflight(readyInput({ version: '1.2.0', previousVersion: '1.2.0' }));
    expect(codes(report.blockers)).toContain('release.versionNotNewer');
  });

  it('blocks going backwards', () => {
    const report = runReleasePreflight(readyInput({ version: '1.1.0', previousVersion: '1.2.0' }));
    expect(codes(report.blockers)).toContain('release.versionNotNewer');
  });

  it('accepts a newer version', () => {
    const report = runReleasePreflight(readyInput({ version: '1.2.1', previousVersion: '1.2.0' }));
    expect(report.ready).toBe(true);
  });

  it('reports only one version problem at a time', () => {
    const report = runReleasePreflight(readyInput({ version: 'nope', previousVersion: '1.0.0' }));
    expect(codes(report.blockers)).toContain('release.invalidVersion');
    expect(codes(report.blockers)).not.toContain('release.versionNotNewer');
  });
});

describe('size checks', () => {
  it('says nothing when the size is unknown', () => {
    const report = runReleasePreflight(readyInput({ estimatedBytes: undefined }));
    expect(codes(report.warnings)).not.toContain('release.largeDownload');
  });

  it('stays quiet for a small release', () => {
    const report = runReleasePreflight(readyInput({ estimatedBytes: 5 * 1024 * 1024 }));
    expect(codes(report.warnings)).not.toContain('release.largeDownload');
  });

  it('warns but does not block a large release', () => {
    const report = runReleasePreflight(readyInput({ estimatedBytes: 200 * 1024 * 1024 }));
    expect(codes(report.warnings)).toContain('release.largeDownload');
    expect(report.ready).toBe(true);
  });

  it('blocks a release too large for its own container', () => {
    const report = runReleasePreflight(readyInput({ estimatedBytes: 4 * 1024 * 1024 * 1024 }));
    expect(codes(report.blockers)).toContain('release.tooLarge');
    expect(codes(report.warnings)).not.toContain('release.largeDownload');
  });
});

describe('story doctor integration', () => {
  it('promotes doctor errors to blockers and marks their origin', () => {
    // No scene is marked as the start, which the doctor reports as an error.
    const report = runReleasePreflight(
      readyInput({ scenes: [scene('start'), scene('finish')] }),
    );
    const graphFinding = report.blockers.find((finding) => finding.code === 'graph.noStartScene');
    expect(graphFinding).toBeDefined();
    expect(graphFinding?.fromStoryDoctor).toBe(true);
  });

  it('marks its own findings as not coming from the doctor', () => {
    const report = runReleasePreflight(readyInput({ metadata: readyMetadata({ title: '' }) }));
    const own = report.blockers.find((finding) => finding.code === 'release.missingTitle');
    expect(own?.fromStoryDoctor).toBeUndefined();
  });

  it('does not repeat the doctor\'s checks under its own codes', () => {
    const report = runReleasePreflight(readyInput());
    const all = [...report.blockers, ...report.warnings];
    const doctorCodes = all.filter((finding) => finding.fromStoryDoctor).map((f) => f.code);
    const ownCodes = all.filter((finding) => !finding.fromStoryDoctor).map((f) => f.code);
    expect(doctorCodes.filter((code) => ownCodes.includes(code))).toEqual([]);
  });
});
