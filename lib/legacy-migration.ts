import { Block, BlockType } from './block-types';
import { AtomBlock, AtomType, TextAtomData, CharacterAtomData, BackgroundAtomData, AudioAtomData, FXAtomData, createAtom } from './atom-types';
import { MoleculeBlock, MoleculeType, createMolecule } from './molecule-types';

/**
 * Convert a single legacy Block to one or more AtomBlocks
 */
export function migrateBlockToAtoms(block: Block): AtomBlock[] {
  const atoms: AtomBlock[] = [];

  switch (block.type) {
    case 'dialogue': {
      // Dialogue becomes a text_atom with speaker
      const textAtom = createAtom('text_atom', {
        content: block.data.text || '',
        speaker: block.data.character || '',
        duration: 2000,
      } as Partial<TextAtomData>);
      atoms.push(textAtom);

      // If character is specified, also create a character_atom
      if (block.data.character) {
        const characterAtom = createAtom('character_atom', {
          characterId: block.data.character,
          position: 'center' as const,
          expression: 'neutral',
          entrance: 'fade_in' as const,
        } as Partial<CharacterAtomData>);
        atoms.push(characterAtom);
      }
      break;
    }

    case 'narration': {
      // Narration becomes a text_atom without speaker
      const textAtom = createAtom('text_atom', {
        content: block.data.text || '',
        duration: 2000,
      } as Partial<TextAtomData>);
      atoms.push(textAtom);
      break;
    }

    case 'show_character': {
      // Show character becomes a character_atom
      const characterAtom = createAtom('character_atom', {
        characterId: block.data.characterId || '',
        position: block.data.position || 'center',
        expression: block.data.expression || 'neutral',
        entrance: 'fade_in' as const,
      } as Partial<CharacterAtomData>);
      atoms.push(characterAtom);
      break;
    }

    case 'hide_character': {
      // Hide character - use character_atom with special data or fx_atom
      // For migration, we'll create a character_atom that can be used to trigger hide
      const characterAtom = createAtom('character_atom', {
        characterId: block.data.characterId || '',
        position: 'center' as const,
        expression: 'neutral',
        entrance: 'none' as const,
      } as Partial<CharacterAtomData>);
      // Mark this atom for hide operation in data
      characterAtom.data.hideCharacter = true;
      atoms.push(characterAtom);
      break;
    }

    case 'character_animation': {
      // Character animation becomes an fx_atom
      const fxAtom = createAtom('fx_atom', {
        effectType: 'shake' as const,
        intensity: 50,
        duration: 1000,
      } as Partial<FXAtomData>);
      atoms.push(fxAtom);
      break;
    }

    case 'set_background': {
      // Set background becomes a background_atom
      const backgroundAtom = createAtom('background_atom', {
        uri: block.data.backgroundUri || '',
        transition: 'fade' as const,
      } as Partial<BackgroundAtomData>);
      atoms.push(backgroundAtom);
      break;
    }

    case 'play_music': {
      // Play music becomes an audio_atom with type 'music'
      const audioAtom = createAtom('audio_atom', {
        uri: block.data.musicUri || '',
        loop: block.data.loop !== undefined ? block.data.loop : true,
        volume: block.data.volume || 80,
        type: 'music' as const,
      } as Partial<AudioAtomData>);
      atoms.push(audioAtom);
      break;
    }

    case 'play_sfx': {
      // Play SFX becomes an audio_atom with type 'sfx'
      const audioAtom = createAtom('audio_atom', {
        uri: block.data.sfxUri || '',
        loop: false,
        volume: block.data.volume || 80,
        type: 'sfx' as const,
      } as Partial<AudioAtomData>);
      atoms.push(audioAtom);
      break;
    }

    case 'play_voice': {
      // Play voice becomes an audio_atom with type 'voice'
      const audioAtom = createAtom('audio_atom', {
        uri: block.data.voiceUri || '',
        loop: false,
        volume: 80,
        type: 'voice' as const,
      } as Partial<AudioAtomData>);
      atoms.push(audioAtom);
      break;
    }

    case 'choice': {
      // Choice becomes multiple text_atoms (one per option)
      // For single choice block, create one text_atom
      const textAtom = createAtom('text_atom', {
        content: block.data.text || 'Choice',
        duration: 0, // Wait for user input
      } as Partial<TextAtomData>);
      atoms.push(textAtom);
      break;
    }

    case 'transition': {
      // Transition becomes an fx_atom
      const fxAtom = createAtom('fx_atom', {
        effectType: 'fade' as any, // Using fade-like effect
        intensity: 100,
        duration: block.data.duration || 500,
      } as Partial<FXAtomData>);
      atoms.push(fxAtom);
      break;
    }

    case 'wait': {
      // Wait - create a text_atom with empty content that acts as delay
      const waitAtom = createAtom('text_atom', {
        content: '',
        duration: block.data.duration || 1000,
      } as Partial<TextAtomData>);
      atoms.push(waitAtom);
      break;
    }

    case 'condition':
    case 'set_variable':
    case 'group':
      // These are logic blocks that don't directly map to atoms
      // They might be handled at a higher level or ignored in atom migration
      break;

    default:
      console.warn(`Unknown block type: ${block.type}`);
  }

  return atoms;
}

