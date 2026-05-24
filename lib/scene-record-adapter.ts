import type { Choice, StoryScene } from '@/lib/types';
import type { AudioTrigger } from '@/lib/audio-types';
import type { ChoiceBlockData, SceneConnection, SceneRecord, SceneState, TimelineStep } from '@/lib/engine/types';

function createEmptySceneState(): SceneState {
  return {
    backgroundAssetId: null,
    backgroundTransition: 'fade',
    characters: [],
    activeEffects: [],
    musicTrackId: null,
    musicPlaying: false,
    musicVolume: 1,
    variables: {},
    dialogueHistory: [],
    currentChoices: null,
    isTransitioning: false,
    transitionTarget: null,
  };
}

function getSceneRecordPrimaryText(sceneRecord: SceneRecord): string {
  for (const step of sceneRecord.timeline) {
    if (step.blockType === 'text' && 'content' in step.data) {
      return step.data.content;
    }

    if (step.blockType === 'dialogue' && 'entries' in step.data) {
      const firstEntry = step.data.entries[0];
      if (firstEntry?.text) {
        return firstEntry.text;
      }
    }
  }

  return sceneRecord.name;
}

function getSceneRecordBackground(sceneRecord: SceneRecord): string | null {
  const backgroundStep = sceneRecord.timeline
    .find((step) => step.enabled !== false && step.blockType === 'background' && 'assetId' in step.data);

  if (!backgroundStep || !('assetId' in backgroundStep.data)) {
    return null;
  }

  return backgroundStep.data.assetId;
}

function getSceneRecordMusic(sceneRecord: SceneRecord): string | null {
  const musicStep = [...sceneRecord.timeline]
    .reverse()
    .find((step) => step.enabled !== false && step.blockType === 'music' && 'assetId' in step.data);

  if (!musicStep || !('assetId' in musicStep.data)) {
    return null;
  }

  if ('action' in musicStep.data && musicStep.data.action && musicStep.data.action !== 'play') {
    return null;
  }

  return musicStep.data.assetId;
}

function getSceneRecordAudioTriggers(sceneRecord: SceneRecord): AudioTrigger[] {
  return sceneRecord.timeline
    .filter((step) => step.enabled !== false && step.blockType === 'sound' && 'assetId' in step.data)
    .flatMap((step) => {
      if (!('assetId' in step.data) || !step.data.assetId) {
        return [];
      }

      if ('action' in step.data && step.data.action && step.data.action !== 'play') {
        return [];
      }

      return [{
        id: step.id,
        audioId: step.data.assetId,
        triggerType: 'scene_start',
        volume: 'volume' in step.data && typeof step.data.volume === 'number' ? step.data.volume : 1,
        loop: 'loop' in step.data ? Boolean(step.data.loop) : false,
        stopPrevious: true,
      } satisfies AudioTrigger];
    });
}

function mapConnectionsToChoices(connections: SceneConnection[]): Choice[] {
  return connections
    .filter((connection) => connection.outputPort !== 'next')
    .map((connection) => ({
      id: connection.outputPort,
      text: connection.label || connection.outputPort,
      nextSceneId: connection.targetSceneId,
    }));
}

function mapChoicesToConnections(choices: Choice[]): SceneConnection[] {
  return choices.map((choice) => ({
    targetSceneId: choice.nextSceneId,
    outputPort: choice.id,
    label: choice.text,
  }));
}

function createTextTimelineStep(scene: StoryScene): TimelineStep {
  return {
    id: `${scene.id}-text`,
    blockType: 'text',
    data: {
      content: scene.text,
      typewriterSpeed: 0.5,
      anchorTo: 'background',
    },
    collapsed: false,
    enabled: true,
  };
}

function createBackgroundTimelineStep(scene: StoryScene): TimelineStep | null {
  if (!scene.backgroundImageUri) {
    return null;
  }

  return {
    id: `${scene.id}-background`,
    blockType: 'background',
    data: {
      assetId: scene.backgroundImageUri,
      transition: 'fade',
      duration: 500,
    },
    collapsed: false,
    enabled: true,
  };
}

function createChoiceTimelineStep(scene: StoryScene): TimelineStep | null {
  if (scene.choices.length === 0) {
    return null;
  }

  const data: ChoiceBlockData = {
    options: scene.choices.map((choice) => ({
      id: choice.id,
      text: choice.text,
      targetSceneId: choice.nextSceneId,
    })),
  };

  return {
    id: `${scene.id}-choices`,
    blockType: 'choice',
    data,
    collapsed: false,
    enabled: true,
  };
}

function createMusicTimelineStep(scene: StoryScene): TimelineStep | null {
  if (!scene.musicUri) {
    return null;
  }

  return {
    id: `${scene.id}-music`,
    blockType: 'music',
    data: {
      assetId: scene.musicUri,
      action: 'play',
      volume: 1,
      loop: true,
      fadeDuration: 500,
    },
    collapsed: false,
    enabled: true,
  };
}

export function sceneRecordToStoryScene(sceneRecord: SceneRecord): StoryScene {
  return {
    id: sceneRecord.id,
    text: getSceneRecordPrimaryText(sceneRecord),
    backgroundImageUri: getSceneRecordBackground(sceneRecord),
    characters: [],
    choices: mapConnectionsToChoices(sceneRecord.connections),
    musicUri: getSceneRecordMusic(sceneRecord),
    audioTriggers: getSceneRecordAudioTriggers(sceneRecord),
    blocks: sceneRecord.timeline as unknown[],
  };
}

export function storySceneToSceneRecordDraft(storyId: string, scene: StoryScene): SceneRecord {
  const timeline = [
    createBackgroundTimelineStep(scene),
    createMusicTimelineStep(scene),
    createTextTimelineStep(scene),
    createChoiceTimelineStep(scene),
  ].filter((step): step is TimelineStep => step !== null);

  const timestamp = Date.now();

  return {
    id: scene.id,
    storyId,
    name: scene.id,
    description: '',
    tags: [],
    timeline,
    sceneState: createEmptySceneState(),
    flowX: 0,
    flowY: 0,
    connections: mapChoicesToConnections(scene.choices),
    isStart: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
