# UX/UI Аудит — Visual Novel Engine (2026-06-01)

## Огляд

Повний аналіз UX/UI та логіки Visual Novel Engine на основі коду, без запуску додатку.
Систематична перевірка: навігація → компоненти → логіка → дизайн-система → accessibility.

---

## 1. Навігація та маршрутизація

### Статус: ✅ Правильно

- **Expo Router** з file-based routing — чиста архітектура
- `_layout.tsx` → `tabs` → `index` (home), `editor`, `reader`, `settings`, `save-load` — логічна ієрархія
- `scene-editor.tsx` коректно редиректить на `document-editor` — міграційний шлях працює
- Deep linking через `useLocalSearchParams` — `storyId`, `sceneId` парсяться правильно з урахуванням масивів (`Array.isArray` перевірка в `reader.tsx:24`)

### Запитання / Рекомендації

| # | Тип | Опис | Пріоритет |
|---|-----|------|-----------|
| N1 | 💡 | **«Play» кнопка на editor веде на `/play` (PlayMode), а «Play» кнопка на home — на `/reader`.** Два різні реадери з різним UX. PlayMode — це простий посценний прогрес без історії/меню. Для фінального юзера краще один універсальний reader з параметром `mode=quick\|full`. | Medium |
| N2 | 💡 | **WebSidebar та WebTopBar** існують у коді, але не підключені до жодного layout/screen. Виглядає як незавершена feature. Або підключити, або видалити. | Low |

---

## 2. StoryReaderResponsive — 607 LOC

### Статус: ⚠️ Потребує декомпозиції

Це **найбільший компонент** у проекті. Має:
- `15+ useState/useEffect/useCallback` хуків
- Typewriter, auto-play, turbo skip, history, choices, splash screen, image loading — все в одному файлі
- God Component anti-pattern (bug-pattern C27, C28)

### Знайдені проблеми

| # | Категоря | Опис | Рішення |
|---|----------|------|---------|
| R1 | 🔴 Bug | **`_isLastPage = hasChoices`** (рядок 241) — назка змінна, яка означає "остання сторінка", але true коли є choices. Логіка інвертована: коли choices — то це НЕ "остання сторінка" для авто-плей, а "потрібен вибір". Імінна завжди true коли є choices, що зупиняє авто-плей — це ПРАВИЛЬНО поведінка, але назва вводить в оманку. | Перейменувати на `needsUserInput` або `awaitingChoice` |
| R2 | 🔴 Bug | **CharacterDisplay створює `new RNAnimated.Value()` при кожному render** (рядок 377-388). Анімації створені в рендер-функції і ніколи не очищаються. При кожному ре-рендері scene створюються нові Animated.Value об'єкти замість використання наявних з `sceneState.characters`. | Використовувати анімаційні значення безпосередньо з `charState` або створювати в `useMemo` з ключем по `charId` |
| R3 | 🔴 Bug | **`dialogueTop` prop визначений в CharacterDisplay Props але ігнорується** (рядок 12-12). `dialogueTop` передається, але параметр `dialogueTop` деструктуризація не включає його. | Либо видалити props, або реалізувати позиціонування відносно dialogue box |
| R4 | 🟡 UX | **Menu button завжди фіксований** в лівому верхньому куті (top: 48, left: 16). На малих екранах/телефонах може перекриванти контент. Немає можливості налаштувати позицію. | Додати fade-out коли неактивний, або зробити менш інтрузивним |
| R5 | 🟡 UX | **Auto-play зупиняється на choices** — правильно. Але коли вибір зроблено, auto-play **не відновлюється**. Користувач маї натискати tap для кожного наступного кроку. | Додати `if (autoPlayActive && !hasChoices && !isTyping) autoAdvance()` після вибору |
| R6 | 🟡 UX | **Turbo skip** працює через `setInterval(180ms)` — дуже агресивний. При виборі 10 рядків тексту вспливає 1.8 с. Не відчувається як "fast forward" а як "миттєво скіпнути". | Додати плавний перехід або збільшити інтервал до 300-400ms |
| R7 | 🟡 UX | **"Tap to continue"** відображається тільки коли `!isTyping && !_isLastPage` — але при choices не показує ніякої підказки що треба вибрати. | Додати fallback: `{hasChoices && <Text>{t('reader.chooseOption')}</Text>}` |
| R8 | 🟡 UX | **Cursor █** показується після тексту під час typewriter — зсунутий вправо як inline елемент. Деякі VN роблять його внизу або як окремий елемент. | Розглянути окремо позиціонований cursor indicator |

