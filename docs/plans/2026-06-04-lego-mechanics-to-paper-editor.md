# План перенесення Lego-механік у паперовий редактор

Дата: 2026-06-04

## Висновок

Паперовий редактор вже створює technical-блоки для всіх Lego-типів через slash-команди, але це переважно тонка обгортка над `TimelineStep`. Частина блоків зберігається і виконується, частина має тільки муляж UI, а частина виконується в executor, але не відображається в reader/preview.

Не чіпати старі Block/Node системи. Єдина модель для перенесення: `DocumentBlock.kind === 'technical'` -> `TimelineStep` -> `useSceneExecutor` -> reader/preview side effects.

## Поточний стан блоків

| Блок | Paper UI | Save у timeline | Executor | Reader/Preview | Статус |
|---|---|---|---|---|---|
| `background` | є technical chip + ручні поля | так | так | так | працює, але потрібен asset picker |
| `character` / `sprite` | є technical chip + ручні поля | так | так | так | працює частково, потрібен character/sprite picker |
| `text` | нативний paper-блок | так | так | так | працює |
| `dialogue` | нативний paper-блок | так | так | так | працює |
| `choice` | нативний paper-блок | так | так | так | працює |
| `transition` / `newScene` | є technical chip + ручні поля | так | так | так | працює частково, потрібен scene picker |
| `music` | є technical chip + ручні поля | так | так | частково | муляж з точки зору UX: немає picker/preview controls |
| `sound` | є technical chip + ручні поля | так | ні | ні | муляж |
| `effect` | є technical chip + ручні поля | так | частково | ні | муляж у відображенні |
| `variable` | є technical chip + ручні поля | так | так | умови в Paper не редагуються | частково |
| `camera` | є technical chip + ручні поля | так | ні | ні | муляж |
| `interactive_object` | є technical chip + ручні поля | так | ні | ні | муляж |

## Докази в коді

- Slash-команди для paper-блоків є в `lib/document-editor/commands.ts`.
- `DocumentTechnicalPropertiesPanel` має поля для `music`, `sound`, `variable`, `effect`, `camera`, `interactive_object`, але це ручні `TextInput`, не Lego-пікери.
- `documentSceneToTimeline()` зберігає technical-блок як `block.step`, тому payload не губиться.
- `useSceneExecutor()`:
  - виконує `background`, `character`, `effect`, `music`, `variable`, `transition`;
  - має no-op для `sound`, `camera`, `interactive_object`.
- Reader використовує `sceneState.backgroundAssetId`, `characters`, `currentChoices`, `transitionTarget`, `musicTrackId`.
- `InteractiveObjectsLayer` і `getTimelineInteractiveObjects()` існують, але не підключені до `StoryReaderResponsive`.

## План робіт

### 1. Уніфікувати Paper technical UI з Lego properties

Ціль: paper-блок має редагувати той самий payload, що й Lego-блок.

Файли:
- `components/document-editor/DocumentTechnicalPropertiesPanel.tsx`
- `components/editor/properties/*PropertiesForm.tsx`
- `components/editor/modals/AssetPicker.tsx`
- `lib/editor/block-validation.ts`

Зміни:
- Винести спільні property controls або адаптер `PropertiesFormProps` для paper.
- Замінити ручні `TextInput` для assets на `AssetPicker`.
- Додати pickers:
  - music: audio library filtered as music;
  - sound: audio library filtered as sfx;
  - background: background assets;
  - character/sprite: character + sprite selector;
  - transition: scene selector;
  - interactive_object: image asset + action editor.
- Показувати validation/warnings через `getBlockEmptyFields()`.

### 2. Доробити runtime для no-op блоків

Ціль: якщо paper зберіг `TimelineStep`, reader має виконати його так само, як Lego preview.

Файли:
- `lib/engine/types.ts`
- `lib/engine/useSceneExecutor.ts`
- `hooks/useReaderAudio.ts`
- `components/story-reader-responsive.tsx`
- `components/reader/ReaderDisplay.tsx`

Зміни:
- Розширити `SceneState`:
  - `soundEvents: SoundRuntimeEvent[]`
  - `cameraState: CameraRuntimeState`
  - `interactiveObjects: InteractiveObject[]`
