import { AtomBlock } from './atom-types';
import { MoleculeBlock } from './molecule-types';
import { generateId } from './id-utils';

export interface TimelineEvent {
  id: string;
  elementId: string;
  startTime: number;
  duration: number;
  easing: string;
}

export interface LegoScene {
  id: string;
  name: string;
  elements: (AtomBlock | MoleculeBlock)[];
  timeline: TimelineEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export function createLegoScene(name: string): LegoScene {
  const id = generateId('scene');
  const now = new Date();
  return {
    id,
    name,
    elements: [],
    timeline: [],
    createdAt: now,
    updatedAt: now,
  };
}
