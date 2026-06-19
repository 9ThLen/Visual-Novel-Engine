# Native Scene Editor — План реалізації

## Контекст

PlateJS працює тільки на web. На native (Android/iOS) редактор сцени — порожня заглушка.
Потрібно зробити повноцінний native-редактор, який:
- НЕ залежить від PlateJS
- Використовує спільну модель сцени (SceneRecord / TimelineStep)
- Має власний React Native UI (TextInput + preview + toolbar)
- Реалізує текстовий сценарний формат як основу

## Архітектура

```
src/features/editor/
  shared/                    ← Спільна модель (web + native)
    scene-types.ts           ← SceneNode, SceneDocument
    scene-parser.ts          ← parseSceneText → SceneNode[]
    scene-serializer.ts      ← serializeScene → string
    character-colors.ts      ← Дубль з components/editor/plate/character-colors.ts

  web/                       ← Тільки web (PlateJS)
    (існуючі файли без змін)

  native/                    ← Тільки native (React Native)
    NativeSceneEditor.tsx    ← Головний компонент
    NativeSceneTextInput.tsx ← TextInput з підсвіткою синтаксису
    NativeBlockPreview.tsx   ← Превью блоків під текстом
    NativeToolbar.tsx        ← Нижня панель команд
    NativeCommandSheet.tsx   ← Bottom sheet для вибору команди
```

## Текстовий сценарний формат

```
Маша: Привіт!
Петро: Як справи?
[background forest_day]
[show masha happy]
[play music calm_theme]
[choice]
- Піти додому -> scene_home
- Залишитися -> scene_stay
[end choice]
```

Правила parser:
- `Ім'я: текст` → DialogueNode
- `[background assetId]` → BackgroundNode
- `[show characterId spriteId]` → CharacterNode
- `[play music assetId]` → AudioNode (music)
- `[play sound assetId]` → AudioNode (sfx)
- `[choice]` ... `[end choice]` → ChoiceNode
- `[transition targetSceneId]` → TransitionNode
- `[variable name=value]` → VariableNode
- `[effect type]` → EffectNode
- `[camera action]` → CameraNode
- Все інше → NarrationNode

## Етапи

### Етап 1 — Спільна модель + Parser
**Файли:**
- `lib/editor/native-scene/scene-types.ts`
- `lib/editor/native-scene/scene-parser.ts`
- `lib/editor/native-scene/scene-serializer.ts`

**Що робити:**
1. Визначити SceneNode types (dialogue, narration, background, character, audio, choice, transition, variable, effect, camera)
2. Визначити SceneDocument (id, title, nodes[])
3. Реалізувати parseSceneText(input: string): SceneNode[]
4. Реалізувати serializeScene(doc: SceneDocument): string
5. Реалізувати sceneRecordToDocument(record: SceneRecord): SceneDocument
6. Реалізувати documentToSceneRecord(doc: SceneDocument, record: SceneRecord): SceneRecord
7. Тести для parser/serializer (round-trip)

**Критерій завершення:** Parser парвс приклад вище, тести проходять.

### Етап 2 — NativeSceneEditor MVP
**Файли:**
- `components/editor/plate/PlateSceneEditor.native.tsx` — переписати як адаптер
- `components/editor/native/NativeSceneEditor.tsx`

**Що робити:**
1. NativeSceneEditor приймає SceneDocument + onChange
2. Внутрішній стан: text (string) + nodes (SceneNode[])
3. TextInput (multiline, textAlignVertical="top")
4. onChangeText → parseSceneText → onChange(doc)
5. Під текстом — простий список блоків (NativeBlockPreview)
6. Кольорові бейджі для персонажів (hash-based з character-colors)

**Критерій завершення:** Можна редагувати сценар як текст, бачити блоки під текстом.

### Етап 3 — Toolbar + Command Sheet
**Файли:**
- `components/editor/native/NativeToolbar.tsx`
- `components/editor/native/NativeCommandSheet.tsx`

**Що робити:**
1. Toolbar з кнопками: [Персонаж] [Фон] [Звук] [Вибір] [Команда]
2. Кнопка "Персонаж" → діалог введення "Ім'я: текст" → вставка в TextInput
3. Кнопка "Фон" → вибір з медіатеки → `[background assetId]`
4. Кнопка "Звук" → вибір з медіатеки → `[play music/sound assetId]`
5. Кнопка "Вибір" → форма з опціями → `[choice]...[end choice]`
6. Кнопка "Команда" → меню команд (transition, variable, effect, camera)

**Критерій завершення:** Можна вставляти команди через UI, не друкуючи вручну.

### Етап 4 — Інтеграція з DocumentEditor
**Файли:**
- `app/document-editor.tsx` — оновити для підтримки native
- `components/editor/plate/PlateSceneEditor.native.tsx` — повний адаптер

**Що робити:**
1. Конвертер SceneRecord ↔ SceneDocument (використовуючи існуючі sceneRecordToPlateDocument як проміжний етап)
2. PlateSceneEditor.native.tsx приймає ті самі props що й shared версія
3. Всередині: SceneRecord → SceneDocument → NativeSceneEditor → onChange → SceneRecord
4. Збереження працює через існуючий onSave callback

**Критерій завершення:** Повний цикл редагування на native: відкрити → редагувати → зберегти.

### Етап 5 — Покращення
**Що робити:**
1. Валідація синтаксису (підсвітка помилок червоним)
2. Автодоповнення імен персонажів при введенні "Ім'я:"
3. Підсвітка синтаксису в TextInput (кольорові маркери для команд)
4. Режим перемикання [Текст] [Блоки] — показувати блоки замість тексту
5. Додати кнопку "Створити наступну сцену" (onCreateNextScene)

## Ключові принципи

1. **SceneRecord — джерело правди.** Всі конвертації через нього.
2. **НЕ залежати від Plate.** Жодного імпорту з platejs в native файлах.
3. **Спільна бібліотека.** scene-types, scene-parser, scene-serializer — спільні.
4. **MVP спочатку.** Текстовий редактор + preview. Block mode — пізніше.
5. **Тести.** Parser/serializer — 100% покриття. Native компоненти — через testing-library.

## Файли для видалення після рефакторингу

- `components/vn-plate-editor/PlateWebViewEditor.native.tsx` — заглушка, заміна на NativeSceneEditor
- `components/editor/plate/PlateSceneEditor.native.tsx` — переписати як адаптер

## Залежності

Нові залежності НЕ потрібні. Все на базі:
- React Native TextInput (вбудований)
- React Native View/Text/Pressable (вбудовані)
- expo-router (для навігації)
- Zustand (для state)
- Існуючі моделі (SceneRecord, TimelineStep, Character)
