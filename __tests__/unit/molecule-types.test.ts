import { describe, it, expect } from 'vitest';
import { createMolecule, canSnap, MoleculeType, calculateBounds } from '@/lib/molecule-types';
import { createAtom, AtomType } from '@/lib/atom-types';

// Helper to create atoms with custom position/size overrides
const makeAtom = (type: AtomType, overrides: Partial<any> = {}) => {
  const atom = createAtom(type);
  return { ...atom, ...overrides };
};

describe('createMolecule', () => {
  describe('dialogue_molecule', () => {
    it('creates valid dialogue_molecule with character + text atoms', () => {
      const charAtom = makeAtom('character_atom', { characterId: 'hero' });
      const textAtom = makeAtom('text_atom', { content: 'Hello world' });
      
      const molecule = createMolecule('dialogue_molecule', [charAtom, textAtom]);
      
      expect(molecule.type).toBe('dialogue_molecule');
      expect(molecule.atoms).toHaveLength(2);
      expect(molecule.id).toMatch(/^molecule_\d+_[a-z0-9]{5}$/);
    });

    it('creates multi_dialogue with 2 characters + text atoms', () => {
      const char1 = makeAtom('character_atom', { characterId: 'hero' });
      const char2 = makeAtom('character_atom', { characterId: 'villain' });
      const textAtom = makeAtom('text_atom', { content: 'Both speak' });
      
      const molecule = createMolecule('dialogue_molecule', [char1, char2, textAtom]);
      
      expect(molecule.type).toBe('dialogue_molecule');
      expect(molecule.atoms).toHaveLength(3);
    });

    it('throws error when missing character atoms', () => {
      const textAtom = makeAtom('text_atom', { content: 'No character' });
      
      expect(() => createMolecule('dialogue_molecule', [textAtom]))
        .toThrow('Dialogue molecule requires at least one text_atom and one character_atom');
    });

    it('throws error when missing text atoms', () => {
      const charAtom = makeAtom('character_atom', { characterId: 'hero' });
      
      expect(() => createMolecule('dialogue_molecule', [charAtom]))
        .toThrow('Dialogue molecule requires at least one text_atom and one character_atom');
    });
  });

  describe('invalid combinations', () => {
    it('throws error for empty atoms array', () => {
      expect(() => createMolecule('dialogue_molecule', []))
        .toThrow('Molecule must have at least one atom');
    });

    it('throws error for atoms with missing required fields', () => {
      const invalidAtom = { id: '', type: 'text_atom', data: null } as any;
      
      expect(() => createMolecule('dialogue_molecule', [invalidAtom]))
        .toThrow('Invalid atom structure: missing required fields');
    });

    it('throws error for choice_molecule with less than 2 text atoms', () => {
      const textAtom = makeAtom('text_atom', { content: 'Only one option' });
      
      expect(() => createMolecule('choice_molecule', [textAtom]))
        .toThrow('Choice molecule requires at least 2 text_atom options');
    });
  });

  describe('bounds calculation', () => {
    it('calculates correct bounds from atom positions', () => {
      // Atom 1: x=10, y=20, width=100, height=50 → right=110, bottom=70
      // Atom 2: x=50, y=30, width=80, height=60 → right=130, bottom=90
      const atom1 = makeAtom('text_atom', { 
        content: 'First', 
        x: 10, y: 20, width: 100, height: 50 
      });
      const atom2 = makeAtom('character_atom', { 
        characterId: 'hero', 
        x: 50, y: 30, width: 80, height: 60 
      });
      
      const molecule = createMolecule('dialogue_molecule', [atom1, atom2]);
      
      expect(molecule.bounds).toEqual({
        x: 10,   // minX
        y: 20,   // minY
        width: 120, // 130 - 10
        height: 70  // 90 - 20
      });
    });

    it('returns zero bounds for empty atoms (pre-validation error)', () => {
      // calculateBounds is exported from molecule-types, test directly
      expect(calculateBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
  });
});

describe('canSnap', () => {
  // Helper to create molecules with specific bounds
  const makeMoleculeWithBounds = (type: MoleculeType, atoms: any[], bounds: any) => {
    const molecule = createMolecule(type, atoms);
    molecule.bounds = bounds;
    return molecule;
  };

  it('returns true for character+text molecules (dialogue) placed close horizontally', () => {
    const charAtom = makeAtom('character_atom', { characterId: 'hero' });
    const textAtom = makeAtom('text_atom', { content: 'Hello' });
    
    const m1 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 0, y: 0, width: 100, height: 50
    });
    // m1 right edge: 100, m2 left edge: 110 → distance 10 (threshold default 10)
    const m2 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 110, y: 0, width: 100, height: 50
    });
    
    expect(canSnap(m1, m2)).toBe(true);
  });

  it('returns false for text (choice) and background (scene) molecules without vertical overlap', () => {
    const textAtoms = [
      makeAtom('text_atom', { content: 'Option 1' }),
      makeAtom('text_atom', { content: 'Option 2' })
    ];
    const bgAtom = makeAtom('background_atom', { uri: 'scene1' });
    
    const m1 = makeMoleculeWithBounds('choice_molecule', textAtoms, {
      x: 0, y: 0, width: 100, height: 50
    });
    // m2 is below m1 with no vertical overlap
    const m2 = makeMoleculeWithBounds('scene_molecule', [bgAtom], {
      x: 110, y: 100, width: 100, height: 50
    });
    
    expect(canSnap(m1, m2)).toBe(false);
  });

  it('returns false when molecules are too far apart', () => {
    const charAtom = makeAtom('character_atom', { characterId: 'hero' });
    const textAtom = makeAtom('text_atom', { content: 'Hello' });
    
    const m1 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 0, y: 0, width: 100, height: 50
    });
    // Distance 100 > threshold 10
    const m2 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 200, y: 0, width: 100, height: 50
    });
    
    expect(canSnap(m1, m2)).toBe(false);
  });

  it('returns true for vertically close molecules with horizontal overlap', () => {
    const charAtom = makeAtom('character_atom', { characterId: 'hero' });
    const textAtom = makeAtom('text_atom', { content: 'Hello' });
    
    const m1 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 0, y: 0, width: 100, height: 50
    });
    // m1 bottom: 50, m2 top: 60 → distance 10 (threshold 10)
    const m2 = makeMoleculeWithBounds('dialogue_molecule', [charAtom, textAtom], {
      x: 20, y: 60, width: 100, height: 50
    });
    
    expect(canSnap(m1, m2)).toBe(true);
  });
});
