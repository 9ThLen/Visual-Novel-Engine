# Roadmap: Visual Novel Engine Refresh

**Created:** 2026-05-24
**Project:** Visual Novel Engine Refresh
**Roadmap Type:** Brownfield refactor and stabilization
**Total v1 Requirements:** 36
**Mapped Requirements:** 36
**Unmapped Requirements:** 0

## Roadmap Summary

Цей roadmap побудований як керований brownfield-рефакторинг без big-bang перепису. Кожна фаза спочатку зменшує архітектурний ризик, потім стабілізує критичний користувацький сценарій, і лише після цього прибирає legacy та оновлює документацію.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Canonical Scene Model | Визначити і впровадити одне джерело правди для сцени | ARCH-01, ARCH-02, DATA-01 | 4 |
| 2 | Editor Load/Save Stability | Зробити editor надійним для open-edit-save циклу | EDIT-01, EDIT-02, EDIT-03 | 4 |
| 3 | Runtime and Persistence Alignment | Узгодити persisted data, preview, reader і autosave | DATA-02, DATA-03, PLAY-01, PLAY-02, PLAY-03 | 5 |
| 4 | Story Flow and Scene Operations | Стабілізувати SceneManager, StoryFlow і scene-level operations | EDIT-04, DATA-04, FLOW-01, FLOW-02, FLOW-03, FLOW-04 | 5 |
| 5 | Legacy Cleanup and Quality Gate | Видалити або ізолювати legacy, оновити docs і закріпити critical path тестами | ARCH-03, ARCH-04, QUAL-01, QUAL-02, QUAL-03, QUAL-04 | 5 |
| 6 | Block Runtime Executor | Підключити всі 12 типів блоків у reader через block-by-block executor | BLOCK-01, BLOCK-02, BLOCK-03, BLOCK-04 | ✅ 4 |
| 7 | Editor UX Polish | Додати undo/redo, гарячі клавіші, confirmation діалоги, loading стани | POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05 | ✅ 5 |
| 8 | Accessibility & i18n | 1/3 | In Progress|  |
| 9 | Web Runtime Stabilization & UAT | Прибрати web runtime помилки, закрити web-only warnings і прогнати smoke/UAT по критичних сценаріях | QUAL-02, QUAL-03, QUAL-04 | 5 |

## Phase Details

### Phase 1: Canonical Scene Model
**Goal:** Визначити канонічну модель сцени та прибрати кореневий конфлікт між `StoryScene`, `SceneRecord` і паралельними store-потоками.

**Requirements:** ARCH-01, ARCH-02, DATA-01

**Why first:**
- Поки у проєкті є два джерела правди для сцени, локальні фікси editor-а і runtime тільки множать регресії.
- Ця фаза зменшує системний ризик перед змінами у UI та persistence flows.

**Success Criteria:**
1. Команда має письмово зафіксовану канонічну scene model і межі compatibility layer.
2. Store і selector flow читають канонічну модель сцени в місцях, де зараз є конфлікт джерел даних.
3. Дані сцени більше не дублюються безконтрольно між new editor path і legacy path.
4. Є чітке рішення, які legacy типи тимчасово адаптуються, а які підуть у cleanup later phase.

**Primary Files:**
- `stores/use-app-store.ts`
- `lib/story-hooks.ts`
- `lib/types.ts`
- `lib/engine/types.ts`

**Notes:**
- У цій фазі не треба одразу видаляти весь legacy-код; спочатку потрібне коректне джерело правди.

### Phase 2: Editor Load/Save Stability
**Goal:** Відновити надійний цикл `open -> edit -> save -> reopen` для сцени без reset, втрати timeline або перетирання metadata.

**Requirements:** EDIT-01, EDIT-02, EDIT-03

**Why second:**
- Після фіксації канонічної моделі можна безпечно ремонтувати editor lifecycle.
- Це найболючіший користувацький сценарій для конструктора новел.

**Success Criteria:**
1. Відкриття існуючої сцени завантажує persisted timeline і scene metadata, а не порожню заглушку.
2. Збереження сцени виконує merge з існуючим record замість перетирання `connections`, `flowX`, `flowY`, `createdAt` та інших полів.
3. Локальний editor state не скидається без причини під час навігації між scene routes.
4. Повторне відкриття щойно збереженої сцени відтворює той самий timeline і назву сцени.

