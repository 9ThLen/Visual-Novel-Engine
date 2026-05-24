# Requirements: Visual Novel Engine Refresh

**Defined:** 2026-05-24
**Core Value:** Автор має мати змогу надійно створювати, зберігати, відкривати і програвати сцени візуальної новели без втрати даних і без розриву між редактором та runtime.

## v1 Requirements

Requirements for the current stabilization and refactoring release. Each requirement maps to exactly one roadmap phase.

### Architecture Unification

- [x] **ARCH-01**: Система використовує одну канонічну модель сцени для editor, preview, story flow і runtime
- [x] **ARCH-02**: Дані сцени не дублюються між несумісними store-моделями без контрольованого adapter layer
- [x] **ARCH-03**: Legacy editor and Lego flows більше не керують основним scene editing lifecycle
- [x] **ARCH-04**: Документація архітектури описує фактичний scene data flow і актуальні джерела правди

### Editor Reliability

- [x] **EDIT-01**: Користувач може відкрити існуючу сцену в editor без втрати її timeline
- [x] **EDIT-02**: Користувач може редагувати назву сцени, timeline та block properties без неочікуваного reset стану
- [x] **EDIT-03**: Користувач може зберегти сцену без перетирання її metadata, graph position і connections
- [x] **EDIT-04**: SceneManager відкриває для редагування саме persisted scene, а не тимчасову або legacy-проєкцію

### Persistence and Migration

- [x] **DATA-01**: Persisted app state зберігає сцену в узгодженому форматі, який підтримує editor і runtime
- [x] **DATA-02**: Існуючі локальні історії можуть бути прочитані або мігровані без ручного відновлення користувачем
- [x] **DATA-03**: Autosave, manual save і scene save працюють на одній моделі даних
- [x] **DATA-04**: Видалення або оновлення сцени не залишає битих connections, stale metadata або orphaned records

### Runtime Alignment

- [x] **PLAY-01**: Preview показує ту саму структуру сцени, яку зберігає editor
- [x] **PLAY-02**: Reader може відтворювати сцени з канонічної моделі без окремого legacy-only потоку
- [x] **PLAY-03**: Story loading і current story reconstruction не залежать від застарілої моделі, якщо сцена вже існує в новому форматі

### Story Flow and Scene Operations

- [x] **FLOW-01**: StoryFlow читає і відображає актуальні scene records та їх connections
- [x] **FLOW-02**: Користувач може змінювати позицію сцени в StoryFlow без втрати position state після reload
- [x] **FLOW-03**: Користувач може додавати, видаляти і оновлювати connections через узгоджені store actions
- [x] **FLOW-04**: Позначення стартової сцени синхронізоване між StoryFlow, metadata і runtime

### Quality and Maintainability

- [x] **QUAL-01**: Critical path має таргетовані тести для load/save/reopen/play flows
- [x] **QUAL-02**: Legacy код, що більше не використовується у production flow, видалений або чітко ізольований
- [x] **QUAL-03**: README і planning-документи не суперечать поточній архітектурі
- [ ] **QUAL-04**: Кожна фаза завершується ручною перевіркою ключового користувацького сценарію, який вона стабілізує (`05-MANUAL-QA.md` prepared; rerun still blocked externally in this sandbox)

## v2 Requirements

Deferred until the stabilization release is complete.

### Product Expansion

- **PROD-01**: Користувач може працювати з новими редакторськими можливостями поверх уже стабільної scene model
- **PROD-02**: Користувач може користуватися покращеним drag-and-drop або розширеним graph UX без впливу на reliability
- **PROD-03**: Користувач може отримати нові differentiating features editor-а тільки після завершення cleanup legacy layer

### Advanced Platform Work

- **PLAT-01**: Проєкт має глибшу migration story для майбутніх форматів імпорту/експорту
- **PLAT-02**: Проєкт має розширене performance profiling для великих сторі та timeline

## Out of Scope

| Feature | Reason |
|---------|--------|
| Повний перепис застосунку з нуля | Надто високий ризик для brownfield-стану, втрачає існуючі робочі частини |
| Нові великі користувацькі фічі editor-а до стабілізації базового циклу | Збільшують поверхню регресій до завершення архітектурного cleanup |
| Backend/cloud sync або multi-user collaboration | Не є критичними для поточного refactor-first milestone |
| Масштабний UI redesign усіх екранів | Не вирішує кореневу проблему розсинхрону data flow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Completed |
| ARCH-02 | Phase 1 | Completed |
| ARCH-03 | Phase 5 | Completed |
| ARCH-04 | Phase 5 | Completed |
| EDIT-01 | Phase 2 | Completed |
| EDIT-02 | Phase 2 | Completed |
| EDIT-03 | Phase 2 | Completed |
| EDIT-04 | Phase 4 | Completed |
| DATA-01 | Phase 1 | Completed |
| DATA-02 | Phase 3 | Completed |
| DATA-03 | Phase 3 | Completed |
| DATA-04 | Phase 4 | Completed |
| PLAY-01 | Phase 3 | Completed |
| PLAY-02 | Phase 3 | Completed |
| PLAY-03 | Phase 3 | Completed |
| FLOW-01 | Phase 4 | Completed |
| FLOW-02 | Phase 4 | Completed |
| FLOW-03 | Phase 4 | Completed |
| FLOW-04 | Phase 4 | Completed |
| QUAL-01 | Phase 5 | Completed |
| QUAL-02 | Phase 5 | Completed |
| QUAL-03 | Phase 5 | Completed |
| QUAL-04 | Phase 5 | Blocked (manual QA environment) |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-05-24*
*Last updated: 2026-05-24 after Phase 5 verification*