### Рекомендована декомпозиція

```
StoryReaderResponsive (оркестратор, ~150 LOC)
├── ReaderDisplay (bg image + characters)
├── ReaderControls (auto-play, history, skip buttons)
├── ReaderDialogue (speaker + text + typewriter)
├── ReaderChoices (choice list)
├── ReaderTransitions (fade/slide animations)
└── ReaderHistory (dialogue history — вже винесений)
```

---

## 3. DocumentSceneEditor — 1394 LOC

### Статус: 🔴 Критично потребує декомпозиції

Це **найбільший компонент** в проекті. Це God Component, який керує:
- Редагування тексту (TextInput)
- Навігація між сторінками/сценами
- Додавання нових сцен
- Збереження через конвертацію документ → timeline
- Пошук команд (/)
- Модальні вікна (characters, assets, etc.)

### Знайдені проблеми

| # | Категорія | Опис | Рішення |
|---|----------|------|---------|
| D1 | 🔴 Bug (C33) | **`followWriting()` викликається при кожній зміні `lineDrafts`** (рядок 837) — при кожному натисканні клавіші редактор скролить до кінця. Візуально текст "стрибає" при кожному рядку. | Реалізувати `smartFollow(cursorY)` — скролити тільки коли cursor виходить за viewport. Відстежувати позицію курсору через `onSelectionChange` |
| D2 | 🔴 Bug (C33) | **`followWriting()` також викликається в `onFocus`** (рядок ~981, 1036) — кожен клік на editor скролить до низу | Прибрати `followWriting()` з усіх `onFocus` handlers |
| D3 | 🟡 UX | **Параграфи при збереженні** — порожні рядки (`\n`) між блоками при конвертації в HTML-подібний формат. При 3+ параграфах виникає надмірний простір | Перевірити logic `parseDraftLineToDocumentBlock` для empty lines |
| D4 | 🟢 Feature | **Курсор кінця документа** — Google Docs показує курсор внизу документа з мінімальним paddingBottom: 120px, а не фіксований minHeight. Документ має виглядати як "безкінечний аркуш" | Видалити `minHeight` обмеження, додати `paddingBottom: 120` |
| D5 | 🟢 Feature | **Роздільник між сторінками** — замість `marginBottom: 24` використовувати 1px divider line | Замінити gap на divider |

---

## 4. Editor Screen (app/editor.tsx)

### Статус: ✅ Добре структурований

Чистий screen з story list, create/delete, навігація — 339 LOC прийнятно.

### Знайдені проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| E1 | 🟡 UX | **На великому екрані (web) — story grid** може показувати 2 колонки, але без сортування за датою/назвою. Немає пошуку. При 10+ історіях навігація ускладнюється. | Medium |
| E2 | 🟡 UX | **Create story form** з'являється inline, але немає UX для "Esc щоб скасувати" на web. На mobile — back button, на web — треба явно натиснути cancel. | Medium |
| E3 | 💡 Feature | **Empty state** з'являється ТІЛЬКИ коли 0 stories, але якщо всі stories видалені поки юзер на цій сторінці — немає loading/refresh. | Low |

---

## 5. Settings (app/settings.tsx)

### Статус: ✅ Чистий та добре структурований (222 LOC)

