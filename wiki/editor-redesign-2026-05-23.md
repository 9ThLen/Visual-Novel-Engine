# Редизайн редактора VNE — Архітектурний план

**Дата:** 2026-05-23
**Статус:** Проект — очікує початку реалізації

## Огляд

Повний редизайн системи редактора візуальних новел. Поточна система (scene-editor.tsx + LegoFlowWorkspace + LegoCanvas) працює погано. Заміна на нову архітектуру побудовану наваколи Event System як ядра даних.

## Ключова ідея

**Більше немає атомів і молекул.** Стара система Atom → Molecule → Scene замінена на:

```
UI Block → Event → Runtime
```

Кожен блок у інтерфейсі користувача створює Event (подію). Timeline — це просто список подій. Runtime виконує події послідовно.

## 11 етапів реалізації

### Етап 1: Модель даних та Event System (3-4 дні)
- Нові типи: `Project`, `Scene`, `TimelineStep`, `EngineEvent` (union всіх подій)
- 13 типів подій: Background, CharacterSpawn, CharacterModify, Dialogue, Narration, Choice, Variable, Music, Sound, Transition, Camera, InteractiveObject, Effect
- Event Factory + Validation (Zod)
- Новий `use-project-store.ts` (заміна `use-lego-store.ts`)

### Етап 2: Timeline System (2-3 дні)
- Event Dispatcher — послідовне виконання подій
- State Restoration — знімки стану для rollback
- Preview Controller — керування відтворенням сцени

### Етап 3: Scene Runtime Engine (4-5 днів)
- Render Pipeline (Background → Effects → Characters → Objects → UI → Overlay)
- Layer System
- Character Runtime State
- Dialogue Runtime (typewriter, skip, auto, rollback)
- Music Runtime (persistent, fade, layered)
- Save/Load

### Етап 4: Asset System (2-3 дні)
- Централізована база ресурсів (backgrounds, sprites, CG, music, SFX, voice, UI)
- Метадані + теги + превью
- Asset Import flow
- Asset Picker UI

### Етап 5: Scene Composer UI (5-7 днів)
Головний екран редактора:
- Вертикальний ланцюжок блоків (як поверхи будинку / стріча)
- Типи блоків: Background, Character, Text, Dialogue, Choice, Effect, Music, InteractiveObject, Camera, Variable
- Кожен блок має унікальний напівпрозорий колір
- Drag-and-drop переміщення
- Вкладені блоки (Character → Effect, Object → Text/Dialogue)
- Undo/Redo (100 дій)
- Auto-save + бекапи (5 версій)
- Mini Preview (живий рендер)
- Full Preview (повноекранне відтворення)
- Адаптив: телефон / планшет

### Етап 6: Story Flow System (3-4 дні)
- Node graph редактор (перетягування сцен)
- З'єднання між сценами
- Choice connections (розгалуження)
- Merge paths (злиття)
- Flow Analysis (dead ends, unreachable, loops)

### Етап 7: Variables & Logic (2-3 дні)
- Типи: string, number, boolean, array
- Visual Condition Builder (IF/ELSE/AND/OR)
- Debug Mode (live variable viewer, event debugger)

### Етап 8: Audio System (2-3 дні)
- Music Engine (looping, crossfade, layered)
- SFX Engine (positional, random pitch)
- Voice System (synced with dialogue)

### Етап 9: Animation & Effects (3-4 дні)
- Character Animation (move, fade, shake, scale, slide)
- Camera System (zoom, pan, focus)
- Screen Effects (glitch, flash, blur, weather)

### Етап 10: Optimization (2-3 дні)
- Lazy loading для зображень/музики
- Virtualized lists
- Memory cleanup (LRU cache, snapshot pruning)

### Етап 11: Export System (3-4 дні)
- Desktop: Windows, Linux, Mac
- Mobile: Android
- Web: Browser playable

## Загальний термін: 31-42 робочих днів

## Міграція
- Старі типи зберігаються як Legacy
- Автоматична міграція при старті
- Повна сумісність з існуючими проектами

## Пов'язані сторінки
- [[architecture-reference|Довідник архітектури]]
- [[2026-05-23-session-report|Сесія 2026-05-23 — Редизайн редактора]]
