# LEGO Block System — План реалізації

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Переробити систему створення візуальної новели на LEGO-подібну ієрархічну систему блоків: Атоми → Молекули → Сцени → Граф сюжету.

**Architecture:** Чотири рівні ієрархії з магнітним притягуванням (snap) на рівні UI. Zod-схеми валідації для кожного рівня. React Flow або кастомний Canvas для візуального редактора. Timeline-компонент для секвенсера всередині сцени.

**Tech Stack:** React Native + Expo, TypeScript, Zod v4, React Flow (або кастомний Canvas на react-native-skia), react-native-reanimated для анімацій притягування.

**Project Path:** /mnt/d/Programs/D/visual_novel_engine

---

## Етап 1: Нова типізація — Атоми (Atoms)

### Task 1.1: Створити типи для Atom blocks

**Objective:** Визначити нові типи для найменших блоків (атомів) з одним елементом.

**Files:**
- Create: `lib/atom-types.ts`
- Modify: `lib/block-types.ts` (додати new type aliases)

**Step 1: Write the atom types**

```typescript
// lib/atom-types.ts
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
```

**Step 2: Run type check**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx tsc --noEmit lib/atom-types.ts`
Expected: SUCCESS (або помилки, які виправимо в наступних кроках)

**Step 3: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add lib/atom-types.ts
git commit -m "feat: add Atom types for LEGO block system"
```

---

### Task 1.2: Додати тести для Atom types

**Objective:** Покрити нові типи та схеми тестами (TDD).

**Files:**
- Create: `__tests__/unit/atom-types.test.ts`

**Step 1: Write failing tests**

```typescript
// __tests__/unit/atom-types.test.ts
import { describe, it, expect } from 'vitest';
import { 
  createAtom, 
  textAtomSchema, 
  characterAtomSchema, 
  backgroundAtomSchema,
  audioAtomSchema,
  fxAtomSchema 
} from '../../lib/atom-types';

describe('Atom Types', () => {
  describe('createAtom', () => {
    it('should create a text atom with defaults', () => {
      const atom = createAtom('text_atom');
      expect(atom.type).toBe('text_atom');
      expect(atom.data).toHaveProperty('content', '');
      expect(atom.data).toHaveProperty('duration', 2000);
      expect(atom.id).toMatch(/^atom_\d+_[a-z0-9]+$/);
    });

    it('should create a character atom with defaults', () => {
      const atom = createAtom('character_atom');
      expect(atom.type).toBe('character_atom');
      expect(atom.data).toHaveProperty('characterId', '');
      expect(atom.data).toHaveProperty('position', 'center');
    });

    it('should apply overrides', () => {
      const atom = createAtom('text_atom', { content: 'Hello!', duration: 3000 });
      expect(atom.data.content).toBe('Hello!');
      expect(atom.data.duration).toBe(3000);
    });

    it('should have snap points', () => {
      const atom = createAtom('character_atom');
      expect(atom.snapPoints).toHaveLength(4);
      expect(atom.snapPoints[0].side).toBe('left');
    });
  });

  describe('textAtomSchema', () => {
    it('should validate valid text atom', () => {
      const result = textAtomSchema.safeParse({ content: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('should reject empty text', () => {
      const result = textAtomSchema.safeParse({ content: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('characterAtomSchema', () => {
    it('should validate with default expression', () => {
      const result = characterAtomSchema.safeParse({ characterId: 'char1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expression).toBe('neutral');
      }
    });
  });
});
```

**Step 2: Run tests to verify failure**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx vitest run __tests__/unit/atom-types.test.ts`
Expected: FAIL (якщо файл ще не створено або є помилки імпорту)

**Step 3: Fix imports and run again**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx vitest run __tests__/unit/atom-types.test.ts`
Expected: PASS (всі тести зелені)

