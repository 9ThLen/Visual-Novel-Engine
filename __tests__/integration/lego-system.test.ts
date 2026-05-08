import { describe, it, expect } from 'vitest';
import { createAtom, type AtomBlock } from '@/lib/atom-types';
import { createMolecule, type MoleculeBlock } from '@/lib/molecule-types';
import { createScene, type Scene } from '@/lib/scene-types';

describe('LEGO System Integration Test', () => {
  it('should create atoms, molecules, and scene with correct element count', () => {
    // Step 1: Create atoms (hero, villain, texts, background, music)
    const hero = createAtom('character_atom', { 
      characterId: 'hero', 
      position: 'left', 
      expression: 'happy' 
    } as any);
    
    const villain = createAtom('character_atom', { 
      characterId: 'villain', 
      position: 'right', 
      expression: 'angry' 
    } as any);
    
    const heroText = createAtom('text_atom', { 
      content: 'Hello there!', 
      speaker: 'Hero' 
    } as any);
    
    const villainText = createAtom('text_atom', { 
      content: 'Prepare to be defeated!', 
      speaker: 'Villain' 
    } as any);
    
    const narrationText = createAtom('text_atom', { 
      content: 'The hero enters the dark castle.', 
      speaker: undefined 
    } as any);
    
    const background = createAtom('background_atom', { 
      uri: '/backgrounds/castle.jpg', 
      transition: 'fade' 
    } as any);
    
    const music = createAtom('audio_atom', { 
      uri: '/audio/epic-theme.mp3', 
      loop: true, 
      volume: 80, 
      type: 'music' 
    } as any);

    // Verify atoms were created correctly
    expect(hero.type).toBe('character_atom');
    expect(hero.data.characterId).toBe('hero');
    expect(villain.type).toBe('character_atom');
    expect(villain.data.characterId).toBe('villain');
    expect(heroText.type).toBe('text_atom');
    expect(heroText.data.content).toBe('Hello there!');
    expect(villainText.type).toBe('text_atom');
    expect(villainText.data.content).toBe('Prepare to be defeated!');
    expect(narrationText.type).toBe('text_atom');
    expect(background.type).toBe('background_atom');
    expect(background.data.uri).toBe('/backgrounds/castle.jpg');
    expect(music.type).toBe('audio_atom');
    expect(music.data.type).toBe('music');

    // Step 2: Create molecules (dialogue_molecule, multi_dialogue_molecule, scene_molecule)
    const dialogueMolecule = createMolecule('dialogue_molecule', [hero, heroText]);
    expect(dialogueMolecule.type).toBe('dialogue_molecule');
    expect(dialogueMolecule.atoms).toHaveLength(2);

    // Multi-dialogue molecule (dialogue with multiple text atoms)
    const multiDialogueMolecule = createMolecule('dialogue_molecule', [villain, villainText, narrationText]);
    expect(multiDialogueMolecule.type).toBe('dialogue_molecule');
    expect(multiDialogueMolecule.atoms).toHaveLength(3);

    // Scene molecule with background and music
    const sceneMolecule = createMolecule('scene_molecule', [background, music]);
    expect(sceneMolecule.type).toBe('scene_molecule');
    expect(sceneMolecule.atoms).toHaveLength(2);

    // Step 3: Create scene with createScene()
    const scene: Scene = createScene('Epic Battle Scene');
    expect(scene.id).toBeDefined();
    expect(scene.name).toBe('Epic Battle Scene');
    expect(scene.elements).toHaveLength(0);

    // Step 4: Add elements to scene
    scene.elements.push(dialogueMolecule);
    scene.elements.push(multiDialogueMolecule);
    scene.elements.push(sceneMolecule);
    
    // Add individual atoms to scene as well
    scene.elements.push(hero);
    scene.elements.push(villainText);

    // Step 5: Verify scene.elements length
    expect(scene.elements).toHaveLength(5);
    
    // Verify each element in the scene
    expect(scene.elements[0].id).toBe(dialogueMolecule.id);
    expect(scene.elements[1].id).toBe(multiDialogueMolecule.id);
    expect(scene.elements[2].id).toBe(sceneMolecule.id);
    expect(scene.elements[3].id).toBe(hero.id);
    expect(scene.elements[4].id).toBe(villainText.id);

    // Verify the scene has both molecules and atoms
    const molecules = scene.elements.filter(el => 'atoms' in el);
    const atoms = scene.elements.filter(el => !('atoms' in el));
    
    expect(molecules).toHaveLength(3);
    expect(atoms).toHaveLength(2);
  });
});
