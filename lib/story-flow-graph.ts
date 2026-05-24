import type { SceneConnection, SceneRecord } from '@/lib/engine/types';
import type { StoryMetadata } from '@/lib/story-domain';
import { resolveCanonicalStartSceneId } from '@/lib/scene-operations';

export interface StoryFlowGraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  isStart: boolean;
  connections: SceneConnection[];
  stepCount: number;
}

export interface StoryFlowGraphEdge {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  outputPort: string;
  label: string;
}

export interface StoryFlowGraphSnapshot {
  storiesMetadata: StoryMetadata[];
  sceneRecordsByStory: Record<string, Record<string, SceneRecord>>;
}

export interface StoryFlowGraph {
  startSceneId: string;
  nodes: StoryFlowGraphNode[];
  edges: StoryFlowGraphEdge[];
}

export function buildStoryFlowGraph(
  snapshot: StoryFlowGraphSnapshot,
  storyId: string
): StoryFlowGraph {
  const storyRecords = snapshot.sceneRecordsByStory[storyId] || {};
  const startSceneId = resolveCanonicalStartSceneId(snapshot, storyId);

  const nodes = Object.values(storyRecords)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      x: scene.flowX ?? 100,
      y: scene.flowY ?? 100,
      isStart: scene.id === startSceneId,
      connections: scene.connections || [],
      stepCount: scene.timeline?.length || 0,
    }));

  const edges = nodes.flatMap((node) =>
    node.connections.map((connection) => ({
      id: `${node.id}:${connection.outputPort}:${connection.targetSceneId}`,
      fromSceneId: node.id,
      toSceneId: connection.targetSceneId,
      outputPort: connection.outputPort,
      label: connection.label || '',
    }))
  );

  return {
    startSceneId,
    nodes,
    edges,
  };
}