### Проблеми

| # | Категорія | Опис | Пріоритет |
|---|----------|------|-----------|
| S1 | 🔴 Bug | **`useFocusEffect` імпортується з `@react-navigation/native` замість `expo-router`** — може працює як re-export, але є непослідовність з рештою коду | Low (якщо працює) |
| S2 | 🟡 UX | **LanguageSelector** — зміна мови потребує повного ре-рендеру всіх компонентів з i18n. Перевірити чи зміна миттєва для всіх відкритих screen | Medium |
| S3 | 🟡 UX | **Reset to defaults** — немає кнопки "Скинути налаштування за замовчуванням" | Low |
| S4 | 🟡 UX | **Section emoji** (🌐🔊✏️▶️ℹ️) — виглядає по-дитячому для професійного інструменту. Розглянути видалення або заміну на професійні текстові лейбли | Low |

---

## 6. Save/Load Screen (app/save-load.tsx)

### Статус: ✅ Функціональний (366 LOC)

### Проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| SL1 | 🔴 Bug | **`useFocusEffect` з `@react-navigation/native`** — та сама проблема що в Settings. Також подвійний `stopReaderPlayback()` — один в cleanup. Нешкідливо але зайвий | Low |
| SL2 | 🟡 UX | **Автосейв показується ТІЛЬКИ в load tab** — якщо ви на save tab, автосейв не видно. Має бути видно з обох tabs або мати окрему секцію | Medium |
| SL3 | 🟡 UX | **Порожні слоти** — "Save 1", "Save 2" замість "Empty Slot 1". Незрозуміло що це порожній слот чи назва | Low |
| SL4 | 💡 Feature | **10 слотів** — немає прокрутки чи infinite scroll — FlatList працює, але при 10+ слотах не видно всіх одразу на маленькому екрані | Low |

---

## 7. SceneExecutor (lib/engine/useSceneExecutor.ts)

### Статус: ✅ Архітектурно чистий (329 LOC)

### Проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| SE1 | 🔴 Bug | **3 no-op block types** (`sound`, `camera`, `interactive_object`) — мають тільки `break;` (C24). Користувач може додати їх в UI вони просто не роблять нічого без помилки. | High |
| SE2 | 🟡 Logic | **`selectChoice`** встановлює `isTransitioning: true, transitionTarget: selected.targetSceneId` — але після цього executor не переходить до наступної сцени автоматично. Executor зупиняється. Для коректного scene flow потрібно щоб reader викликав `navigateToScene` | Medium (design choice) |
| SE3 | 🟡 Logic | **`_last_choice`** — hidden variable для tracking. Добре що працює, але немає document про це | Low |
| SE4 | 💡 Feature | **Error recovery:** `catch (err)` в `executeStep` (рядок 203) — логує помилку і продовжує з поточним станом. Добре що не крашить, але користувач не дізнається про помилку | Low |

---

## 8. PlayMode (components/editor/PlayMode.tsx)

### Статус: ✅ Правильна структура (180 LOC)

### Проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| P1 | 🟡 UX | **Title на "The End" екрані** дублюється з основним reader — `metadata?.title \|\| 'Story'`. Завжди показує назву. Добре, але текст "The End" може бути більш церемоніальним (center aligned, large font, maybe fade in animation) | Low |
| P2 | 🟡 UX | **No mid-story restart** — немає "Restart from beginning" кнопки під час програвання, тільки "Back" | Low |
| P3 | 🟡 UX | **Зайвий стан null** — якщо `playState === 'finished'` або `!currentScene` відображається "The End" через `\|\|`, но це два різні джерела. Краще явно: `{!currentScene ? "Scene not finished" : "The End"}` | Low |

---

## 9. CharacterDisplay

### Статус: ⚠️ Є проблеми

