import { Block, BlockType } from '../../lib/block-types';

export type PortSide = 'top' | 'bottom' | 'left' | 'right';

export interface FlowEdge {
  id: string;
  fromNodeId: string;
  fromSide: PortSide;
  toNodeId: string;
  toSide: PortSide;
}

export interface SceneGroup {
  id: string;
  label: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  blockIds: string[];
  color: string;
}

export interface SceneEdge {
  id: string;
  fromSceneId: string;
  toSceneId: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DragState {
  nodeId: string;
  startX: number;
  startY: number;
  nodeStartX: number;
  nodeStartY: number;
}

export interface ConnectionDrag {
  fromNodeId: string;
  fromSide: PortSide;
  currentX: number;
  currentY: number;
}

export interface CanvasState {
  viewportX: number;
  viewportY: number;
  zoom: number;
}

export const BLOCK_SIZE = 100;
export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;
export const SCENE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