**Step 4: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add __tests__/unit/atom-types.test.ts
git commit -m "test: add tests for Atom types and schemas"
```

---

## Етап 2: Молекули (Molecules/Snippets)

### Task 2.1: Створити типи для Molecules

**Objective:** Визначити типи для складених блоків (молекул) — результат з'єднання атомів.

**Files:**
- Create: `lib/molecule-types.ts`

**Step 1: Write molecule types**

```typescript
// lib/molecule-types.ts
import { AtomBlock, AtomType } from './atom-types';
import { z } from 'zod';

// Молекули — складені блоки з кількох атомів
export type MoleculeType =
  | 'dialogue_molecule'     // Character + Text
  | 'multi_dialogue_molecule' // Character + Character + Text
  | 'scene_molecule'        // Background + FX
  | 'audio_scene_molecule'  // Background + Audio
  | 'full_frame_molecule';  // Background + Character(s) + Text + Audio + FX

export interface MoleculeBlock {
  id: string;
  type: MoleculeType;
  atoms: AtomBlock[]; // Атоми, що входять до молекули
  bounds: { x: number; y: number; width: number; height: number };
  // Метадані для рендерингу
  label?: string;
}

// Схема валідації молекули
export const moleculeSchema = z.object({
  id: z.string(),
  type: z.enum(['dialogue_molecule', 'multi_dialogue_molecule', 'scene_molecule', 'audio_scene_molecule', 'full_frame_molecule']),
  atoms: z.array(z.any()), // Тут мала б бути рекурсивна схема, спрощуємо для MVP
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

// Функція створення молекули з атомів
export function createMolecule(type: MoleculeType, atoms: AtomBlock[]): MoleculeBlock {
  // Валідація: чи підходять атоми для цього типу молекули
  validateAtomsForMolecule(type, atoms);

  // Обчислення bounds (габарити молекули)
  const bounds = calculateBounds(atoms);

  return {
    id: `molecule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    atoms,
    bounds,
    label: getMoleculeLabel(type),
  };
}

function validateAtomsForMolecule(type: MoleculeType, atoms: AtomBlock[]): void {
  const requiredTypes: Record<MoleculeType, AtomType[][]> = {
    dialogue_molecule: [['character_atom'], ['text_atom']],
    multi_dialogue_molecule: [['character_atom'], ['character_atom'], ['text_atom']],
    scene_molecule: [['background_atom'], ['fx_atom']],
    audio_scene_molecule: [['background_atom'], ['audio_atom']],
    full_frame_molecule: [['background_atom'], ['character_atom'], ['text_atom']], // Мінімум
  };

  const required = requiredTypes[type];
  if (!required) {
    throw new Error(`Unknown molecule type: ${type}`);
  }

  // Спрощена перевірка: чи є хоча б один атом кожного потрібного типу
  for (const typeGroup of required) {
    const hasMatchingAtom = atoms.some(atom => typeGroup.includes(atom.type));
    if (!hasMatchingAtom) {
      throw new Error(`Missing required atom type for ${type}: expected one of ${typeGroup.join(', ')}`);
    }
  }
}

function calculateBounds(atoms: AtomBlock[]): { x: number; y: number; width: number; height: number } {
  if (atoms.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const minX = Math.min(...atoms.map(a => a.x));
  const minY = Math.min(...atoms.map(a => a.y));
  const maxX = Math.max(...atoms.map(a => a.x + a.width));
  const maxY = Math.max(...atoms.map(a => a.y + a.height));

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getMoleculeLabel(type: MoleculeType): string {
  const labels: Record<MoleculeType, string> = {
    dialogue_molecule: 'Діалог',
    multi_dialogue_molecule: 'Діалог (2 персонажі)',
    scene_molecule: 'Сцена з ефектом',
    audio_scene_molecule: 'Сцена з аудіо',
    full_frame_molecule: 'Повний кадр',
  };
  return labels[type] || type;
}

// Перевірка сумісності атомів для "магнітного" з'єднання
export function canSnap(sourceAtom: AtomBlock, targetAtom: AtomBlock, side: 'left' | 'right' | 'top' | 'bottom'): boolean {
  const sourceSnap = sourceAtom.snapPoints.find(sp => sp.side === side);
  if (!sourceSnap) return false;
  
  // Перевіряємо, чи targetAtom має сумісний тип для цього боку
  return sourceSnap.compatibleTypes.includes(targetAtom.type);
}
```

**Step 2: Run type check**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx tsc --noEmit lib/molecule-types.ts`

**Step 3: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add lib/molecule-types.ts
git commit -m "feat: add Molecule types for LEGO block system"
```

---

### Task 2.2: Додати тести для Molecules

**Objective:** Покрити молекули тестами.

**Files:**
- Create: `__tests__/unit/molecule-types.test.ts`

**Step 1: Write tests**

```typescript
// __tests__/unit/molecule-types.test.ts
import { describe, it, expect } from 'vitest';
import { createMolecule, canSnap } from '../../lib/molecule-types';
import { createAtom } from '../../lib/atom-types';

describe('Molecule Types', () => {
  describe('createMolecule', () => {
    it('should create dialogue molecule from character + text atoms', () => {
      const charAtom = createAtom('character_atom', { characterId: 'hero' });
      const textAtom = createAtom('text_atom', { content: 'Hello!' });
      
      const molecule = createMolecule('dialogue_molecule', [charAtom, textAtom]);
      
      expect(molecule.type).toBe('dialogue_molecule');
      expect(molecule.atoms).toHaveLength(2);
      expect(molecule.label).toBe('Діалог');
    });

    it('should throw on invalid atom combination', () => {
      const bgAtom = createAtom('background_atom', { uri: 'bg.jpg' });
      const textAtom = createAtom('text_atom', { content: 'Hello!' });
      
      expect(() => {
        createMolecule('dialogue_molecule', [bgAtom, textAtom]);
      }).toThrow(/Missing required atom type/);
    });

    it('should calculate bounds correctly', () => {
      const atom1 = createAtom('character_atom');
      atom1.x = 0; atom1.y = 0; atom1.width = 100; atom1.height = 80;
      
      const atom2 = createAtom('text_atom');
      atom2.x = 100; atom2.y = 0; atom2.width = 120; atom2.height = 80;
      
      const molecule = createMolecule('dialogue_molecule', [atom1, atom2]);
      
      expect(molecule.bounds.width).toBe(220); // 100 + 120
      expect(molecule.bounds.height).toBe(80);
    });
  });

  describe('canSnap', () => {
    it('should allow text to snap to character (right side)', () => {
      const charAtom = createAtom('character_atom');
      const textAtom = createAtom('text_atom');
      
      expect(canSnap(charAtom, textAtom, 'right')).toBe(true);
    });

    it('should not allow background to snap to text', () => {
      const bgAtom = createAtom('background_atom');
      const textAtom = createAtom('text_atom');
      
      expect(canSnap(textAtom, bgAtom, 'bottom')).toBe(false);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx vitest run __tests__/unit/molecule-types.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add __tests__/unit/molecule-types.test.ts
git commit -m "test: add tests for Molecule types"
```

---

## Етап 3: Сцени (Scenes) — головний контейнер

### Task 3.1: Створити тип Scene та Scene Store

**Objective:** Визначити тип сцени як контейнера для молекул та атомів, додати Zustand стор для управління сценами.

**Files:**
- Create: `lib/scene-types.ts`
- Create: `stores/scene-store.ts`

**Step 1: Write scene types**

```typescript
// lib/scene-types.ts
import { AtomBlock } from './atom-types';
import { MoleculeBlock } from './molecule-types';

export interface Scene {
  id: string;
  name: string;
  // Елементи сцени (атоми та молекули)
  elements: Array<AtomBlock | MoleculeBlock>;
  // Таймлайн (послідовність появи елементів)
  timeline: TimelineEvent[];
  // Метадані
  createdAt: number;
  updatedAt: number;
}

export interface TimelineEvent {
  id: string;
  elementId: string; // ID атома або молекули
  startTime: number; // мс від початку сцени
  duration: number; // мс (0 = нескінченність)
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export function createScene(name: string): Scene {
  return {
    id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    elements: [],
    timeline: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

**Step 2: Create scene store (Zustand)**

```typescript
// stores/scene-store.ts
import { create } from 'zustand';
import { Scene, TimelineEvent } from '../lib/scene-types';
import { AtomBlock } from '../lib/atom-types';
import { MoleculeBlock } from '../lib/molecule-types';

interface SceneStore {
  scenes: Scene[];
  activeSceneId: string | null;
  
  // Сцени
  addScene: (name: string) => void;
  removeScene: (sceneId: string) => void;
  setActiveScene: (sceneId: string) => void;
  updateSceneName: (sceneId: string, name: string) => void;
  
  // Елементи (атоми/молекули)
  addElement: (sceneId: string, element: AtomBlock | MoleculeBlock) => void;
  removeElement: (sceneId: string, elementId: string) => void;
  
  // Таймлайн
  addTimelineEvent: (sceneId: string, event: Omit<TimelineEvent, 'id'>) => void;
  removeTimelineEvent: (sceneId: string, eventId: string) => void;
  updateTimelineEvent: (sceneId: string, eventId: string, updates: Partial<TimelineEvent>) => void;
}

export const useSceneStore = create<SceneStore>((set) => ({
  scenes: [],
  activeSceneId: null,
  
  addScene: (name) => set((state) => {
    const newScene = createScene(name);
    return { 
      scenes: [...state.scenes, newScene],
      activeSceneId: state.activeSceneId || newScene.id,
    };
  }),
  
  removeScene: (sceneId) => set((state) => ({
    scenes: state.scenes.filter(s => s.id !== sceneId),
    activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
  })),
  
  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),
  
  updateSceneName: (sceneId, name) => set((state) => ({
    scenes: state.scenes.map(s => s.id === sceneId ? { ...s, name, updatedAt: Date.now() } : s),
  })),
  
  addElement: (sceneId, element) => set((state) => ({
    scenes: state.scenes.map(s => 
      s.id === sceneId 
        ? { ...s, elements: [...s.elements, element], updatedAt: Date.now() }
        : s
    ),
  })),
  
  removeElement: (sceneId, elementId) => set((state) => ({
    scenes: state.scenes.map(s => 
      s.id === sceneId 
        ? { 
            ...s, 
            elements: s.elements.filter(e => e.id !== elementId),
            timeline: s.timeline.filter(t => t.elementId !== elementId),
            updatedAt: Date.now() 
          }
        : s
    ),
  })),
  
  addTimelineEvent: (sceneId, event) => set((state) => ({
    scenes: state.scenes.map(s => 
      s.id === sceneId 
        ? { 
            ...s, 
            timeline: [
              ...s.timeline, 
              { ...event, id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` } 
            ],
            updatedAt: Date.now() 
          }
        : s
    ),
  })),
  
  removeTimelineEvent: (sceneId, eventId) => set((state) => ({
    scenes: state.scenes.map(s => 
      s.id === sceneId 
        ? { ...s, timeline: s.timeline.filter(t => t.id !== eventId), updatedAt: Date.now() }
        : s
    ),
  })),
  
  updateTimelineEvent: (sceneId, eventId, updates) => set((state) => ({
    scenes: state.scenes.map(s => 
      s.id === sceneId 
        ? { 
            ...s, 
            timeline: s.timeline.map(t => t.id === eventId ? { ...t, ...updates } : t),
            updatedAt: Date.now() 
          }
        : s
    ),
  })),
}));
```

**Step 3: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add lib/scene-types.ts stores/scene-store.ts
git commit -m "feat: add Scene types and Zustand store"
```

---

## Етап 4: UI — LEGO Canvas (Магнітне притягування)

### Task 4.1: Створити компонент AtomBlockComponent

**Objective:** Візуальний компонент для відображення атома на канвасі з індикаторами магнітних точок.

**Files:**
- Create: `components/lego-editor/AtomBlockComponent.tsx`
- Create: `components/lego-editor/MagnetIndicator.tsx`

**Step 1: Write AtomBlockComponent**

```tsx
// components/lego-editor/AtomBlockComponent.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AtomBlock } from '../../lib/atom-types';

interface Props {
  atom: AtomBlock;
  isSelected: boolean;
  onPress: () => void;
}

const ATOM_COLORS: Record<string, string> = {
  text_atom: '#3b82f6',
  character_atom: '#10b981',
  background_atom: '#f59e0b',
  audio_atom: '#8b5cf6',
  fx_atom: '#ec4899',
};

export const AtomBlockComponent: React.FC<Props> = ({ atom, isSelected, onPress }) => {
  const color = ATOM_COLORS[atom.type] || '#6b7280';
  
  return (
    <View
      style={[
        styles.container,
        { 
          width: atom.width, 
          height: atom.height,
          borderColor: isSelected ? '#fff' : color,
          backgroundColor: color + '33', // 20% opacity
        }
      ]}
    >
      {/* Snap indicators */}
      {atom.snapPoints.map((sp, idx) => (
        <View
          key={idx}
          style={[
            styles.snapPoint,
            sp.side === 'left' && { left: -4, top: sp.offset * atom.height - 4 },
            sp.side === 'right' && { right: -4, top: sp.offset * atom.height - 4 },
            sp.side === 'top' && { top: -4, left: sp.offset * atom.width - 4 },
            sp.side === 'bottom' && { bottom: -4, left: sp.offset * atom.width - 4 },
            { borderColor: color },
          ]}
        />
      ))}
      
      <Text style={styles.label}>{getAtomLabel(atom.type)}</Text>
    </View>
  );
};

function getAtomLabel(type: string): string {
  const labels: Record<string, string> = {
    text_atom: 'Текст',
    character_atom: 'Персонаж',
    background_atom: 'Фон',
    audio_atom: 'Аудіо',
    fx_atom: 'Ефект',
  };
  return labels[type] || type;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 8,
    position: 'relative',
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  snapPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
});
```

**Step 2: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add components/lego-editor/
git commit -m "feat: add AtomBlockComponent with magnetic snap points"
```

---

## Етап 5: Секвенсер (Timeline)

### Task 5.1: Створити Timeline компонент

**Objective:** Візуальний редактор послідовності (таймлайн) для встановлення порядку появи елементів у сцені.

**Files:**
- Create: `components/lego-editor/TimelineEditor.tsx`

**Step 1: Write TimelineEditor**

```tsx
// components/lego-editor/TimelineEditor.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { TimelineEvent } from '../../lib/scene-types';
import { useSceneStore } from '../../stores/scene-store';

interface Props {
  sceneId: string;
}

export const TimelineEditor: React.FC<Props> = ({ sceneId }) => {
  const scene = useSceneStore(s => s.scenes.find(sc => sc.id === sceneId));
  const addTimelineEvent = useSceneStore(s => s.addTimelineEvent);
  const removeTimelineEvent = useSceneStore(s => s.removeTimelineEvent);
  
  if (!scene) return <Text style={styles.empty}>Сцена не знайдена</Text>;
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Таймлайн: {scene.name}</Text>
      
      <ScrollView horizontal style={styles.timeline}>
        {scene.timeline.map((event, idx) => (
          <View key={event.id} style={styles.eventBlock}>
            <Text style={styles.eventTime}>{event.startTime}ms</Text>
            <Text style={styles.eventLabel}>Елемент {event.elementId.slice(0, 8)}</Text>
            <Text style={styles.eventDuration}>Тривалість: {event.duration}ms</Text>
          </View>
        ))}
      </ScrollView>
      
      <Text style={styles.hint}>
        Перетягуйте блоки на вісь часу для створення послідовності
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    margin: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  timeline: {
    flexDirection: 'row',
    minHeight: 100,
  },
  eventBlock: {
    width: 120,
    padding: 8,
    backgroundColor: '#334155',
    borderRadius: 8,
    marginRight: 8,
  },
  eventTime: {
    color: '#94a3b8',
    fontSize: 12,
  },
  eventLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  eventDuration: {
    color: '#94a3b8',
    fontSize: 10,
  },
  empty: {
    color: '#ef4444',
    textAlign: 'center',
    padding: 20,
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
```

**Step 2: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add components/lego-editor/TimelineEditor.tsx
git commit -m "feat: add TimelineEditor for sequencing scene elements"
```

---

## Етап 6: Граф сюжету (Story Graph)

### Task 6.1: Створити StoryGraph компонент

**Objective:** Візуальний редактор для з'єднання сцен у граф (DAG) зі стрілками навігації.

**Files:**
- Create: `components/lego-editor/StoryGraph.tsx`
- Create: `lib/story-graph-types.ts`

**Step 1: Write story graph types**

```typescript
// lib/story-graph-types.ts
export interface StoryNode {
  id: string;
  sceneId: string;
  label: string;
  x: number;
  y: number;
}

export interface StoryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string; // умова переходу (наприклад, "choice A")
}

export interface StoryGraph {
  nodes: StoryNode[];
  edges: StoryEdge[];
}
```

**Step 2: Write StoryGraph component (спрощений)**

```tsx
// components/lego-editor/StoryGraph.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StoryNode, StoryEdge, StoryGraph } from '../../lib/story-graph-types';

interface Props {
  graph: StoryGraph;
  onNodePress: (nodeId: string) => void;
}

export const StoryGraph: React.FC<Props> = ({ graph, onNodePress }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Граф сюжету</Text>
      
      {/* Спрощене відображення вузлів */}
      {graph.nodes.map(node => (
        <View
          key={node.id}
          style={[
            styles.node,
            { left: node.x, top: node.y }
          ]}
        >
          <Text style={styles.nodeLabel}>{node.label}</Text>
        </View>
      ))}
      
      {/* TODO: Намалювати стрілки (edges) через SVG або Skia */}
      <Text style={styles.hint}>
        З'єднуйте сцени стрілками для створення сюжету
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    padding: 16,
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  node: {
    position: 'absolute',
    padding: 12,
    backgroundColor: '#334155',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  nodeLabel: {
    color: '#e2e8f0',
    fontSize: 14,
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 16,
    fontStyle: 'italic',
  },
});
```

**Step 3: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add lib/story-graph-types.ts components/lego-editor/StoryGraph.tsx
git commit -m "feat: add StoryGraph types and component for scene navigation"
```

---

## Етап 7: Інтеграція та міграція

### Task 7.1: Створити міграцію зі старої системи блоків

**Objective:** Написати скрипт для конвертації старих Block → нові Atom/Molecule.

**Files:**
- Create: `lib/legacy-migration.ts`

**Step 1: Write migration script**

```typescript
// lib/legacy-migration.ts
import { Block } from './block-types';
import { AtomBlock, createAtom, AtomType } from './atom-types';
import { MoleculeBlock, createMolecule, MoleculeType } from './molecule-types';

export function migrateBlockToAtoms(block: Block): AtomBlock[] {
  const atoms: AtomBlock[] = [];
  
  switch (block.type) {
    case 'dialogue':
      // Character + Text
      atoms.push(createAtom('character_atom', { characterId: block.data.character }));
      atoms.push(createAtom('text_atom', { content: block.data.text }));
      break;
      
    case 'set_background':
      atoms.push(createAtom('background_atom', { uri: block.data.backgroundUri }));
      break;
      
    case 'play_music':
      atoms.push(createAtom('audio_atom', { 
        uri: block.data.musicUri, 
        loop: block.data.loop, 
        volume: block.data.volume,
        type: 'music' 
      }));
      break;
      
    // ... інші типи
  }
  
  return atoms;
}

export function migrateBlocksToScene(blocks: Block[], sceneName: string): { atoms: AtomBlock[]; molecules: MoleculeBlock[] } {
  const atoms: AtomBlock[] = [];
  const molecules: MoleculeBlock[] = [];
  
  blocks.forEach(block => {
    const blockAtoms = migrateBlockToAtoms(block);
    atoms.push(...blockAtoms);
    
    // Спроба згрупувати в молекули (спрощена логіка)
    if (block.type === 'dialogue' && blockAtoms.length >= 2) {
      const molecule = createMolecule('dialogue_molecule', blockAtoms);
      molecules.push(molecule);
    }
  });
  
  return { atoms, molecules };
}
```

**Step 2: Commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add lib/legacy-migration.ts
git commit -m "feat: add migration script from legacy Block to new Atom system"
```

---

## Етап 8: Тестування та фіналізація

### Task 8.1: Інтеграційні тести LEGO системи

**Objective:** Перевірити повний цикл: створення атомів → з'єднання в молекули → додавання у сцену → створення таймлайну.

**Files:**
- Create: `__tests__/integration/lego-system.test.ts`

**Step 1: Write integration test**

```typescript
// __tests__/integration/lego-system.test.ts
import { describe, it, expect } from 'vitest';
import { createAtom } from '../../lib/atom-types';
import { createMolecule } from '../../lib/molecule-types';
import { createScene } from '../../lib/scene-types';

describe('LEGO System Integration', () => {
  it('should create a full dialogue scene with timeline', () => {
    // 1. Створюємо атоми
    const hero = createAtom('character_atom', { characterId: 'hero', position: 'left' });
    const villain = createAtom('character_atom', { characterId: 'villain', position: 'right' });
    const heroText = createAtom('text_atom', { content: 'I will stop you!', duration: 1500 });
    const villainText = createAtom('text_atom', { content: 'Never!', duration: 1000 });
    const bg = createAtom('background_atom', { uri: 'battlefield.jpg' });
    const music = createAtom('audio_atom', { uri: 'epic.mp3', type: 'music', loop: true });
    
    // 2. З'єднуємо в молекули
    const dialogue1 = createMolecule('dialogue_molecule', [hero, heroText]);
    const dialogue2 = createMolecule('dialogue_molecule', [villain, villainText]);
    const sceneMolecule = createMolecule('scene_molecule', [bg, music]);
    
    // 3. Створюємо сцену
    const scene = createScene('Final Battle');
    expect(scene.name).toBe('Final Battle');
    expect(scene.elements).toHaveLength(0);
    
    // 4. Додаємо елементи до сцени (імітація)
    scene.elements.push(dialogue1, dialogue2, sceneMolecule);
    expect(scene.elements).toHaveLength(3);
  });
});
```

**Step 2: Run all tests**

Run: `cd /mnt/d/Programs/D/visual_novel_engine && npx vitest run`
Expected: All tests pass

**Step 3: Final commit**

```bash
cd /mnt/d/Programs/D/visual_novel_engine
git add __tests__/integration/lego-system.test.ts
git commit -m "test: add integration tests for LEGO block system"
```

---

## Пов'язані сторінки

[[code-analysis-report-2026-05-07|Аналіз коду 2026-05-07]]
[[audit-report-2026-05-07|Аудит сумісності React Native]]
[[index|Головна сторінка wiki]]

---

## Наступні кроки

1. **Виконати план через subagent-driven-development** — делегувати кожен Task підлеглому агенту
2. **Додати анімації притягування** через react-native-reanimated
3. **Інтегрувати з існуючим BlockFlowCanvas** — поступово замінити старі блоки новими
4. **Оновити wiki/index.md** з описом нової системи

---
*План створено: 2026-05-07*  
*Модель: tencent/hy3-preview:free (OpenRouter)*