**Primary Files:**
- `components/editor/SceneComposer.tsx`
- `stores/use-editor-store.ts`
- `app/scene-editor.tsx`

**Notes:**
- У цій фазі допускається короткочасний adapter layer між editor store і app store, якщо він зменшує ризик.

### Phase 3: Runtime and Persistence Alignment
**Goal:** Узгодити persisted storage, reader, preview, autosave і current story reconstruction навколо канонічної scene model.

**Requirements:** DATA-02, DATA-03, PLAY-01, PLAY-02, PLAY-03

**Why third:**
- Коли save/load цикл editor-а стабільний, потрібно вирівняти runtime, інакше користувач все ще редагуватиме одне, а програватиме інше.
- Саме тут завершується кореневий розрив між editor і reader.

**Success Criteria:**
1. Preview читає той самий scene data contract, який зберігає editor.
2. Reader може програвати сцену з канонічної моделі або через контрольований adapter без legacy-only гілки.
3. `useStoryState()` і пов'язані hooks реконструюють current story без жорсткої залежності лише від `scenesByStory`.
4. Autosave, manual save і scene save узгоджені між собою на рівні джерела даних.
5. Локальні користувацькі дані або мігруються автоматично, або читаються через backward-compatible path без ручного втручання.

**Primary Files:**
- `lib/story-hooks.ts`
- `app/reader.tsx`
- `hooks/useReaderInitialization.ts`
- `components/editor/PreviewScreen.tsx`
- `stores/use-app-store.ts`

**Notes:**
- Якщо виявиться складна міграція локальних даних, її треба виділити в контрольований migration path, а не латати точково.

### Phase 4: Story Flow and Scene Operations
**Goal:** Зробити SceneManager і StoryFlow узгодженими з канонічною scene model та стабілізувати scene-level CRUD і connections.

**Requirements:** EDIT-04, DATA-04, FLOW-01, FLOW-02, FLOW-03, FLOW-04

**Why fourth:**
- Після вирівнювання editor/runtime можна безпечно завершити graph layer, не боячись що він знову зламає data flow.
- Ця фаза закриває операційний хаос навколо scene management.

**Success Criteria:**
1. SceneManager відкриває persisted scene records і не працює напряму через небезпечні `setState` мутації.
2. StoryFlow показує актуальні records і connections після reload та міжекранної навігації.
3. Позиції сцен і зміни стартової сцени зберігаються та відновлюються консистентно.
4. Додавання, оновлення і видалення connections проходить через узгоджені store actions з cleanup побічних ефектів.
5. Видалення сцени не залишає orphaned links, stale metadata або биті graph refs.

**Primary Files:**
- `components/editor/SceneManager.tsx`
- `components/editor/StoryFlowScreen.tsx`
- `components/editor/SceneSelector.tsx`
- `stores/use-app-store.ts`

**Notes:**
- У цій фазі можна доробити connect flow тільки після того, як underlying model вже стабільна.

### Phase 5: Legacy Cleanup and Quality Gate
**Goal:** Прибрати або ізолювати legacy layers, закріпити стабільність через тести і привести документацію до реального стану системи.

**Requirements:** ARCH-03, ARCH-04, QUAL-01, QUAL-02, QUAL-03, QUAL-04

**Why fifth:**
- Cleanup має сенс тільки після стабілізації основних потоків; інакше є ризик видалити код, який ще приховано тримає частину поведінки.
- Це фінальна фаза, яка переводить проєкт із "крихкий brownfield" у керовану базу для подальших змін.

**Success Criteria:**
1. Legacy flows, які більше не входять у production path, або видалені, або чітко марковані як isolated compatibility layer.
2. Critical path покритий таргетованими тестами на open/edit/save/reopen/play flows.
3. README, `.planning` документи й архітектурні описи не суперечать реальному коду.
4. Для кожної попередньої фази є зафіксований ручний сценарій перевірки, який проходить без регресій.
5. Команда має чистий baseline для наступних feature phases без повернення до паралельних editor моделей.

**Primary Files:**
- `components/editors/**`
- `components/lego-editor/**`
- `hooks/useSceneEditorActions.ts`
- `README.md`
- `wiki/architecture-reference.md`
- `__tests__/**`

