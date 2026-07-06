import type { DocumentCommandId } from '@/lib/document-editor/types';
import { allTranslations, type Language } from '@/lib/translations';

export interface EmbeddedCommand {
  id: DocumentCommandId;
  blockType: string;
  title: string;
  description: string;
}

const EMBEDDED_COMMANDS: EmbeddedCommand[] = [
  { id: 'background', blockType: 'background', title: 'Background', description: 'Change the scene background' },
  { id: 'character', blockType: 'dialogue', title: 'Character', description: 'Add a character line' },
  { id: 'newScene', blockType: 'transition', title: 'New Scene', description: 'Create the next scene' },
  { id: 'music', blockType: 'music', title: 'Music', description: 'Play background music' },
  { id: 'sound', blockType: 'sound', title: 'Sound', description: 'Play sound effect' },
  { id: 'transition', blockType: 'transition', title: 'Transition', description: 'Move to another scene' },
  { id: 'variable', blockType: 'variable', title: 'Variable', description: 'Set or modify a story variable' },
  { id: 'effect', blockType: 'effect', title: 'Effect', description: 'Add a visual effect' },
  { id: 'camera', blockType: 'camera', title: 'Camera', description: 'Control camera movement' },
  { id: 'interactive_object', blockType: 'interactive_object', title: 'Object', description: 'Add an interactive object' },
];

const COMMAND_TRANSLATION_KEYS: Record<DocumentCommandId, { title: string; description: string }> = {
  background: { title: 'document.command.background', description: 'document.command.background.description' },
  character: { title: 'document.command.character', description: 'document.command.character.description' },
  newScene: { title: 'document.command.newScene', description: 'document.command.newScene.description' },
  music: { title: 'document.command.music', description: 'document.command.music.description' },
  sound: { title: 'document.command.sound', description: 'document.command.sound.description' },
  transition: { title: 'document.command.transition', description: 'document.command.transition.description' },
  variable: { title: 'document.command.variable', description: 'document.command.variable.description' },
  effect: { title: 'document.command.effect', description: 'document.command.effect.description' },
  camera: { title: 'document.command.camera', description: 'document.command.camera.description' },
  interactive_object: { title: 'document.command.interactive_object', description: 'document.command.interactive_object.description' },
};

export function getEmbeddedCommands(language: Language = 'en'): EmbeddedCommand[] {
  const translations = allTranslations[language] ?? allTranslations.en;

  return EMBEDDED_COMMANDS.map((command) => {
    const keys = COMMAND_TRANSLATION_KEYS[command.id];
    return {
      ...command,
      title: translations[keys.title] ?? command.title,
      description: translations[keys.description] ?? command.description,
    };
  });
}

export const embeddedCommands: EmbeddedCommand[] = getEmbeddedCommands('en');
