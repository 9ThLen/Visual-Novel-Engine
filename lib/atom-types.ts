import { z } from 'zod';

// Атоми — найменші блоки з одним елементом
export type AtomType = 
  | 'text_atom'        // Текст (репліка/викладка)
  | 'character_atom'   // Персонаж (спрайт/3D-модель)
  | 'background_atom'  // Фон (зображення/атмосфера)
  | 'audio_atom'       // Аудіо (музика або SFX)
  | 'fx_atom';         // Візуальні ефекти (світло, частинки)

export interface AtomBlock {
  id: string;
  type: AtomType;
  data: AtomData;
  x: number;
  y: number;
  width: number;
  height: number;
  // Для магнітного притягування
  snapPoints: SnapPoint[];
}

export interface SnapPoint {
  side: 'top' | 'bottom' | 'left' | 'right';
  offset: number; // відступ від краю (0-1)
  compatibleTypes: AtomType[]; // з якими типами можна з'єднуватись
}

export type AtomData = 
  | TextAtomData
  | CharacterAtomData
  | BackgroundAtomData
  | AudioAtomData
  | FXAtomData;

// Схеми для кожного типу атома
export const textAtomSchema = z.object({
  content: z.string().min(1, 'Text is required'),
  speaker: z.string().optional(), // ім'я персонажа (якщо діалог)
  duration: z.number().min(0).default(2000), // час показу в мс
});

export const characterAtomSchema = z.object({
  characterId: z.string().min(1, 'Character is required'),
  position: z.enum(['left', 'center', 'right']).default('center'),
  expression: z.string().default('neutral'),
  entrance: z.enum(['fade_in', 'slide_in_left', 'slide_in_right', 'none']).default('fade_in'),
});

export const backgroundAtomSchema = z.object({
  uri: z.string().min(1, 'Background is required'),
  transition: z.enum(['fade', 'dissolve', 'instant']).default('fade'),
});

export const audioAtomSchema = z.object({
  uri: z.string().min(1, 'Audio file is required'),
  loop: z.boolean().default(false),
  volume: z.number().min(0).max(100).default(80),
  type: z.enum(['music', 'sfx', 'voice']).default('sfx'),
});

export const fxAtomSchema = z.object({
  effectType: z.enum(['rain', 'snow', 'fog', 'particles', 'light', 'shake']),
  intensity: z.number().min(0).max(100).default(50),
  duration: z.number().min(0).default(3000),
});

export type TextAtomData = z.infer<typeof textAtomSchema>;
export type CharacterAtomData = z.infer<typeof characterAtomSchema>;
export type BackgroundAtomData = z.infer<typeof backgroundAtomSchema>;
export type AudioAtomData = z.infer<typeof audioAtomSchema>;
export type FXAtomData = z.infer<typeof fxAtomSchema>;

// Функція створення атома
export function createAtom(type: AtomType, overrides?: Partial<AtomData>): AtomBlock {
  const defaults: Record<AtomType, any> = {
    text_atom: { content: '', duration: 2000 },
    character_atom: { characterId: '', position: 'center', expression: 'neutral', entrance: 'fade_in' },
    background_atom: { uri: '', transition: 'fade' },
    audio_atom: { uri: '', loop: false, volume: 80, type: 'sfx' },
    fx_atom: { effectType: 'particles', intensity: 50, duration: 3000 },
  };
  
  return {
    id: `atom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    data: { ...defaults[type], ...overrides },
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    snapPoints: [
      { side: 'left', offset: 0.5, compatibleTypes: getCompatibleTypes(type, 'left') },
      { side: 'right', offset: 0.5, compatibleTypes: getCompatibleTypes(type, 'right') },
      { side: 'top', offset: 0.5, compatibleTypes: getCompatibleTypes(type, 'top') },
      { side: 'bottom', offset: 0.5, compatibleTypes: getCompatibleTypes(type, 'bottom') },
    ],
  };
}

function getCompatibleTypes(atomType: AtomType, side: string): AtomType[] {
  // Логіка сумісності для магнітного притягування
  const compatibility: Record<AtomType, Record<string, AtomType[]>> = {
    text_atom: { 
      left: ['character_atom'], 
      right: ['character_atom'], 
      top: [], 
      bottom: [] 
    },
    character_atom: { 
      left: ['text_atom', 'character_atom'], 
      right: ['text_atom', 'character_atom'], 
      top: ['background_atom'], 
      bottom: [] 
    },
    background_atom: { 
      left: [], 
      right: [], 
      top: [], 
      bottom: ['character_atom', 'text_atom', 'audio_atom', 'fx_atom'] 
    },
    audio_atom: { 
      left: ['background_atom'], 
      right: [], 
      top: [], 
      bottom: [] 
    },
    fx_atom: { 
      left: ['background_atom'], 
      right: [], 
      top: [], 
      bottom: [] 
    },
  };
  return compatibility[atomType]?.[side] || [];
}