**Notes:**
- Видалення legacy має йти тільки після підтвердження, що canonical path закриває потрібну поведінку.

### Phase 6: Block Runtime Executor ✅
**Goal:** Підключити всі 12 типів блоків у reader через block-by-block executor замість lossy `sceneRecordToStoryScene`.

**Requirements:** BLOCK-01, BLOCK-02, BLOCK-03, BLOCK-04

**Result:** Виконано (3/3 плани). Block-by-block executor працює в reader і PreviewScreen.

**Success Criteria — Status:**
1. ✅ `useSceneExecutor` hook виконує всі 12 типів блоків (6 halt+, 6 auto-exec)
2. ✅ Reader показує Background, Character, Text/Dialogue, Choice, Variable, Music, Transition, Effect
3. ✅ SceneState.variables доступні всьому executor; conditions перевіряються по variables
4. ✅ PreviewScreen використовує той самий `useSceneExecutor` без дублювання логіки

**Primary Files:**
- `lib/engine/useSceneExecutor.ts`
- `lib/engine/conditionUtils.ts`
- `components/story-reader-responsive.tsx`
- `components/editor/PreviewScreen.tsx`
- `hooks/useReaderInitialization.ts`
- `app/reader.tsx`

**Notes:**
- `sound`, `camera`, `interactive_object` — no-op (deferred)
- `sceneRecordToStoryScene` marked `@deprecated`

### Phase 7: Editor UX Polish ✅
**Goal:** Покращити editor UX через undo/redo, гарячі клавіші, confirmation діалоги, loading стани та ErrorBoundary.

**Requirements:** POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05

**Result:** Виконано (2 плани, 7 tasks). Undo/redo + keyboard shortcuts + confirm dialog + loading + ErrorBoundary fully integrated.

**Success Criteria — Status:**
1. ✅ Undo/redo кнопки присутні в SceneComposer toolbar (phone bottom bar + desktop header)
2. ✅ Keyboard shortcuts працюють на web (Ctrl+Z/Y/D/S, Delete, Backspace, Ctrl+Shift+Z, Ctrl+P, Escape, Ctrl+A)
3. ✅ Delete confirmation діалог з'являється перед видаленням блоків
4. ✅ Loading стани (isSaving + indicator) показуються під час збереження сцен
5. ✅ ErrorBoundary обгортає SceneComposer в `app/scene-editor.tsx`

**Primary Files:**
- `components/editor/SceneComposer.tsx`
- `components/editor/BlockLibraryPanel.tsx`
- `hooks/use-keyboard-shortcuts.ts`
- `components/ui/ConfirmDialog.tsx`
- `components/ErrorBoundary.tsx`

**Notes:**
- Undo/redo store infrastructure вже готова (спайк 002 підтвердив).
- Keyboard shortcuts hook готовий за адресою `hooks/use-keyboard-shortcuts.ts` (existing, with `useEditorShortcuts` + `useKeyboardShortcuts`).
- `BlockEditor.tsx` не існує в codebase — замість нього використовується BlockLibraryPanel.

**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md — Infrastructure: ConfirmDialog, isSaving store, ErrorBoundary wrapping
- [x] 07-02-PLAN.md — SceneComposer integration: undo/redo buttons, keyboard shortcuts, confirm wiring, saving indicator

### Phase 8: Accessibility & i18n
**Goal:** Додати accessibility labels, виправити кольорову систему (oklch fallback, контраст), створити i18n інфраструктуру.

**Requirements:** A11Y-01, A11Y-02, A11Y-03, A11Y-04

**Why eighth:**
- UI Audit виявив: жодних accessibility labels, 10+ hardcoded `#fff`/`#000` без токенів, emoji-only buttons недоступні.
- Це фінальний шар якості перед додаванням нових product features.

**Success Criteria:**
1. Всі інтерактивні елементи мають `accessibilityLabel` та `accessibilityRole`.
2. Кольорова система використовує токени RuntimePalette замість hardcoded hex; oklch fallback працює в старих браузерах.
3. i18n ключі визначені для основних UI текстів (editor toolbar, block labels, confirmation messages).
4. Мінімальний contrast ratio 4.5:1 для тексту дотримано.

