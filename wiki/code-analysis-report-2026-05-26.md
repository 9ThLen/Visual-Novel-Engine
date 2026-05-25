# Повний аналіз проекту Visual Novel Engine — 2026-05-26

> Використані скіли: code-audit-workflow, codebase-inspection, typescript (власний), react-native-compat
> TypeScript компіляція: ПРОЙДЕНА (exit code 0)

---

## 1. Загальна статистика (codebase-inspection)

| Метрика | Значення |
|---------|----------|
| Файли (TS/TSX/JS/CSS/JSON/MD) | 1,499 |
| Загальний рядків | 36,842 |
| TypeScript (.ts) | 107 файлів, 12,638 рядків |
| TSX/React (.tsx) | 59 файлів, 11,999 рядків |
| Css | 1 файл, 529 рядків |
| JSON | 1,256 файлів, 2,001 рядок |
| Markdown | 70 файлів, 9,356 рядків |

### TOP-10 директорій за розміром:

| Директорія | Файли | Рядки |
|------------|-------|-------|
| lib/ | 47 | 6,228 |
| components/editor/ | 11 | 3,723 |
| components/ | 17 | 3,050 |
| (root) | 25 | 2,322 |
| docs/ | 6 | 2,015 |
| .planning/phases/07-editor-ux-polish | 8 | 1,673 |
| components/lego-editor/ | 4 | 1,415 |
| __tests__/unit/lib/ | 14 | 1,405 |
| hooks/ | 12 | 1,300 |
| app/ | 12 | 1,232 |

---

## 2. TypeScript типізація

### 2.1. Використання `any`
**Результат: 0 використань `any` в основному коді** — відмінний результат!

Єдині використання `any` знаходяться в:
- `.planning/` — планувальні файли (не рантайм)
- `__tests__/` — тести (допустимо)

### 2.2. Type assertions (`as unknown/any/never`)

| Файл | Кількість |
|------|-----------|
| components/editor/TimelinePanel.tsx | 10x |
| app/editor.tsx | 4x |
| components/editor/PlayMode.tsx | 4x |
| components/editor/PreviewScreen.tsx | 3x |
| components/editor/SceneManager.tsx | 3x |
| lib/_core/theme.ts | 1x (`as unknown as RuntimePalette`) |

**Оцінка: ДОБРЕ** — мінімальна кількість `as` кастів. Найбільше в TimelinePanel — що очікувано для UI компонента зі складним станом.