/**
 * Try to group atoms into molecules based on compatibility rules
 */
function groupAtomsIntoMolecules(atoms: AtomBlock[]): { molecules: MoleculeBlock[]; ungrouped: AtomBlock[] } {
  const molecules: MoleculeBlock[] = [];
  const usedIndices = new Set<number>();

  // Helper to check if atom at index is already used
  const isUsed = (idx: number) => usedIndices.has(idx);

  // Try to form dialogue_molecule: text_atom + character_atom
  for (let i = 0; i < atoms.length; i++) {
    if (isUsed(i) || atoms[i].type !== 'text_atom') continue;

    // Look for a character_atom that follows or precedes
    let characterIdx = -1;
    for (let j = 0; j < atoms.length; j++) {
      if (isUsed(j) || atoms[j].type !== 'character_atom') continue;
      // Check if this character is related to the text (has speaker info)
      if (atoms[i].data.speaker && atoms[j].data.characterId === atoms[i].data.speaker) {
        characterIdx = j;
        break;
      }
    }

    if (characterIdx >= 0) {
      const dialogueAtoms = [atoms[i], atoms[characterIdx]];
      try {
        const molecule = createMolecule('dialogue_molecule', dialogueAtoms);
        molecules.push(molecule);
        usedIndices.add(i);
        usedIndices.add(characterIdx);
      } catch (e) {
        console.warn('Failed to create dialogue molecule:', e);
      }
    }
  }

  // Try to form scene_molecule: background_atom + fx_atom
  for (let i = 0; i < atoms.length; i++) {
    if (isUsed(i) || atoms[i].type !== 'background_atom') continue;

    const sceneAtoms: AtomBlock[] = [atoms[i]];
    usedIndices.add(i);

    // Look for related fx_atoms or audio_atoms nearby
    for (let j = 0; j < atoms.length; j++) {
      if (isUsed(j)) continue;
      if (atoms[j].type === 'fx_atom' || atoms[j].type === 'audio_atom') {
        sceneAtoms.push(atoms[j]);
        usedIndices.add(j);
      }
    }

    try {
      const molecule = createMolecule('scene_molecule', sceneAtoms);
      molecules.push(molecule);
    } catch (e) {
      console.warn('Failed to create scene molecule:', e);
    }
  }

  // Try to form character_molecule: character_atom + audio_atom
  for (let i = 0; i < atoms.length; i++) {
    if (isUsed(i) || atoms[i].type !== 'character_atom') continue;

    const charAtoms: AtomBlock[] = [atoms[i]];
    usedIndices.add(i);

    for (let j = 0; j < atoms.length; j++) {
      if (isUsed(j) || atoms[j].type !== 'audio_atom') continue;
      // Only add voice audio to character molecule
      if (atoms[j].data.type === 'voice') {
        charAtoms.push(atoms[j]);
        usedIndices.add(j);
      }
    }

    try {
      const molecule = createMolecule('character_molecule', charAtoms);
      molecules.push(molecule);
    } catch (e) {
      console.warn('Failed to create character molecule:', e);
    }
  }

  // Try to form audio_molecule: audio_atom(s)
  const remainingAudio = atoms.filter((a, idx) => !isUsed(idx) && a.type === 'audio_atom');
  if (remainingAudio.length > 0) {
    try {
      const molecule = createMolecule('audio_molecule', remainingAudio);
      molecules.push(molecule);
      remainingAudio.forEach(a => {
        const idx = atoms.indexOf(a);
        if (idx >= 0) usedIndices.add(idx);
      });
    } catch (e) {
      console.warn('Failed to create audio molecule:', e);
    }
  }

  // Try to form choice_molecule: multiple text_atoms
  const remainingText = atoms.filter((a, idx) => !isUsed(idx) && a.type === 'text_atom' && a.data.content);
  if (remainingText.length >= 2) {
    try {
      const molecule = createMolecule('choice_molecule', remainingText);
      molecules.push(molecule);
      remainingText.forEach(a => {
        const idx = atoms.indexOf(a);
        if (idx >= 0) usedIndices.add(idx);
      });
    } catch (e) {
      console.warn('Failed to create choice molecule:', e);
    }
  }

  // All remaining atoms are ungrouped
  const ungrouped = atoms.filter((_, idx) => !usedIndices.has(idx));

  return { molecules, ungrouped };
}

/**
 * Migrate an array of legacy Blocks to a scene with atoms and molecules
 */
export function migrateBlocksToScene(blocks: Block[], sceneName: string): { atoms: AtomBlock[]; molecules: MoleculeBlock[] } {
  // Step 1: Convert all blocks to atoms
  const allAtoms: AtomBlock[] = [];
  
  for (const block of blocks) {
    const atoms = migrateBlockToAtoms(block);
    allAtoms.push(...atoms);
  }

  // Step 2: Try to group atoms into molecules
  const { molecules, ungrouped } = groupAtomsIntoMolecules(allAtoms);

  // Step 3: Return both molecules and ungrouped atoms
  return {
    atoms: ungrouped,
    molecules,
  };
}
