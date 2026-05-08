import { AtomBlock } from './atom-types';
import { MoleculeBlock } from './molecule-types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface TimelineEvent {
  id: string;
  elementId: string;
  startTime: number;
  duration: number;
  easing: string;
}

export interface Scene {
  id: string;
  name: string;
  elements: Array<AtomBlock | MoleculeBlock>;
  timeline: TimelineEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export function createScene(name: string): Scene {
  const id = generateId();
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