### 2.3. tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "ignoreDeprecations": "5.0"
  }
}
```

⚠️ **`ignoreDeprecations: "5.0"`** — застаріла опція для TypeScript 5.0→5.3. Поточна версія TypeScript 5.7.2, ця опція може спричинити попередження. Рекомендовано видалити.

---

## 3. React Native сумісність (react-native-compat)

### 3.1. Web API без захисту
**Результат: 0 проблем** — всі використання `window`, `document`, `localStorage` мають відповідні захости (`Platform.OS === 'web'`, `typeof window !== 'undefined'`).

### 3.2. `boxShadow` (не працює на Android)

| Файл | Рекомендація |
|------|-------------|
| components/ErrorBoundary.tsx | Додати `elevation` для Android |
| components/lego-editor/AtomBlockComponent.tsx | Додати `elevation` або умовний стиль |
| components/lego-editor/LegoBlockLibrary.tsx | Додати `elevation` або умовний стиль |
| components/lego-editor/LegoCanvas.tsx | Додати `elevation` або умовний стиль |
| components/lego-editor/LegoFlowWorkspace.tsx | Додати `elevation` або умовний стиль |

**Пріоритет: MEDIUM** — на iOS/web працює, на Android тіні не відображаються.

### 3.3. OKLCH у StyleSheet

| Файл | Проблема |
|------|----------|
| components/dialogue-history.tsx | OKLCH використовується в `StyleSheet.create()` — **НЕ ПІДТРИМУЄТЬСЯ** React Native |

**Пріоритет: HIGH** — кольори можуть не відображатися на пристрої. Замінити на hex/rgba.

### 3.4. `Alert.alert()` (блокує JS-потік на Android)

| Файл | Рекомендація |
|------|-------------|
| app/editor.tsx | Замінити на InlineToast |
| app/save-load.tsx | Замінити на InlineToast |
| components/InteractiveObjectsEditor.tsx | Замінити на InlineToast |
| components/editor/SceneManager.tsx | Замінити на InlineToast |
| hooks/useSceneEditorActions.ts | Замінити на InlineToast |
| hooks/useSceneEditorMedia.ts | Замінити на InlineToast |

**Пріоритет: HIGH** — Alert.alert блокує JS-потік, що призводить до зависання Reanimated анімацій.

### 3.5. Не вистачає `.gitattributes`
✅ **Вже створено** — файл `.gitattributes` присутній у проекті.

### 3.6. Тестовий запуск (Vitest)
❌ **Зламаний** — модуль `@rollup/rollup-linux-x64-gnu` не знайдено.

```
Error: Cannot find module @rollup/rollup-linux-x64-gnu
```

**Пріоритет: CRITICAL** — тести не запускаються. Виправлення:
```bash
pnpm add -D @rollup/rollup-linux-x64-gnu
# або
pnpm install --force
```

---

## 4. Архітектурний аналіз

### 4.1. Zustand Stores (4 шт.)

| Store | Призначення | Статус |
|-------|-------------|--------|
| use-app-store.ts | Глобальний стан (stories, scenes, settings) | ✅ Основний |
| use-editor-store.ts | Стан редактора сцен | ✅ Редактор |
| use-lego-store.ts | LEGO редактор | ⚠️ Може бути об'єднаний |
| theme-store.ts | Тема (dark/light) | ✅ Окремий (правильно) |

**Зувага: use-app-store містить два паралельні моделі даних:**
- `scenesByStory` (legacy StoryScene)
- `sceneRecordsByStory` (новий SceneRecord)

Початкова міграція триває. Рекомендовано завершити.

### 4.2. Layer Boundary Violations (lib/ → stores/hooks)

| Файл | Порушення |
|------|-----------|
| lib/audio-library.ts | Імпортує з stores/ |
| lib/media-library-service.ts | Імпортує з stores/ |
| lib/story-hooks.ts | Імпортує з stores/, hooks/ |
| lib/theme-provider.tsx | Імпортує з stores/ |

**Оцінка: ДОПУСТИМО для цього проекту** — lib/story-hooks.ts є частиною story-системи і потребує доступу до store. Решта — read-only доступ через `useAppStore.getState()` який є прийнятним винятком.

### 4.3. Math.random() для ID generation

| Файл | Рекомендація |
|------|-------------|
| lib/id-utils.ts | **CRITICAL** — Замінити на `crypto.getRandomValues()` |
| components/editor/StoryFlowScreen.tsx | Використовує Math.random() для ID — перевірити |
| .planning/spikes/002-editor-undo-redo/test-undo-redo.ts | Тестовий код — допустимо |

---

## 5. Баги та потенційні проблеми

### 5.1. Порожній catch block

**Файл:** `lib/media-library-service.ts:104`
```typescript
try {
  await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
} catch {
}
```

**Пріоритет: MEDIUM** — catch без параметра + порожнє тіло. Metro може відхилити. Виправити на:
```typescript
catch (e) {
  // Directory may already exist
}
```

### 5.2. Unguarded console.* calls

| Файл | Виклики | Рівень |
|------|---------|--------|
| app/tabs/index.tsx | 6 (console.log) | ⚠️ |
| hooks/useReaderAudio.ts | 2 (console.log/warn) | ⚠️ |
| lib/_core/api.ts | 3 (console.log) | ⚠️ |
| lib/audio-player-service.ts | 1 (console.log) | ⚠️ |
| stores/use-app-store.ts | 2 (console.warn/log) | ✅ Допустимо (persist debug) |

**Рекомендація:** Обгорнути всі `console.*` в `if (__DEV__)` або видалити.

### 5.3. Race condition guards

На щастя, в проекті є правильні патерни захисту від race conditions:

| Файл | Механізм | Статус |
|------|----------|--------|
| hooks/useReaderAudio.ts | sceneGenerationRef | ✅ Правильно |
| hooks/useReaderInitialization.ts | initRequestIdRef | ✅ Правильно |
| hooks/useSceneData.ts | generation counter | ✅ Правильно |
| lib/audio-player-service.ts | crossFadeGeneration | ✅ Правильно |

---

## 6. Підсумок

### Оцінка за категоріями:

| Категорія | Оцінка | Коментар |
|-----------|--------|----------|
| TypeScript типізація | 9/10 | 0 `any`, мінімум `as` кастів |
| React Native sumisність | 7/10 | boxShadow, OKLCH, Alert.alert |
| Архітектура | 7/10 | 4 stores, layer violations |
| Обробка помилок | 8/10 | 1 порожній catch, race guards є |
| Якість коду | 8/10 | Чистий, структурований код |
| Тестове покриття | 7/10 | 17 тестів, але рантайм зламаний |
| **ЗАГАЛЬНА** | **7.5/10** | **Добрий проект з кількома доработками** |

### Критичні проблеми (CRITICAL):

1. ❌ **Vitest не запускається** — відсутній `@rollup/rollup-linux-x64-gnu`
2. ❌ **Math.random() в id-utils.ts** — небезпечна генерація ID

### Важливі проблеми (HIGH):

3. ⚠️ **OKLCH у StyleSheet** (dialogue-history.tsx) — не підтримується RN
4. ⚠️ **6x Alert.alert()** — блокує JS-потік на Android
5. ⚠️ **tsconfig `ignoreDeprecations: "5.0"`** — застаріла опція

### Середні проблеми (MEDIUM):

6. ⚡ **5 файлів з boxShadow** — не працює на Android
7. ⚡ **Unguarded console.* calls** — 5 файлів
8. ⚡ **Порожній catch** в media-library-service.ts

---

## 7. Рекомендації щодо виправлення

### Терміново (1-2 дні):
1. Встановити `@rollup/rollup-linux-x64-gnu` для запуску тестів
2. Замінити `Math.random()` на `crypto.getRandomValues()` в `lib/id-utils.ts`
3. Видалити `ignoreDeprecations: "5.0"` з tsconfig.json
4. Замінити OKLCH на hex/rgba в `dialogue-history.tsx`

### Високий пріоритет (3-5 днів):
5. Замінити `Alert.alert()` на InlineToast в 6 файлах
6. Додати `elevation` для Android разом з `boxShadow`
7. Обгорнути `console.*` в `if (__DEV__)`

### Планові покращення:
8. Завершити міграцію scenesByStory → sceneRecordsByStory
9. Додати eslint rule для заборони `as unknown as`
10. Покращити catch blocks з поясненнями

---

## Пов'язані сторінки

 [[code-analysis-report-2026-05-25|Попередній аналіз 2026-05-25]]
 [[PLAN-2026-05-25|План вирішення проблем [[architecture-reference|Архітектурна довідка]]

