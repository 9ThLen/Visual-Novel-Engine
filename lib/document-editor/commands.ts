import type { DocumentCommand, DocumentCommandId } from './types';

export const DOCUMENT_COMMANDS: DocumentCommand[] = [
  {
    id: 'background',
    blockType: 'background',
    title: 'Background',
    aliases: ['фон', 'картинка', 'зображення', 'background', 'bg', 'image', 'picture'],
    description: 'Change the scene background',
    scope: 'scene',
  },
  {
    id: 'character',
    blockType: 'character',
    title: 'Character',
    aliases: ['персонаж', 'герой', 'актор', 'character', 'hero', 'actor'],
    description: 'Add a character line',
    scope: 'scene',
  },
  {
    id: 'newScene',
    blockType: 'transition',
    title: 'New scene',
    aliases: ['нова сцена', 'новий лист', 'лист', 'сторінка', 'new scene', 'next scene', 'page'],
    description: 'Create the next scene',
    scope: 'scene',
  },
  {
    id: 'music',
    blockType: 'music',
    title: 'Music',
    aliases: ['музика', 'трек', 'music', 'track', 'bgm'],
    description: 'Play or change background music',
    scope: 'scene',
  },
  {
    id: 'sound',
    blockType: 'sound',
    title: 'Sound',
    aliases: ['звук', 'sfx', 'sound'],
    description: 'Add a sound effect',
    scope: 'scene',
  },
  {
    id: 'transition',
    blockType: 'transition',
    title: 'Transition',
    aliases: ['перехід', 'сцена', 'transition', 'goto', 'scene'],
    description: 'Move to another scene',
    scope: 'branch',
  },
  {
    id: 'variable',
    blockType: 'variable',
    title: 'Variable',
    aliases: ['змінна', 'прапорець', 'variable', 'flag'],
    description: 'Set or modify a story variable',
    scope: 'branch',
  },
  {
    id: 'effect',
    blockType: 'effect',
    title: 'Effect',
    aliases: ['ефект', 'анімація', 'effect', 'animation'],
    description: 'Add a visual effect',
    scope: 'scene',
  },
  {
    id: 'camera',
    blockType: 'camera',
    title: 'Camera',
    aliases: ['камера', 'зум', 'панорама', 'camera', 'zoom', 'pan', 'focus'],
    description: 'Control camera movement',
    scope: 'scene',
  },
  {
    id: 'interactive_object',
    blockType: 'interactive_object',
    title: 'Object',
    aliases: ["об'єкт", 'інтерактив', 'interactive', 'object', 'hotspot'],
    description: 'Add an interactive scene object',
    scope: 'scene',
  },
];

export function normalizeCommandQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findDocumentCommand(commandId: DocumentCommandId): DocumentCommand {
  const command = DOCUMENT_COMMANDS.find((item) => item.id === commandId);
  if (!command) {
    throw new Error(`Unknown document command: ${commandId}`);
  }
  return command;
}

export function searchDocumentCommands(query: string): DocumentCommand[] {
  const normalized = normalizeCommandQuery(query.replace(/^\//, ''));
  if (!normalized) {
    return DOCUMENT_COMMANDS;
  }

  return DOCUMENT_COMMANDS.filter((command) => {
    if (command.title.toLocaleLowerCase().includes(normalized)) {
      return true;
    }

    return command.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalized));
  });
}
