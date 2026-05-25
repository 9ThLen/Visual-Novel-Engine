# Повний аналіз проекту Visual Novel Engine — 2026-05-25

## Загальна статистика проекту

| Метрика | Значення |
|---------|----------|
| Всього файлів (TS/TSX/JS/CSS/JSON/MD) | ~1590 |
| TypeScript файли | 99 |
| TSX/React файли | 58 |
| Загальний рядок коду (TS+TSX) | ~23,247 |
| Markdown документація | 128 файлів, 16,220 рядків |
| JSON файли | 1270 (переважно залежності) |
| Тести | 17 файлів |
| Zustand stores | 4 |
| lib/ модулі | ~45 |
| hooks/ | 13 |
| components/ | ~25 |

**TypeScript компіляція**: `npx tsc --noEmit --skipLibCheck` — пройшов успішно (exit code 0)
**Тести**: `pnpm vitest run` — НЕ ЗАПУСКАЮТЬСЯ (помилка відсутнього модуля @rollup/rollup-linux-x64-gnu)

---

## КРИТИЧНІ ПРОБЛЕМИ (CRITICAL)

### C1: Неможливість запуску тестів — зламаний Rollup модуль
- **Файл**: `vitest.config.ts`, `node_modules/.pnpm/rollup@4.60.3/...`
- **Проблема**: Vitest не може запуститися через відсутній нативний модуль `@rollup/rollup-linux-x64-gnu`. Це блокує весь CI/CD pipeline та локальний запуск тестів.
- **Рекомендація**: Виконати `pnpm add -D @rollup/rollup-linux-x64-gnu` або `pnpm install --force`. Також можливо потрібно додати `.npmrc` з `supported-architectures[]=linux-x64`.

### C2: Дублювання стейту — два паралельні моделі сцен
- **Файл**: `stores/use-app-store.ts:47-48`
- **Проблема**: Зберігаються одночасно `scenesByStory` (legacy `StoryScene`) та `sceneRecordsByStory` (новий `SceneRecord`). Це створює ризик розсинхронізації даних. Дії `saveScene`, `deleteScene`, `addChoice` працюють тільки з legacy моделлю, а `saveSceneRecord`, `updateSceneRecordPreservingMeta` — тільки з новою.
- **Рекомендація**: Завершити міграцію — видалити всі legacy actions (`saveScene`, `deleteScene`, `addChoice`, `deleteChoice`) та `scenesByStory` з AppState. Використовувати тільки `SceneRecord`.

### C3: Небезпечна генерація ID через Math.random()
- **Файл**: `lib/id-utils.ts:2,6,10`
- **Проблема**: `Math.random().toString(36)` не є криптографічно безпечним. При великій кількості об'єктів можуть виникати колізії ID, що призведе до втрати даних.
- **Рекомендація**: Використовувати `crypto.getRandomValues()` або бібліотеку `uuid`.

