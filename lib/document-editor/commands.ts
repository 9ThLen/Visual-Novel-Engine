import type { DocumentCommand, DocumentCommandId } from './types';

export const DOCUMENT_COMMANDS: DocumentCommand[] = [
  {
    id: 'background',
    blockType: 'background',
    title: 'Фон',
    aliases: ['фон', 'картинка', 'зображення', 'background', 'bg', 'image', 'picture'],
    description: 'Додати або змінити фон сцени',
    scope: 'scene',
  },
  {
    id: 'character',
    blockType: 'character',
    title: 'Персонаж',
    aliases: ['персонаж', 'герой', 'актор', 'character', 'hero', 'actor'],
    description: 'Показати, сховати або розмістити персонажа',
    scope: 'character',
  },
  {
    id: 'sprite',
    blockType: 'character',
    title: 'Спрайт',
    aliases: ['спрайт', 'емоція', 'поза', 'sprite', 'expression', 'pose'],
    description: 'Змінити емоцію або позу персонажа',
    scope: 'character',
  },
  {
    id: 'newScene',
    blockType: 'transition',
    title: 'Нова сцена',
    aliases: ['нова сцена', 'новий лист', 'лист', 'сторінка', 'new scene', 'next scene', 'page'],
    description: 'Створити наступний лист сцени',
    scope: 'scene',
  },
  {
    id: 'music',
    blockType: 'music',
    title: 'Музика',
    aliases: ['музика', 'трек', 'music', 'track', 'bgm'],
    description: 'Увімкнути або змінити музику',
    scope: 'scene',
  },
  {
    id: 'sound',
    blockType: 'sound',
    title: 'Звук',
    aliases: ['звук', 'sfx', 'sound'],
    description: 'Додати звуковий ефект',
    scope: 'scene',
  },
  {
    id: 'transition',
    blockType: 'transition',
    title: 'Перехід',
    aliases: ['перехід', 'сцена', 'transition', 'goto', 'scene'],
    description: 'Перейти до іншої сцени або завершити історію',
    scope: 'branch',
  },
  {
    id: 'variable',
    blockType: 'variable',
    title: 'Змінна',
    aliases: ['змінна', 'прапорець', 'variable', 'flag'],
    description: 'Задати значення або прапорець сюжету',
    scope: 'branch',
  },
  {
    id: 'effect',
    blockType: 'effect',
    title: 'Ефект',
    aliases: ['ефект', 'анімація', 'effect', 'animation'],
    description: 'Додати візуальний ефект',
    scope: 'scene',
  },
  {
    id: 'camera',
    blockType: 'camera',
    title: 'Камера',
    aliases: ['камера', 'зум', 'панорама', 'camera', 'zoom', 'pan', 'focus'],
    description: 'Налаштувати рух або фокус камери',
    scope: 'scene',
  },
  {
    id: 'interactive_object',
    blockType: 'interactive_object',
    title: "Об'єкт",
    aliases: ["об'єкт", 'інтерактив', 'interactive', 'object', 'hotspot'],
    description: "Додати інтерактивний об'єкт сцени",
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