| # | Категорія | Опис | Пріоритет |
|---|----------|------|-----------|
| CD1 | 🔴 Bug | **Fallback image — 1px transparent PNG** в base64 inline (рядок 31) — зайва вага bundle (~200 bytes). Краще використовати `undefine/null` і не рендерити Image без source | Low |
| CD2 | 🔴 Bug | **`dialogueTop` prop ігнорується** (R3 вище) — визначений в Props але не деструктуризований | Medium |

---

## 10. ReaderMenu

### Статус: ✅ Добре (114 LOC)

### Проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| RM1 | 🟡 UX | **Fixed position меню** (top: 50%, left: 50%, width: 320) — не responsive. На малих екранах меню може виходити за межі | Medium |
| RM2 | 🟢 Feature | **Меню нає пункт "Resume" або "Continue"** — зараз тільки Save/Load, Settings, Home, Close | Low |
| RM3 | 💡 | **`buttonFeedback()` при кожному menu item** — на mobile це гарно (haptic), на web — може бути redundant | Low |

---

## 11. InteractiveObjectsLayer

### Статус: ⚠️ Accessibility проблеми

| # | Категоря | Опис | Пріоритет |
|---|----------|------|-----------|
| IO1 | 🔴 A11y | **Немає accessibilityLabel на interactive objects** — screen readers не можуть описати що це за об'єкт | High |
| IO2 | 🟡 UX | **Glow/pulse анімації** використовують `Animated.loop` — на повільних пристроях може бути laggy. Додати `Platform.select` або low-performance mode | Medium |
| IO3 | 🟡 UX | **`oneTimeOne` об'єкти зникають** назавжди (рядок 165-167) — гарно для gameplay, але немає undo/reset механізму | Medium |

---

## 12. Дизайн-система та Accessibility

### 12.1 Теми

| Аспект | Статус | Проблема |
|--------|--------|----------|
| OKLCH colors | ✅ | Правильно — перцептуально рівномірна система |
| Dark/Light | ✅ | Працює через `useThemeStore` + `useColors()` |
| Theme persistence | ✅ | Zustand persist middleware |
| Fallback colors | ⚠️ | 45 місць використовують `colors['text-inverse'] ?? '#ffffff'` — fallback на хардкоджений білий. У dark mode `#ffffff` на oklch(16% темного) фоні ок, але в light mode `#ffffff` на oklch(96% світлому) фоні — білий на білому = невидимий текст! |

### 🔴 КРИТИЧНА ПРОБЛЕМА: `text-inverse` fallback

**Проблема:** 45 місць в коді роблять:
```tsx
color: colors['text-inverse'] ?? '#ffffff'
```

Якщо `text-inverse` не зіставиться (undefined), fallback `#ffffff` (білий) на **light theme** фоні (`foreground-on-primary` = `oklch(98%)` майже білий) = **невидимий текст**.

Хоча `text-inverse` визначений в RuntimePalette, fallback все одно небезпечний.

**Виправлення:** Замінить `?? '#ffffff'` на `?? colors.foreground` або явно задати `text-inverse` для кожної теми.

### 12.2 Хардкоджені кольори

| Файл | Рядок | Колір | Проблема |
|------|-------|-------|----------|
| `story-reader-responsive.tsx:552` | `?? '#ffffff'` | Fallback на білий | Невидимий на light |
| `story-reader-responsive.tsx:604` | `?? '#fff'` | Теж fallback | Невидимий на light |
| `story-reader-responsive.tsx:449` | `?? 'rgba(15, 14, 23, 0.92)'` | Темний dialogueBg fallback | OK для dark, завто для light |
| `story-reader-responsive.tsx:498` | `?? 'rgba(124,58,237,0.12)'` | Фіолетовий choiceBg | Не темований |
| `story-reader-responsive.tsx:596` | `'rgba(0,0,0,0.45)'` | ControlButton bg | Не темований |
| `story-reader-responsive.tsx:598` | `'rgba(255,255,255,0.18)'` | ControlButton border | Не темований |
| `ReaderMenu.tsx:86` | `'rgba(0, 0, 0, 0.6)'` | Overlay | Не є `colors.backdrop` хоча має бути |