**Plans:** 3/3 plans executed

Plans:
- [x] 08-01-PLAN.md — Infrastructure: text-inverse alias fix, i18n keys, ErrorBoundary cleanup
- [x] 08-02-PLAN.md — Editor & UI: a11y labels + color tokenization for 15 editor/UI components
- [x] 08-03-PLAN.md — Reader & App: color tokenization + Lego minimal fixes + contrast audit

**Primary Files:**
- `components/**/*.tsx`
- `lib/engine/types.ts` (RuntimePalette)
- `lib/i18n/keys.ts`
- `lib/i18n/uk.ts`
- `lib/i18n/en.ts`

**Notes:**
- Виправлення контрасту має найвищий пріоритет серед a11y задач.
- i18n — це тільки інфраструктура в цій фазі; фактичний переклад не обов'язковий.

### Phase 9: Web Runtime Stabilization & UAT
**Goal:** Прибрати залишкові web runtime помилки, ізолювати web-only попередження та закрити ручний smoke/UAT для основних сценаріїв після останніх стабілізаційних змін.

**Requirements:** QUAL-02, QUAL-03, QUAL-04

**Why ninth:**
- Після завершення основних продуктних фаз застосунок уже рендериться на web, але консоль усе ще містить реальні runtime-помилки, які маскують нові регресії.
- Потрібна окрема стабілізаційна фаза, щоб не змішувати web bootstrap fixes із Phase 8 theme/i18n cleanup.
- Без чистого web smoke неможливо якісно закрити UAT для `tabs`, `settings`, `reader`, `editor`, `preview` і `save/load`.

**Success Criteria:**
1. Помилка `[getThemeColors] TypeError: Cannot destructure property 'exportedColors' of 'undefined' as it is undefined` більше не відтворюється на свіжому web launch.
2. Відомі web-only попередження або усунені, або зведені до документованого мінімуму без блокування smoke-сценаріїв.
3. Критичні web-маршрути `tabs`, `settings`, `reader`, `editor`, `preview`, `save/load` проходять ручний smoke без нових runtime blockers.
4. Для кожного знайденого дефекту є або кодовий фікс із regression coverage, або явно задокументоване відкладення з причиною.
5. Verification pack містить актуальні команди, console findings і фінальний UAT status.

**Primary Files:**
- `app/_layout.tsx`
- `lib/theme-provider.tsx`
- `stores/theme-store.ts`
- `lib/theme-nativewind.ts`
- `lib/_core/theme.ts`
- `components/ui/Button.tsx`
- `components/dialogue-history.tsx`
- `components/story-reader-responsive.tsx`
- `app/settings.tsx`
- `app/reader.tsx`
- `app/save-load.tsx`

**Notes:**
- Будь-який web-only fix має мінімізувати ризик регресії на native.
- Перед змінами в runtime/bootstrap бажано мати вузький regression test або точну reproduction note.
- Якщо browser smoke блокується sandbox/tooling-обмеженням, Phase 9 можна закривати через code-level verification + локальний handoff checklist замість in-agent web UAT.

## Execution Rules

1. Не змішувати refactor-фікси між фазами, якщо вони не є блокером поточної фази.
2. Після кожної фази мати один ручний сценарій перевірки, який проходить end-to-end.
3. Не видаляти legacy-код, поки немає підтвердження, що новий path already covers the behavior.
4. Документацію оновлювати тільки після фактичної стабілізації відповідної частини системи.
5. Нові product features не додавати, поки не завершені Phases 1-4.

## Risk Register

| Risk | Impact | Mitigation Phase |
|------|--------|------------------|
| Подвійне джерело правди для сцени | Дані editor і runtime розходяться | Phase 1 |
| Некоректне save/load сцени | Втрата timeline і metadata | Phase 2 |
| Runtime читає legacy path | Користувач програє не те, що редагував | Phase 3 |
| Graph operations лишають биті connections | Нестабільний story flow | Phase 4 |
| Cleanup видалить ще потрібний код | Регресії у production flow | Phase 5 |

---
*Roadmap created: 2026-05-24*
*Last updated: 2026-05-26 — Phase 9 closeout + Phase 8 plans: 3 plans (text-inverse fix, editor/UI a11y+colors, reader/app colors+contrast)*
