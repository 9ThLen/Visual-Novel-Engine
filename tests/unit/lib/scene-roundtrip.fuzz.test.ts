import { normalizeTransitionData } from '@/lib/engine/transition-utils';
import type { ChoiceBlockData, SceneConnection, SceneRecord, TimelineStep, TransitionBlockData } from '@/lib/engine/types';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import { sceneRecordToPlateDocument } from '@/components/editor/plate/serializers/scene-to-plate';
import { plateDocumentToSceneRecord } from '@/components/editor/plate/serializers/plate-to-scene';
import { exportStory, importStory } from '@/lib/story-hooks';
import { useAppStore } from '@/stores/use-app-store';
import {
  createSeededRng,
  generateSceneRecord,
  generateStoryScenes,
} from '../../helpers/scene-record-generator';

const seeds = Array.from({ length: 50 }, (_, index) => index + 1);
const multilineTextSeeds = seeds.filter((seed) => seed % 10 === 0);
const fixedNow = 1_800_000_000_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withSeed(seed: number, assertion: () => void): void {
  try {
    assertion();
  } catch (error) {
    if (error instanceof Error) {
      error.message = `seed ${seed}: ${error.message}`;
    }
    throw error;
  }
}

async function withSeedAsync(seed: number, assertion: () => Promise<void>): Promise<void> {
  try {
    await assertion();
  } catch (error) {
    if (error instanceof Error) {
      error.message = `seed ${seed}: ${error.message}`;
    }
    throw error;
  }
}

function nextSceneIdForSave(record: SceneRecord): string | undefined {
  return record.connections.find((connection) => connection.outputPort === 'next')?.targetSceneId;
}

function expectedConnectionsAfterDocumentSave(record: SceneRecord): SceneConnection[] {
  const choiceConnections = record.timeline.flatMap((step) => {
    if (step.blockType !== 'choice') return [];
    const data = step.data as ChoiceBlockData;
    return data.options
      .filter((option) => option.targetSceneId)
      .map((option) => ({
        targetSceneId: option.targetSceneId!,
        outputPort: option.id,
        label: option.text,
      }));
  });

  const transitionStep = record.timeline.find(
    (step) => step.blockType === 'transition' && step.enabled !== false,
  );
  let nextTarget: string | null = nextSceneIdForSave(record) ?? null;
  if (transitionStep) {
    const data = normalizeTransitionData(transitionStep.data as TransitionBlockData);
    if (data.mode === 'end') nextTarget = null;
    else if (data.mode === 'scene') nextTarget = data.targetSceneId;
  }

  return [
    ...choiceConnections,
    ...(nextTarget ? [{ targetSceneId: nextTarget, outputPort: 'next', label: 'Next' }] : []),
  ];
}

function roundtripThroughPlateDocument(record: SceneRecord): SceneRecord {
  const plateDocument = sceneRecordToPlateDocument(record, []);
  const normalized = normalizePlateDocumentScene(clone(plateDocument), []);
  return plateDocumentToSceneRecord(record, normalized.scene, normalized.characters, {
    nextSceneId: nextSceneIdForSave(record),
  });
}

function expectedPlateRoundtrip(record: SceneRecord): SceneRecord {
  return {
    ...record,
    connections: expectedConnectionsAfterDocumentSave(record),
    updatedAt: fixedNow,
  };
}

function normalizeImportedStep(step: TimelineStep): TimelineStep {
  return {
    ...step,
    conditions: step.conditions ?? [],
  };
}

function expectedImportedScene(scene: SceneRecord, importedStoryId: string): SceneRecord {
  return {
    ...scene,
    storyId: importedStoryId,
    timeline: scene.timeline.map(normalizeImportedStep),
    updatedAt: fixedNow,
  };
}

describe('scene canonical/document roundtrip fuzz', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      characterLibraries: {},
    });
  });

  it.each(multilineTextSeeds)(
    'seed %i preserves multiline text through the Plate bridge',
    (seed) => withSeed(seed, () => {
      const record = generateSceneRecord(createSeededRng(seed), {
        variant: seed, multilineText: true, includeKnownLossyDocumentBlocks: false,
      });
      expect(roundtripThroughPlateDocument(record)).toEqual(expectedPlateRoundtrip(record));
    }),
  );

  it.each(seeds)(
    'seed %i preserves character steps through the all-block Plate bridge',
    (seed) => withSeed(seed, () => {
      const record = generateSceneRecord(createSeededRng(seed), {
        variant: seed, multilineText: false, includeKnownLossyDocumentBlocks: true,
      });
      expect(roundtripThroughPlateDocument(record)).toEqual(expectedPlateRoundtrip(record));
    }),
  );

  it.each(seeds)(
    'seed %i roundtrips canonical SceneRecord through the active Plate document bridge without known lossy blocks',
    (seed) => withSeed(seed, () => {
      const rng = createSeededRng(seed);
      const record = generateSceneRecord(rng, {
        variant: seed,
        emptyTimeline: seed % 17 === 0,
        multilineText: false,
        includeKnownLossyDocumentBlocks: false,
      });

      const saved = roundtripThroughPlateDocument(record);

      expect(saved).toEqual(expectedPlateRoundtrip(record));
    }),
  );
});

describe('story export/import roundtrip fuzz', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    useAppStore.setState({
      storiesMetadata: [],
      sceneRecordsByStory: {},
      characterLibraries: {},
    });
  });

  it.each(seeds)(
    'seed %i roundtrips canonical story scenes through exportStory/importStory',
    async (seed) => withSeedAsync(seed, async () => {
      const storyId = `story_export_${seed}`;
      const rng = createSeededRng(seed);
      const scenes = generateStoryScenes(rng, {
        storyId,
        sceneCount: 4,
        includeEmptyTimeline: false,
      });
      const sceneRecords = Object.fromEntries(scenes.map((scene) => [scene.id, scene])) as Record<string, SceneRecord>;

      useAppStore.setState({
        storiesMetadata: [{
          id: storyId,
          title: `Story ${seed}`,
          description: `Export roundtrip ${seed}`,
          author: 'VNE fuzz',
          startSceneId: scenes[0].id,
          createdAt: 1_700_100_000_000 + seed,
          updatedAt: 1_700_200_000_000 + seed,
          tags: ['fuzz', `seed-${seed}`],
          sceneCount: scenes.length,
          sceneOrder: scenes.map((scene) => scene.id),
        }],
        sceneRecordsByStory: {
          [storyId]: sceneRecords,
        },
        characterLibraries: {},
      });

      const exportedJson = await exportStory(storyId, useAppStore.getState());
      const exported = JSON.parse(exportedJson) as { scenes: Record<string, SceneRecord> };
      expect(exported.scenes).toEqual(sceneRecords);

      const imported = await importStory(exportedJson);

      expect(imported.id).not.toBe(storyId);
      expect(imported.createdAt).toBe(fixedNow);
      expect(imported.updatedAt).toBe(fixedNow);
      expect(imported.startSceneId).toBe(scenes[0].id);
      expect(imported.sceneCount).toBe(scenes.length);
      expect(imported.tags).toEqual(['fuzz', `seed-${seed}`]);
      expect(imported.scenes).toEqual(
        Object.fromEntries(
          Object.entries(sceneRecords).map(([sceneId, scene]) => [
            sceneId,
            expectedImportedScene(scene, imported.id),
          ]),
        ),
      );
    }),
  );
});
