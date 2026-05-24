# 05 Manual QA

## Scope

Цей файл фіксує ручні smoke-сценарії для stabilized canonical path після Phases 1-5.

## Scenario Matrix

### QA-01 Story creation

1. Відкрити Home
2. Перейти в `editor`
3. Створити нову історію
4. Переконатися, що відкрився `scene-editor` для persisted стартової сцени
5. Повернутися в editor list і перевірити, що story відображається коректно

Expected:
- історія створюється без legacy-only crash
- стартова сцена існує і відкривається одразу

### QA-02 Scene save and reopen

1. Відкрити існуючу сцену
2. Змінити назву і timeline
3. Зберегти сцену
4. Повністю закрити editor route
5. Відкрити ту саму сцену повторно

Expected:
- timeline, назва, metadata і connections не губляться

### QA-03 Preview and reader

1. В editor відкрити Preview
2. Переконатися, що preview показує persisted canonical data
3. Запустити Play / Reader
4. Пройти старт сцени і хоча б один transition

Expected:
- preview і reader показують той самий scene content
- reader стартує з correct start-scene metadata

### QA-04 Save / load / autosave

1. Запустити Reader
2. Просунутись по історії
3. Дочекатися autosave або виконати manual save
4. Повернутися в save-load screen
5. Завантажити слот

Expected:
- слот містить correct story title, scene preview і current scene
- load відновлює canonical runtime state

### QA-05 SceneManager CRUD

1. Відкрити `scene-manager`
2. Створити нову сцену
3. Зробити duplicate
4. Видалити не-стартову сцену
5. Видалити стартову сцену і перевірити reassignment

Expected:
- delete не лишає broken start-scene або orphaned connections
- edit/open завжди відкриває persisted scene

### QA-06 StoryFlow

1. Відкрити `story-flow`
2. Перетягнути сцену
3. Оновити start scene
4. Створити connection
5. Видалити specific connection
6. Перезавантажити route

Expected:
- `flowX/flowY` зберігаються
- start-scene sync узгоджений із runtime
- targeted connection removal не стирає sibling connections

## Session Record

- Manual smoke execution in this session: blocked before scenario execution
- Attempted launcher:
  - `pnpm dev:web`
  - Result: Expo web preview failed before app boot because the sandbox denied access to `C:\Users\sidle\.expo\native-modules-cache\*`
- Impact:
  - QA-01 through QA-06 remain queued for rerun in an unrestricted local environment
  - This is an environment blocker, not a confirmed regression in the app flows covered by the automated Phase 5 suites
- Follow-up:
  - Rerun `pnpm dev:web`
  - Execute QA-01 through QA-06 and append pass/fail notes under each scenario
