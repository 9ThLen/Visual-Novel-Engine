import type { DocumentCommandId } from '@/lib/document-editor/types';

export interface EmbeddedCommand {
  id: DocumentCommandId;
  blockType: string;
  title: string;
  description: string;
}

export const embeddedCommands: EmbeddedCommand[] = [
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
