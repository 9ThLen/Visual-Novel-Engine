# Visual Novel Engine Refresh

## What This Is

Кросплатформовий конструктор візуальних новел на базі Expo, React Native і Zustand, у якому автор може створювати історії, редагувати сцени, вибори, медіа та програвати результат у вбудованому reader. Поточний кодовий стан є brownfield-проєктом у переході між кількома редакторськими моделями, тому головна задача цього циклу не додавання нових можливостей, а стабілізація, рефакторинг і зведення системи до однієї узгодженої архітектури.

## Core Value

Автор має мати змогу надійно створювати, зберігати, відкривати і програвати сцени візуальної новели без втрати даних і без розриву між редактором та runtime.

## Requirements

### Validated

- ✓ Користувач може створювати та зберігати історії в локальному персистентному store — existing
- ✓ Користувач може відкривати історії та програвати їх через reader — existing
- ✓ Проєкт уже має Zustand-базований глобальний store і окремий editor store — existing
- ✓ Проєкт уже має новий event/timeline editor, але він ще не узгоджений з усім застосунком — existing
- ✓ Проєкт уже підтримує web/native storage abstraction і базову кросплатформну навігацію — existing

### Active

- [ ] Повторно прогнати manual smoke scenarios з `05-MANUAL-QA.md` в unrestricted Expo environment
- [ ] Прийняти або закрити зовнішній sandbox blocker перед milestone archive

### Out of Scope

- Нові великі продуктні фічі для авторів або гравців — спочатку треба стабілізувати базовий редакторський цикл
- Повний перепис застосунку з нуля — занадто ризиковано для brownfield-стану і призведе до нової втрати контексту
- Backend-first або cloud-first архітектура — поточний пріоритет локальна надійність editor/runtime
- Масштабний візуальний редизайн усіх екранів — UI cleanup робиться лише там, де це потрібно для стабілізації флоу

## Context

- Репозиторій пройшов через Phases 1-4 і зараз має canonical `SceneRecord + TimelineStep` path для editor, preview, runtime, save/load і StoryFlow.
- `SceneManager`, `StoryFlowScreen`, `SceneComposer`, reader initialization і runtime helpers вже вирівняні навколо shared store/helper layer.
- Phase 5 закрила legacy cleanup для steady-state production path і оновила docs/verification artifacts під фактичну canonical-first architecture.
- Фінальний automated quality gate зелений: focused regression suites пройшли, `pnpm check` чистий.
- Єдиний відкритий пункт після execution — rerun manual smoke в середовищі без sandbox-обмеження на Expo cache.
- Workspace rules вже визначають стратегічний напрямок: Zustand напряму, не React Context для app state; Lego як єдина блокова система; обережна робота з hydration, storage і web/native сумісністю.

## Constraints

- **Tech stack**: Expo 54, React 19, React Native 0.81, Zustand, NativeWind — потрібно працювати в межах наявного стеку, щоб не запускати нову міграцію під час стабілізації
- **Brownfield compatibility**: Потрібно зберегти працездатність існуючих історій і локальних даних — користувацький контент не можна ламати
- **Architecture**: Одне джерело правди для сцени — без цього будь-які локальні фікси створюватимуть нові регресії
- **Execution strategy**: Поетапний рефакторинг замість big-bang перепису — так менший ризик втратити робочий reader/editor цикл
- **Documentation drift**: Документи потрібно оновлювати після стабілізації кожної фази — інакше вони знову стануть історичним шумом
- **Testing**: Тести мають бути таргетовані на critical path, а не декоративні — реальна цінність у перевірці load/save/runtime flows

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `SceneRecord + TimelineStep` стає канонічною моделлю сцени | Саме ця модель вже лежить в основі нового editor і найкраще підходить для story flow, preview і runtime | ✓ Implemented in Phases 1-4 |
| Рефакторинг виконується по фазах, а не через перепис з нуля | Проєкт уже великий і має робочі частини, які не можна втратити | ✓ Implemented |
| Legacy шари спочатку ізолюються, а потім видаляються | Це знижує ризик regressions і дає можливість міряти покриття переходу | ✓ Phase 5 isolated the production path; residual compatibility remains explicit |
| Основний фокус цього циклу - data flow та reliability, а не нові фічі | Без стабільного editor/runtime циклу будь-які нові можливості лише збільшать хаос | ✓ Good |
| Документація і тести оновлюються наприкінці стабілізаційних фаз, а не перед ними | Документи мають описувати реальний стан, а не план, який ще не відбувся | ✓ Phase 5 verification pack and docs updated |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 after Phase 5 verification*
