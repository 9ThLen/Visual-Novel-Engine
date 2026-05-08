import { BlockType, BlockCategory } from './block-types';
export { BlockCategory } from './block-types';

export interface BlockRegistryEntry {
  type: BlockType;
  label: string;
  labelUa: string;
  icon: string;
  category: BlockCategory;
  color: string;
  colorLight: string;
  borderColor: string;
  description: string;
  descriptionUa: string;
  defaultData: Record<string, any>;
}

export const BLOCK_REGISTRY: Record<BlockType, BlockRegistryEntry> = {
  dialogue: {
    type: 'dialogue',
    label: 'Dialogue',
    labelUa: 'Діалог',
    icon: '💬',
    category: 'text',
    color: '#3B82F6',
    colorLight: '#DBEAFE',
    borderColor: '#2563EB',
    description: 'Character speaks with name and text',
    descriptionUa: 'Персонаж говорить з імʼям та текстом',
    defaultData: { character: '', text: '' },
  },
  narration: {
    type: 'narration',
    label: 'Narration',
    labelUa: 'Наратив',
    icon: '📝',
    category: 'text',
    color: '#60A5FA',
    colorLight: '#EFF6FF',
    borderColor: '#3B82F6',
    description: 'Narrative text without a speaker',
    descriptionUa: 'Описовий текст без персонажа',
    defaultData: { text: '' },
  },
  show_character: {
    type: 'show_character',
    label: 'Show Character',
    labelUa: 'Показати персонажа',
    icon: '👤',
    category: 'character',
    color: '#10B981',
    colorLight: '#D1FAE5',
    borderColor: '#059669',
    description: 'Display a character sprite on screen',
    descriptionUa: 'Показати спрайт персонажа на екрані',
    defaultData: { characterId: '', position: 'center', expression: 'neutral' },
  },
  hide_character: {
    type: 'hide_character',
    label: 'Hide Character',
    labelUa: 'Сховати персонажа',
    icon: '👻',
    category: 'character',
    color: '#34D399',
    colorLight: '#D1FAE5',
    borderColor: '#059669',
    description: 'Remove a character from screen',
    descriptionUa: 'Прибрати персонажа з екрану',
    defaultData: { characterId: '' },
  },
  character_animation: {
    type: 'character_animation',
    label: 'Character Action',
    labelUa: 'Анімація персонажа',
    icon: '🎭',
    category: 'character',
    color: '#059669',
    colorLight: '#D1FAE5',
    borderColor: '#047857',
    description: 'Animate a character (shake, bounce, etc.)',
    descriptionUa: 'Анімувати персонажа (тряска, стрибок тощо)',
    defaultData: { characterId: '', animation: 'shake' },
  },
  set_background: {
    type: 'set_background',
    label: 'Background',
    labelUa: 'Фон',
    icon: '🖼',
    category: 'media',
    color: '#F59E0B',
    colorLight: '#FEF3C7',
    borderColor: '#D97706',
    description: 'Change the scene background image',
    descriptionUa: 'Змінити фонове зображення сцени',
    defaultData: { backgroundUri: '' },
  },
  play_music: {
    type: 'play_music',
    label: 'Music',
    labelUa: 'Музика',
    icon: '🎵',
    category: 'media',
    color: '#8B5CF6',
    colorLight: '#EDE9FE',
    borderColor: '#7C3AED',
    description: 'Play background music',
    descriptionUa: 'Грати фонову музику',
    defaultData: { musicUri: '', loop: true, volume: 80 },
  },
  play_sfx: {
    type: 'play_sfx',
    label: 'Sound Effect',
    labelUa: 'Звуковий ефект',
    icon: '🔊',
    category: 'media',
    color: '#A78BFA',
    colorLight: '#EDE9FE',
    borderColor: '#7C3AED',
    description: 'Play a sound effect',
    descriptionUa: 'Грати звуковий ефект',
    defaultData: { sfxUri: '', volume: 80 },
  },
  play_voice: {
    type: 'play_voice',
    label: 'Voice',
    labelUa: 'Голос',
    icon: '🎤',
    category: 'media',
    color: '#7C3AED',
    colorLight: '#EDE9FE',
    borderColor: '#6D28D9',
    description: 'Play voice audio line',
    descriptionUa: 'Грати голосову лінію',
    defaultData: { voiceUri: '' },
  },
  choice: {
    type: 'choice',
    label: 'Choice',
    labelUa: 'Вибір',
    icon: '🔀',
    category: 'logic',
    color: '#FBBF24',
    colorLight: '#FEF9C3',
    borderColor: '#F59E0B',
    description: 'Present a choice to the player',
    descriptionUa: 'Показати вибір гравцю',
    defaultData: { text: '', nextSceneId: '' },
  },
  condition: {
    type: 'condition',
    label: 'Condition',
    labelUa: 'Умова',
    icon: '🔷',
    category: 'logic',
    color: '#FCD34D',
    colorLight: '#FEF9C3',
    borderColor: '#F59E0B',
    description: 'Check a variable (if/else)',
    descriptionUa: 'Перевірити змінну (якщо/інакше)',
    defaultData: { variable: '', operator: 'equals', value: '' },
  },
  set_variable: {
    type: 'set_variable',
    label: 'Set Variable',
    labelUa: 'Змінна',
    icon: '🏷',
    category: 'logic',
    color: '#F59E0B',
    colorLight: '#FEF3C7',
    borderColor: '#D97706',
    description: 'Set or change a variable/flag',
    descriptionUa: 'Встановити або змінити змінну/прапорець',
    defaultData: { variable: '', value: '' },
  },
  transition: {
    type: 'transition',
    label: 'Transition',
    labelUa: 'Перехід',
    icon: '✨',
    category: 'effect',
    color: '#9CA3AF',
    colorLight: '#F3F4F6',
    borderColor: '#6B7280',
    description: 'Scene transition effect',
    descriptionUa: 'Ефект переходу між сценами',
    defaultData: { type: 'fade', duration: 500 },
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    labelUa: 'Пауза',
    icon: '⏱',
    category: 'effect',
    color: '#D1D5DB',
    colorLight: '#F9FAFB',
    borderColor: '#9CA3AF',
    description: 'Pause for a duration',
    descriptionUa: 'Пауза на вказаний час',
    defaultData: { duration: 1000 },
  },
  group: {
    type: 'group',
    label: 'Group',
    labelUa: 'Група',
    icon: '📦',
    category: 'logic',
    color: '#6B7280',
    colorLight: '#F3F4F6',
    borderColor: '#4B5563',
    description: 'Container for child blocks',
    descriptionUa: 'Контейнер для дочірніх блоків',
    defaultData: { title: 'Group' },
  },
};

export const BLOCK_CATEGORIES: { key: BlockCategory; label: string; labelUa: string; icon: string }[] = [
  { key: 'text', label: 'Text', labelUa: 'Текст', icon: '📄' },
  { key: 'character', label: 'Characters', labelUa: 'Персонажі', icon: '👥' },
  { key: 'media', label: 'Media', labelUa: 'Медіа', icon: '🎬' },
  { key: 'logic', label: 'Logic', labelUa: 'Логіка', icon: '🧠' },
  { key: 'effect', label: 'Effects', labelUa: 'Ефекти', icon: '✨' },
];

export function getBlocksByCategory(category: BlockCategory): BlockRegistryEntry[] {
  return Object.values(BLOCK_REGISTRY).filter((b) => b.category === category);
}

export function getBlockEntry(type: BlockType): BlockRegistryEntry {
  return BLOCK_REGISTRY[type];
}

export function getBlockLabel(type: BlockType, lang: 'en' | 'ua' = 'en'): string {
  const entry = BLOCK_REGISTRY[type];
  return lang === 'ua' ? entry.labelUa : entry.label;
}

