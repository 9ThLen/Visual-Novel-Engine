/**
 * Node Editor Types
 * Professional node-based visual editor for branching narratives
 */

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface NodeData {
  id: string;
  position: NodePosition;
  size: NodeSize;
  isStart: boolean;
  isEnd: boolean;
  hasImage: boolean;
  hasAudio: boolean;
  hasVoice: boolean;
  choiceCount: number;
  textPreview: string;
  warnings: string[];
}

export interface EdgeData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
  label: string;
  choiceId: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionState {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  isDragging: boolean;
  isConnecting: boolean;
  connectionSource: string | null;
}

export interface CanvasState {
  viewport: ViewportState;
  selection: SelectionState;
  nodes: Map<string, NodeData>;
  edges: Map<string, EdgeData>;
}
