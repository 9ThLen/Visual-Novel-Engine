# Вирішення: Два типи Scene — StoryScene vs Scene

## Поточний стан

### StoryScene (`lib/types.ts:25`)
```typescript
interface StoryScene {
  id: string;
  text: string;                   // Dialogue text
  characters: CharacterSprite[];  // Sprites on screen
  choices: Choice[];              // Player choices
  backgroundImageUri?: string;
  voiceAudioUri?: string;
  musicUri?: string;
  splashScreen?: SplashScreenConfig;
  interactiveObjects?: InteractiveObject[];
  backgroundEffects?: BackgroundEffect[];
  autoAdvance?: { ... };
  blocks?: Block[];               // Block-based content
  audioTriggers?: AudioTrigger[];
}
```
**Домен:** Narrative content — те, що читає гравець у режимі читання.
**Споживачі:** `story-context.tsx`, `story-context-enhanced.ts`, `scene-editor.tsx` (через `SceneEditorForm`), `node-editor.tsx` (через `SceneEditorPanel` → `SceneEditorForm`), `reader.tsx`, `save-load.tsx`

### Scene (`lib/scene-types.ts:16`)
```typescript
interface Scene {
  id: string;
  name: string;
  elements: Array<AtomBlock | MoleculeBlock>;  // Visual blocks on canvas
  timeline: TimelineEvent[];                    // Animation timeline
  createdAt: Date;
  updatedAt: Date;
}
```
**Домен:** Visual workspace — LEGO-редактор для складання блочних сцен.
**Споживачі:** `stores/scene-store.ts` (Zustand), `components/lego-editor/`, `hooks/lego/`

## Чи можна об'єднати?

### Чому НІ

| Критерій | StoryScene | Scene |
|----------|-----------|-------|
| Мета | Груна для narrative (текст, вибори, аудіо) | Груна для visual canvas (блоки, таймлайн) |
| Зберігання | AsyncStorage через StoryRepository | Zustand persist middleware |
| Життєвий цикл | Створюється при створенні історії | Створюється при відкритті LEGO-редактора |
| Серіалізація | JSON (імпорт/експорт історій) | Нативний persist |
| Читач (reader) | Так — рендерить текст, вибори, персонажів | Ні — не використовується при читанні |

### Інтеграційна точка

`StoryScene.blocks?: Block[]` вже існує і може стати мостом між двома системами:
- BlocksTab у scene-editor працює з `StoryScene.blocks`
- LEGO canvas працює з `Scene.elements`

Наразі ці два поля **не синхронізовані** — вони живуть незалежно.

## Рекомендація

> **Залишити окремими типами.** Вони обслуговують принципово різні домени (narrative vs visual workspace).
>
> Якщо в майбутньому LEGO canvas стане основним редактором контенту, тоді `StoryScene.blocks` та `Scene.elements` можна буде об'єднати в єдиний тип — але зараз це premature unification.

## Активна проблема

`StoryScene.blocks` типізовано як `Block[] | undefined`, але реальна структура блоків, з якою працює BlocksTab → може відрізнятися від того, що очікує LEGO system. Потрібна єдина канонічна структура `Block`.

Поточний `Block` тип (`lib/block-types.ts`) використовується і в `StoryScene.blocks`, і в `BlockCanvas` — це вже єдине поле для синхронізації.