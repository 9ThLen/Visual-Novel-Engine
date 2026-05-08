export interface StoryNode {
  id: string;
  sceneId: string;
  label: string;
  x: number;
  y: number;
}

export interface StoryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}

export interface StoryGraph {
  nodes: StoryNode[];
  edges: StoryEdge[];
}
