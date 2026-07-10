import type { DocumentCommandId } from '@/lib/document-editor/types';
import { allTranslations, type Language } from '@/lib/translations';

/** Multi-block templates offered in a dedicated "Snippets" section of the slash menu. */
export type EmbeddedSnippetCommandId = 'choiceTwoBranches' | 'sceneEnding';

export interface EmbeddedCommand {
  id: DocumentCommandId | EmbeddedSnippetCommandId;
  blockType: string;
  title: string;
  description: string;
  /** Slash-menu section this command is grouped under; omitted for the default command list. */
  group?: 'snippet';
  /** Localized section header, present only when `group` is set. */
  groupLabel?: string;
}

const EMBEDDED_COMMANDS: (EmbeddedCommand & { id: DocumentCommandId })[] = [
  { id: 'background', blockType: 'background', title: 'Background', description: 'Change the scene background' },
  { id: 'character', blockType: 'dialogue', title: 'Character', description: 'Add a character line' },
  { id: 'newScene', blockType: 'transition', title: 'New Scene', description: 'Create the next scene' },
  { id: 'music', blockType: 'music', title: 'Music', description: 'Play background music' },
  { id: 'sound', blockType: 'sound', title: 'Sound', description: 'Play sound effect' },
  { id: 'transition', blockType: 'transition', title: 'Transition', description: 'Move to another scene' },
  { id: 'variable', blockType: 'variable', title: 'Variable', description: 'Set or modify a story variable' },
  { id: 'label', blockType: 'label', title: 'Label', description: 'Mark a jump target inside the scene' },
  { id: 'goto', blockType: 'goto', title: 'Go to', description: 'Jump to a label, optionally by condition' },
  { id: 'effect', blockType: 'effect', title: 'Effect', description: 'Add a visual effect' },
  { id: 'stopEffect', blockType: 'stop_effect', title: 'Stop effect', description: 'Stop active visual effects' },
  { id: 'camera', blockType: 'camera', title: 'Camera', description: 'Control camera movement' },
  { id: 'interactive_object', blockType: 'interactive_object', title: 'Object', description: 'Add an interactive object' },
];

const EMBEDDED_SNIPPET_COMMANDS: (EmbeddedCommand & { id: EmbeddedSnippetCommandId; group: 'snippet' })[] = [
  { id: 'choiceTwoBranches', blockType: 'choice', title: 'Choice, two branches', description: 'Insert a choice with two branch options', group: 'snippet' },
  { id: 'sceneEnding', blockType: 'transition', title: 'Scene ending', description: 'Insert a transition that ends the story', group: 'snippet' },
];

const COMMAND_TRANSLATION_KEYS: Record<DocumentCommandId, { title: string; description: string }> = {
  background: { title: 'document.command.background', description: 'document.command.background.description' },
  character: { title: 'document.command.character', description: 'document.command.character.description' },
  newScene: { title: 'document.command.newScene', description: 'document.command.newScene.description' },
  music: { title: 'document.command.music', description: 'document.command.music.description' },
  sound: { title: 'document.command.sound', description: 'document.command.sound.description' },
  transition: { title: 'document.command.transition', description: 'document.command.transition.description' },
  variable: { title: 'document.command.variable', description: 'document.command.variable.description' },
  label: { title: 'document.command.label', description: 'document.command.label.description' },
  goto: { title: 'document.command.goto', description: 'document.command.goto.description' },
  effect: { title: 'document.command.effect', description: 'document.command.effect.description' },
  stopEffect: { title: 'document.command.stopEffect', description: 'document.command.stopEffect.description' },
  camera: { title: 'document.command.camera', description: 'document.command.camera.description' },
  interactive_object: { title: 'document.command.interactive_object', description: 'document.command.interactive_object.description' },
};

const SNIPPET_TRANSLATION_KEYS: Record<EmbeddedSnippetCommandId, { title: string; description: string }> = {
  choiceTwoBranches: {
    title: 'document.command.snippet.choiceTwoBranches',
    description: 'document.command.snippet.choiceTwoBranches.description',
  },
  sceneEnding: {
    title: 'document.command.snippet.sceneEnding',
    description: 'document.command.snippet.sceneEnding.description',
  },
};

const SNIPPET_GROUP_LABEL_KEY = 'document.command.group.snippets';
const SNIPPET_GROUP_LABEL_FALLBACK = 'Snippets';

export function getEmbeddedCommands(language: Language = 'en'): EmbeddedCommand[] {
  const translations = allTranslations[language] ?? allTranslations.en;

  const commands = EMBEDDED_COMMANDS.map((command) => {
    const keys = COMMAND_TRANSLATION_KEYS[command.id];
    return {
      ...command,
      title: translations[keys.title] ?? command.title,
      description: translations[keys.description] ?? command.description,
    };
  });

  const groupLabel = translations[SNIPPET_GROUP_LABEL_KEY] ?? SNIPPET_GROUP_LABEL_FALLBACK;
  const snippets = EMBEDDED_SNIPPET_COMMANDS.map((command) => {
    const keys = SNIPPET_TRANSLATION_KEYS[command.id];
    return {
      ...command,
      title: translations[keys.title] ?? command.title,
      description: translations[keys.description] ?? command.description,
      groupLabel,
    };
  });

  return [...commands, ...snippets];
}

export const embeddedCommands: EmbeddedCommand[] = getEmbeddedCommands('en');