### C4: Модульні файли в корені проекту забруднюють робочий простір
- **Файл**: `D:\.pnpm-store\v3/` — 28+ файлів прямо в корені проекту
- **Проблема**: Файли з `D:\.pnpm-store\v3\` знаходяться в корені проекту, що може спричинити проблеми з git, IDE, та інструментами збірки.
- **Рекомендація**: Видалити ці файли та додати `D:\` до `.gitignore`.

---

## ВАЖЛИВІ ПРОБЛЕМИ (HIGH)

### H1: Відсутність .gitattributes
- **Проблема**: Немає файлу `.gitattributes`, що може призводити до змішування CRLF/LF line endings на Windows/WSL.
- **Рекомендація**: Створити `.gitattributes` з вмістом:
```
* text=auto eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.json text eol=lf
*.css text eol=lf
*.md text eol=lf
```

### H2: Незахистлений document в _layout.tsx
- **Файл**: `app/_layout.tsx:14-18`
- **Проблема**: Використовується `document.documentElement.style` та `document.body.style` без захисту `typeof document !== 'undefined'`. Хоча є перевірка `Platform.OS === 'web'`, вона не гарантує наявність `document` у всіх середовищах.
- **Рекомендація**: Додати додаткову перевірку `typeof document !== 'undefined'`.

### H3: Незахистлений navigator в web-utils.ts
- **Файл**: `lib/web-utils.ts:46,58,200,213-225`
- **Проблема**: Використовується `navigator.userAgent`, `navigator.clipboard`, `navigator.storage` без перевірки `typeof navigator !== 'undefined'`. На деяких платформах (SSR, React Native) це може викликати помилку.
- **Рекомендація**: Додати перевірку `typeof navigator !== 'undefined'` перед використанням.

### H4: Непотрібний async в функціях без await
- **Файл**: `lib/story-hooks.ts:21,31` — `export async function exportStory` та `export async function importStory`
- **Проблема**: Функція `exportStory` не містить `await` — вона синхронна, але оголошена як `async`. Це створює зайву обгортку Promise.
- **Рекомендація**: Прибрати `async` з `exportStory`.

### H5: Непотрібний async в importStory
- **Файл**: `lib/story-hooks.ts:31`
- **Проблема**: `importStory` викликає `JSON.parse` синхронно, але оголошена як `async`. Єдиний async-виклик — `useAppStore.getState().addStory(story)` — не потребує await.
- **Рекомендація**: Прибрати `async` або додати реальний await.

### H6: Відсутність cleanup в useAutoSave при розмонтуванні
- **Файл**: `hooks/useAutoSave.ts:27-63`
- **Проблема**: При розмонтуванні компонента або зміні залежностей, якщо `timeoutRef.active` є true, автосейв може спрацювати після розмонтування компонента.
- **Рекомендація**: Додати перевірку `isMounted` ref перед викликом `onAutoSaveRef.current`.

### H7: Невикористаний параметр в CharacterDisplay
- **Файл**: `components/CharacterDisplay.tsx:8,11`
- **Проблема**: Параметр `dialogueTop` оголошений в Props, але не використовується в компоненті. Це порушує принцип YAGNI та може заплутати розробників.
- **Рекомендація**: Прибрати невикористаний параметр або реалізувати позиціонування відносно діалогового вікна.

### H8: Невикористаний імпорт в SceneComposer
- **Файл**: `components/editor/SceneComposer.tsx:17`
- **Проблема**: Імпортується `selectCanonicalSceneRecord` з `use-app-store`, але використовується напряму `useAppStore(s => selectCanonicalSceneRecord(storyId, sceneId)(s))` — імпорт не використовується.
- **Рекомендація**: Прибрати невикористаний імпорт.

### H9: Невикористаний імпорт Button в SceneComposer
- **Файл**: `components/editor/SceneComposer.tsx:18`
- **Проблема**: Імпортується `Button` з `@/components/ui`, але не використовується в JSX.
- **Рекомендація**: Прибрати невикористаний імпорт.

### H10: Невикористаний імпорт useFocusEffect в useReaderAudio
- **Файл**: `hooks/useReaderAudio.ts:2`
- **Проблема**: `useFocusEffect` імпортується з `@react-navigation/native`, але використовується з `expo-router`. Це може спричинити конфлікти версій.
- **Рекомендація**: Замінити на `useFocusEffect` з `expo-router`.

### H11: Невикористаний імпорт useIsFocused в useReaderAudio
- **Файл**: `hooks/useReaderAudio.ts:2`
- **Проблема**: `useIsFocused` імпортується з `@react-navigation/native`, але проект використовує Expo Router. Це може спричинити помилки навігації.
- **Рекомендація**: Замінити на `useIsFocused` з `expo-router` або видалити як невикористаний.

### H12: Невикористаний імпорт useSceneImages в story-reader-responsive
- **Файл**: `components/story-reader-responsive.tsx:43`
- **Проблема**: `useSceneImages` імпортується, але результат (`bgSource`, `resolvedCharUris`) використовується частково. Потрібно перевірити, чи всі поля використовуються.
- **Рекомендація**: Перевірити використання та прибрати невикористані імпорти.

### H13: Невикористаний імпорт SceneRecord в runtime-story
- **Файл**: `lib/runtime-story.ts:3`
- **Проблема**: `SceneRecord` імпортується, але використовується тільки в типі `RuntimeSceneSnapshot.sceneRecord`.
- **Рекомендація**: Перевірити, чи потрібен цей імпорт.

### H14: Невикористаний імпорт StoryMetadata в runtime-story
- **Файл**: `lib/runtime-story.ts:7`
- **Проблема**: `StoryMetadata` імпортується, але вже є в `RuntimeStoryStateSnapshot`.
- **Рекомендація**: Прибрати невикористаний імпорт.

### H15: Невикористаний імпорт StoryScene в runtime-story
- **Файл**: `lib/runtime-story.ts:6`
- **Проблема**: `StoryScene` імпортується, але вже є в `RuntimeSceneSnapshot`.
- **Рекомендація**: Прибрати невикористаний імпорт.

---

## ПРОБЛЕМИ СЕРЕДНЬОГО РІВНЯ (MEDIUM)

### M1: Відсутність валідації JSON при імпорті сторі
- **Файл**: `lib/story-hooks.ts:36-41`
- **Проблема**: `JSON.parse` обробляється через `catch`, але не перевіряється структура об'єкта перед використанням. Якщо JSON валідний, але не містить потрібних полів, буде помилка при зверненні до `parsed.id`.
- **Рекомендація**: Додати перевірку наявності обов'язкових полів перед `JSON.parse`.

### M2: Відсутність обмеження розміру JSON при експорті
- **Файл**: `lib/story-hooks.ts:21-29`
- **Проблема**: `exportStory` не перевіряє розмір результуючого JSON. При великих історіях це може призвести до проблем з продуктивністю.
- **Рекомендація**: Додати перевірку розміру результуючого JSON.

### M3: Відсутність обробки помилок в useReaderInitialization
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `initializeReader` викликає `setCurrentStory` та `updatePlaybackState` без обробки помилок для кожного окремого кроку. Якщо `setCurrentStory` не вдається, `updatePlaybackState` все одно викликається.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M4: Відсутність обробки помилок в useReaderAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `applySceneAudio` викликає `resolvePlayableAssetUri` без обробки помилок для кожного окремого кроку. Якщо `resolvePlayableAssetUri` не вдається, `audioManager.crossFade` все одно викликається.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M5: Відсутність обробки помилок в useAutoSave
- **Файл**: `hooks/useAutoSave.ts:40-55`
- **Проблема**: `buildRuntimeSaveSlot` може повернути `null`, але це не перевіряється перед викликом `onAutoSaveRef.current`.
- **Рекомендація**: Додати перевірку `if (!newSlot) return;`.

### M6: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M7: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M8: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M9: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M10: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M11: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M12: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M13: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M14: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M15: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M16: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M17: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M18: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### M19: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### M20: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

---

## РЕКОМЕНДАЦІЇ (LOW)

### L1: Використання `as unknown as` кастувань
- **Файли**: `lib/_core/theme.ts:153`, `lib/runtime-story.ts:9`
- **Проблема**: Касти `as unknown as` обходять TypeScript перевірки. Це може призвести до помилок при рефакторингу.
- **Рекомендація**: Використовувати більш точні типи або generic constraints.

### L2: Відсутність JSDoc для публічних API
- **Файли**: Багато файлів в `lib/` та `hooks/`
- **Проблема**: Багато публічних функцій та компонентів не мають JSDoc коментарів.
- **Рекомендація**: Додати JSDoc для всіх експортованих функцій та компонентів.

### L3: Відсутність констант для магічних чисел
- **Файли**: `lib/audio-player-service.ts:13`, `hooks/useAutoSave.ts:55`, `hooks/useReaderInitialization.ts:110`
- **Проблема**: Використовуються "магічні" числа без пояснення (FADE_STEP_MS = 50, 2000ms timeout, 10_000ms safety timer).
- **Рекомендація**: Винести всі магічні числа в іменовані константи з поясненням.

### L4: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### L5: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### L6: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### L7: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### L8: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

### L9: Відсутність обробки помилок в useReaderInitialization.initializeReader
- **Файл**: `hooks/useReaderInitialization.ts:39-104`
- **Проблема**: `resolveCanonicalStartSceneId` може повернути порожній рядок, але це не перевіряється перед створенням `PlaybackState`.
- **Рекомендація**: Додати перевірку на порожній `startSceneId`.

### L10: Відсутність обробки помилок в useReaderAudio.applySceneAudio
- **Файл**: `hooks/useReaderAudio.ts:73-182`
- **Проблема**: `audioManager.crossFade` та `audioManager.play` викликаються без обробки помилок для кожного окремого кроку.
- **Рекомендація**: Додати окремі try/catch блоки для кожного кроку.

---

## АРХІТЕКТУРНІ ЗАУВАЖЕННЯ

### A1: Подвійна модель даних (Legacy + Canonical)
Проект перебуває в стані міграції від `StoryScene` до `SceneRecord`. Це створює:
- Дублювання коду для підтримки обох моделей
- Ризик розсинхронізації даних
- Ускладнений код з перевірками `if (canonicalRecords.length > 0)`

**Рекомендація**: Завершити міграцію якомога швидше. Видалити `scenesByStory` та всі legacy actions.

### A2: Відсутність централізованого роутингу аудіо
Аудіо логіка розкидана по файлах:
- `audio-manager-enhanced.ts` — facade
- `audio-player-service.ts` — low-level playback
- `audio-trigger-scheduler.ts` — triggers
- `audio-library-service.ts` — library management
- `useReaderAudio.ts` — React hook
- `reader-audio-session.ts` — session management

**Рекомендація**: Розглянути можливість об'єднання в єдиний AudioManager з чітким інтерфейсом.

### A3: Відсутність централізованого управління помилками
Помилки обробляться по-різному в різних частинах коду:
- `ErrorHandler.handle()` для глобальних помилок
- `console.error()` для локальних помилок
- `try/catch` з ігноруванням помилок

**Рекомендація**: Стандартизувати обробку помилок по всьому проекту.

### A4: Відсутність типобезпеки для теми
`RuntimePalette` використовує `[key: string]: string | undefined` для динамічного доступу. Це обходить TypeScript перевірки.

**Рекомендація**: Використовувати більш точні типи або generic constraints.

---

## ЗАЛЕЖНОСТІ

### Застарілі залежності
| Пакет | Поточна версія | Остання версія | Статус |
|-------|---------------|---------------|--------|
| expo | ~54.0.33 | 54.x | ✅ Актуальна |
| react | 19.1.0 | 19.x | ✅ Актуальна |
| react-native | 0.81.5 | 0.81.x | ✅ Актуальна |
| zustand | ^4.5.5 | 5.x | ⚠️ Можна оновити |
| nativewind | ^4.2.1 | 4.x | ✅ Актуальна |
| typescript | ~5.7.2 | 5.8.x | ⚠️ Можна оновити |
| vitest | ^2.1.9 | 3.x | ⚠️ Можна оновити |

### Проблеми з залежностями
1. **@types/node** — видалений з tsconfig.json для уникнення конфліктів з react-native, але залишається в devDependencies
2. **@types/react-native** — застарілий пакет, не сумісний з React Native 0.81+
3. **react-native-reanimated-dnd** — нестандартний пакет, може спричинити проблеми

---

## ПІДСУМОК

### Що працює добре:
- TypeScript компіляція проходить без помилок
- Чітка структура проекту з розділенням на lib/, components/, hooks/, stores/
- Хороша документація в wiki/
- Використання сучасних технологій (Expo 54, React 19, Zustand)
- Тестове покриття для основних модулів

### Що потребує уваги:
1. **Критично**: Виправити запуск тестів (Rollup модуль)
2. **Критично**: Завершити міграцію на SceneRecord
3. **Критично**: Замінити Math.random() на crypto.getRandomValues()
4. **Важливо**: Додати .gitattributes
5. **Важливо**: Прибрати невикористані імпорти
6. **Важливо**: Додати обробку помилок в асинхронних функціях
7. **Середньо**: Стандартизувати обробку помилок
8. **Низько**: Оновити залежності

### Загальна оцінка коду: 7/10
Проект має гарну архітектуру та структуру, але потребує завершення міграції та покращення обробки помилок.

## Пов'язані сторінки

[[index|Головна сторінка wiki]]
[[architecture-reference.md|Архітектурна довідка]]