### 12.3 Accessibility

| Аспект | Статус | Опис |
|--------|--------|------|
| `accessibilityLabel` | ✅ | Присутній на всіх основних кнопках (editor, reader controls, menu) |
| `accessibilityRole` | ✅ | Правильно виставлений (button, switch) |
| `accessibilityState` | ✅ | Для Button (disabled, busy), для ToggleRow (selected) |
| `accessibilityHint` | ⚠️ | Тільки в 2-3 місцях. Додаткові hints покращать screen reader UX |
| Interactive Objects | 🔴 | Нжодного `accessibilityLabel` для клікабельних об'єктів |
| Focus management | ⚠️ | Не перевірено — при навігації клавіатурою на web фокус може загубитися |
| Color contrast | ⚠️ | `foreground-on-primary` на `primary` фоні — потрібно перевірити WCAG контраст (should be 4.5:1 minimum) |
| Touch targets | ✅ | `min-h-[80]` в dialogue box, button sizes 36-52px — достатньо для пальців |

---

## 13. Знімки екрана для аналізу (рекомендації)

Для більш глибокого UX аналізу потрібно:

1. Запустити `npx expo start` і зробити скріншоти кожного екрану
2. Перевірити responsive breakpoints (320px, 375px, 768px, 1024px)
3. Перевірити keyboard navigation на web
4. Перевірити VoiceOver/TalkBack на native

---

## 14. Зведена таблиця рекомендацій

| Пріоритет | Кількість | Приклади |
|-----------|-----------|----------|
| 🔴 Критично | 5 | text-inverse fallback, CharacterDisplay Animated leak, no-op blocks, anti-pattern scroll, a11y for interactive objects |
| 🟡 Важливо | 12 | Неакуратні цвета, minHeight сторінки, auto-play not resuming, turbo speed |
| 💡 Feature | 8 | Reset settings, sorting, voice controls, performance mode |
| �гussels Low | 10 | Emoji removal, WebSidebar connection, cursor blink style |

---

## 15. ТОП-10 Рекомендацій (по пріоритету)

1. **Виправити text-inverse fallback** — замінити `?? '#ffffff'` на `?? colors.foreground` (або навіть прибрати fallback оскільки `text-inverse` є в palette)
2. **Виправити CharacterDisplay Animated.Value leak** — не створювати `new Animated.Value()` в render, замінити на `useMemo` або прибрати (анімації створені але не використовуються)
3. **`dialogueTop` prop — реалізувати або видалити** — зараз мертвий код який створює хибне враження про функціональність
4. **Декомпозувати StoryReaderResponsive** — 607 LOC → 5-6 компонентів по 80-120 LOC
5. **Декомпозувати DocumentSceneEditor** — 1394 LOC → DocumentPage, DocumentToolbar, DocumentCommands, DocumentSidebar
6. **Виправити followWriting anti-pattern** — реалізувати smart scroll або видалити
7. **Додати accessibilityLabel для interactive objects** — `{t('reader.interactiveObject')}: ${object.name || object.id}`
8. **Замінити хардкоджені rgba/hex кольори на темовані токени** — 7 місць в story-reader-responsive + ReaderMenu
9. **Визначити долю no-op блоків** (`sound`, `camera`, `interactive_object`) — або реалізувати, або прибрати з UI, або дати feedback "not yet implemented"
10. **Уніфікувати reader flow** — PlayMode або Reader? Вибрати один primary reader

---

## Пов'язані сторінки

[[code-analysis-report-2026-05-31|Останній аудит коду]]
[[bug-patterns-vne|Баг-паттерни VNE]]
[[security-patterns-vne|Сек'юріті паттерни]]
[[architecture-reference|Архітектурна довідка]]