- `sound`: додавати одноразовий sound event з `assetId`, `volume`, `loop`, `pitchVariation`.
- `camera`: оновлювати camera state (`zoom`, `pan`, `focus`, `reset`).
- `interactive_object`: додавати object у `sceneState.interactiveObjects`.
- `effect`: залишити `activeEffects`, але додати reader rendering.

### 3. Підключити audio-механіку

Ціль: `music` і `sound` працюють не тільки як збережений payload.

Файли:
- `hooks/useReaderAudio.ts`
- `components/editor/PreviewScreen.tsx`
- `lib/audio-player-service.ts`
- `lib/audio-manager-enhanced.ts`

Зміни:
- `music`:
  - врахувати `action: play | stop | pause | fade`;
  - використовувати `fadeDuration`;
  - не ігнорувати `sceneState.musicVolume`.
- `sound`:
  - програвати one-shot events з executor;
  - не перезапускати старі sound events при кожному render;
  - покрити preview і reader однаково.
- Додати тести на `music stop/fade` і `sound play`.

### 4. Підключити visual effects

Ціль: `effect` з paper має видимий результат.

Файли:
- `components/reader/ReaderDisplay.tsx`
- `components/reader/ReaderTransitions.tsx`
- `components/editor/PreviewScreen.tsx`

Зміни:
- Рендерити `activeEffects`:
  - `shake`: transform контейнера;
  - `flash`: overlay;
  - `blur`, `vignette`, `glitch`: overlay/effect layer;
  - `rain`, `snow`: легкий particle/overlay layer.
- Узгодити тривалість із `EffectBlockData.duration`.
- Додати preview parity.

### 5. Підключити camera

Ціль: camera block впливає на фон/персонажів.

Файли:
- `lib/engine/useSceneExecutor.ts`
- `components/story-reader-responsive.tsx`
- `components/reader/ReaderDisplay.tsx`
- `components/editor/PreviewScreen.tsx`

Зміни:
- Застосувати `cameraState` до background/characters layer.
- `zoom`: scale.
- `pan`: translate X/Y.
- `focus`: знайти character position і змістити camera.
- `reset`: повернути scale/translate.

### 6. Підключити interactive_object

Ціль: об'єкти з paper з'являються в reader і виконують actions.

Файли:
- `components/InteractiveObjectsLayer.tsx`
- `components/story-reader-responsive.tsx`
- `lib/reader-runtime.ts`
- `lib/engine/useSceneExecutor.ts`

Зміни:
- Брати objects із `sceneState.interactiveObjects`, не з сирого timeline.
- Вмонтувати `InteractiveObjectsLayer` поверх сцени.
- Підключити actions:
  - `scene_transition` -> `onTransition`;
  - `dialogue` -> локальний temporary dialogue або executor event;
  - `play_audio` -> audio manager;
  - `show_image` -> overlay;
  - `trigger_event` -> callback/store event.

### 7. Додати умови для paper-блоків

Ціль: variable block має сенс для conditional flow.

Файли:
- `components/document-editor/DocumentTechnicalPropertiesPanel.tsx`
- `lib/engine/conditionUtils.ts`
- `lib/engine/types.ts`

Зміни:
- Додати редактор `TimelineStep.conditions` у technical panel.
- Додати condition editor для choice options.
- Не міняти semantics: executor вже викликає `conditionsMet()`.

### 8. Тести

Мінімум:
- `__tests__/unit/lib/document-editor.test.ts`: technical block зберігає повний payload після save.
- `__tests__/unit/lib/useSceneExecutor.test.ts`: `sound`, `camera`, `interactive_object`.
- `__tests__/unit/use-reader-audio.test.ts`: music actions + sound events.
- Component smoke: `StoryReaderResponsive` рендерить interactive objects/effects без падіння.

## Пріоритет виконання

1. Music UX: asset picker + stop/fade у reader/preview.
2. Sound runtime: executor event + audio playback.
3. Variable conditions у paper.
4. Effect rendering.
5. Camera rendering.
6. Interactive objects.
7. Загальна polish/validation для technical panel.

## Критерій готовності

Кожен block type з `BLOCK_TYPE_INFO` має:
- slash-команду в paper;
- форму редагування без ручного знання asset id;
- save/load без втрати payload;
- executor behavior;
- reader behavior;
- preview behavior;
- unit або component test.
