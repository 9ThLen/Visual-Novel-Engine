import { Block } from './block-types';
import { SCENE_COLORS } from '../components/block-editor/types';

export interface SceneGroup {
  id: string;
  label: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  blockIds: string[];
  color: string;
  centerX: number;
  centerY: number;
}

class UnionFind {
  parent: number[];
  rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(i: number): number {
    if (this.parent[i] !== i) {
      this.parent[i] = this.find(this.parent[i]);
    }
    return this.parent[i];
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI === rootJ) return;
    if (this.rank[rootI] < this.rank[rootJ]) {
      this.parent[rootI] = rootJ;
    } else if (this.rank[rootI] > this.rank[rootJ]) {
      this.parent[rootJ] = rootI;
    } else {
      this.parent[rootJ] = rootI;
      this.rank[rootI]++;
    }
  }
}

export function detectSceneGroups(
  blocks: (Block & { x: number; y: number })[],
  proximityThreshold: number = 120
): SceneGroup[] {
  const n = blocks.length;
  if (n === 0) return [];

  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = blocks[j].x - blocks[i].x;
      const dy = blocks[j].y - blocks[i].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < proximityThreshold) {
        uf.union(i, j);
      }
    }
  }

  const rootToBlocks = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!rootToBlocks.has(root)) {
      rootToBlocks.set(root, []);
    }
    rootToBlocks.get(root)!.push(i);
  }

  const groups: SceneGroup[] = [];
  let groupIndex = 0;

  for (const [root, indices] of rootToBlocks) {
    if (indices.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const blockIds: string[] = [];
    let sumX = 0, sumY = 0;

    for (const idx of indices) {
      const b = blocks[idx];
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + 100);
      maxY = Math.max(maxY, b.y + 100);
      blockIds.push(b.id);
      sumX += b.x;
      sumY += b.y;
    }

    const groupId = `scene_${root}_${groupIndex}`;
    groups.push({
      id: groupId,
      label: `Сцена ${groupIndex + 1}`,
      bounds: { minX, minY, maxX, maxY },
      blockIds,
      color: SCENE_COLORS[groupIndex % SCENE_COLORS.length],
      centerX: sumX / indices.length + 50, // +50 for block center
      centerY: sumY / indices.length + 50,
    });
    groupIndex++;
  }

  return groups.sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX);
}

// Assign sceneId to blocks based on scene groups
export function assignSceneIds(
  blocks: Block[],
  sceneGroups: SceneGroup[]
): Block[] {
  const blockToScene = new Map<string, string>();
  sceneGroups.forEach((group) => {
    group.blockIds.forEach((bid) => {
      blockToScene.set(bid, group.id);
    });
  });

  return blocks.map((b) => ({
    ...b,
    sceneId: blockToScene.get(b.id),
  }));
}
