import { z } from 'zod';
import { AtomBlock, AtomType, textAtomSchema, characterAtomSchema, backgroundAtomSchema, audioAtomSchema, fxAtomSchema } from './atom-types';
import { generateId } from './id-utils';

export type MoleculeType = 
  | 'dialogue_molecule'
  | 'choice_molecule'
  | 'scene_molecule'
  | 'character_molecule'
  | 'audio_molecule';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MoleculeBlock {
  id: string;
  type: MoleculeType;
  atoms: AtomBlock[];
  bounds: Bounds;
}

const atomTypeEnum = z.enum(['text_atom', 'character_atom', 'background_atom', 'audio_atom', 'fx_atom']);

const snapPointSchema = z.object({
  side: z.enum(['top', 'bottom', 'left', 'right']),
  offset: z.number().min(0).max(1),
  compatibleTypes: z.array(atomTypeEnum),
});

const atomDataSchema = z.union([
  textAtomSchema,
  characterAtomSchema,
  backgroundAtomSchema,
  audioAtomSchema,
  fxAtomSchema,
]);

const atomBlockSchema = z.object({
  id: z.string().min(1),
  type: atomTypeEnum,
  data: atomDataSchema as z.ZodTypeAny,
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  snapPoints: z.array(snapPointSchema),
});

export const moleculeSchema = z.object({
  id: z.string().min(1, 'Molecule ID is required'),
  type: z.enum(['dialogue_molecule', 'choice_molecule', 'scene_molecule', 'character_molecule', 'audio_molecule']),
  atoms: z.array(atomBlockSchema).min(1, 'Molecule must contain at least one atom'),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().min(0, 'Width cannot be negative'),
    height: z.number().min(0, 'Height cannot be negative'),
  }),
});

// Validate atoms are compatible with molecule type
export function validateAtomsForMolecule(type: MoleculeType, atoms: AtomBlock[]): { valid: boolean; error?: string } {
  if (atoms.length === 0) {
    return { valid: false, error: 'Molecule must have at least one atom' };
  }

  // Basic atom structure validation
  for (const atom of atoms) {
    if (!atom.id || !atom.type || !atom.data) {
      return { valid: false, error: 'Invalid atom structure: missing required fields' };
    }
  }

  // Type-specific atom validation
  switch (type) {
    case 'dialogue_molecule':
      const hasText = atoms.some(a => a.type === 'text_atom');
      const hasCharacter = atoms.some(a => a.type === 'character_atom');
      if (!hasText || !hasCharacter) {
        return { valid: false, error: 'Dialogue molecule requires at least one text_atom and one character_atom' };
      }
      break;
    case 'choice_molecule':
      const choiceTexts = atoms.filter(a => a.type === 'text_atom');
      if (choiceTexts.length < 2) {
        return { valid: false, error: 'Choice molecule requires at least 2 text_atom options' };
      }
      break;
    case 'scene_molecule':
      const hasBackgroundOrFX = atoms.some(a => a.type === 'background_atom' || a.type === 'fx_atom');
      if (!hasBackgroundOrFX) {
        return { valid: false, error: 'Scene molecule requires at least one background_atom or fx_atom' };
      }
      break;
    case 'character_molecule':
      const hasChar = atoms.some(a => a.type === 'character_atom');
      if (!hasChar) {
        return { valid: false, error: 'Character molecule requires at least one character_atom' };
      }
      break;
    case 'audio_molecule':
      const hasAudio = atoms.some(a => a.type === 'audio_atom');
      if (!hasAudio) {
        return { valid: false, error: 'Audio molecule requires at least one audio_atom' };
      }
      break;
  }

  return { valid: true };
}

// Calculate bounding box from contained atoms
export function calculateBounds(atoms: AtomBlock[]): Bounds {
  if (atoms.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const atom of atoms) {
    const atomRight = atom.x + atom.width;
    const atomBottom = atom.y + atom.height;

    minX = Math.min(minX, atom.x);
    minY = Math.min(minY, atom.y);
    maxX = Math.max(maxX, atomRight);
    maxY = Math.max(maxY, atomBottom);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// Get human-readable label for molecule type
export function getMoleculeLabel(type: MoleculeType): string {
  const labels: Record<MoleculeType, string> = {
    dialogue_molecule: 'Dialogue Scene',
    choice_molecule: 'Choice Menu',
    scene_molecule: 'Scene Transition',
    character_molecule: 'Character Setup',
    audio_molecule: 'Audio Playback',
  };
  return labels[type];
}

// Check if two molecules can magnetically snap together
export function canSnap(moleculeA: MoleculeBlock, moleculeB: MoleculeBlock, threshold: number = 10): boolean {
  const a = moleculeA.bounds;
  const b = moleculeB.bounds;

  // Check for edge proximity within threshold
  const leftDist = Math.abs(a.x - (b.x + b.width));
  const rightDist = Math.abs(a.x + a.width - b.x);
  const topDist = Math.abs(a.y - (b.y + b.height));
  const bottomDist = Math.abs(a.y + a.height - b.y);

  const horizontalClose = leftDist <= threshold || rightDist <= threshold;
  const verticalClose = topDist <= threshold || bottomDist <= threshold;

  // Check for overlap in the other axis when edges are close
  const horizontalOverlap = a.x < b.x + b.width && a.x + a.width > b.x;
  const verticalOverlap = a.y < b.y + b.height && a.y + a.height > b.y;

  return (horizontalClose && verticalOverlap) || (verticalClose && horizontalOverlap);
}

// Create and validate a new molecule
export function createMolecule(type: MoleculeType, atoms: AtomBlock[]): MoleculeBlock {
  // Validate atoms first
  const validation = validateAtomsForMolecule(type, atoms);
  if (!validation.valid) {
    throw new Error(`Failed to create molecule: ${validation.error}`);
  }

  // Calculate bounds from atoms
  const bounds = calculateBounds(atoms);

  // Generate unique ID and build molecule object
  const id = generateId('molecule');
  const molecule = { id, type, atoms, bounds };

  // Validate with Zod schema
  return moleculeSchema.parse(molecule) as MoleculeBlock;
}
