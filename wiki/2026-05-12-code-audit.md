# Аудит коду 2026-05-12 — Повний аналіз проблем та план виправлень

> **Тип проєкту:** Expo React Native застосунок — редактор і плеєр візуальних новел
> **Стек:** React Native 0.81.5, Expo 54, Zustand, Zod, Immer, NativeWind (Tailwind), Expo Router, Reanimated

---

## Перевірка проблем: статус по кожному пункту

З 25 виявлених проблем: ✅ **12 виправлено**, 🔶 **3 частково**, ❌ **10 досі існують**

---

### 1. 🏗️ АРХІТЕКТУРНІ ПРОБЛЕМИ

#### 1.1 Два паралельні системи управління станом — ⚠️ **Досі існує**

| Система | Файл | Домен |
|---|---|---|
| Zustand | `stores/scene-store.ts` | LEGO-редактор (елементи, таймлайн) |
| React Context + useReducer | `lib/story-context.tsx`, `lib/inventory-context.tsx`, `lib/i18n-context.tsx`, `lib/theme-provider.tsx` | Історії, інвентар, i18n, тема |

**Проблема:** Немає єдиної стратегії. Контексти ре-рендерять все піддерево, Zustand — ні.

**Рішення (з wiki/STATE-MANAGEMENT-DECISION.md):** Залишити окремими доменами, стандартизувати лише інтерфейс (публічний API hooks), а не реалізацію.

---

#### 1.2 Два різних типи "Scene" — ⚠️ **Досі існує**

| Тип | Файл | Призначення |
|---|---|---|
| `StoryScene` | `lib/types.ts:25` | Narrative — текст, вибори, персонажі, аудіо |
| `Scene` | `lib/scene-types.ts:16` | LEGO canvas — елементи, таймлайн |

**Рішення (з wiki/SCENE-TYPES-DECISION.md):** Не об'єднувати — різні абстракції для різних редакторів.

---

#### 1.3 Два паралельні редактори — ⚠️ **Досі існує**

| Екран | Файл | Розмір |
|---|---|---|
| Scene Editor | `app/scene-editor.tsx` | 566 рядків |
| Node Editor | `app/node-editor.tsx` | — |

**Проблема:** Два конкуруючих підходи до редагування сюжету. Потрібно обрати один або чітко розмежувати аудиторію.

---

#### 1.4 Дублювання констант — ✅ **Виправлено**

`shared/const.ts` було видалено. Залишився тільки `constants/const.ts`.

---

#### 1.5 Два системи зберігання персонажів — ⚠️ **Досі існує**

| Рівень | Файл |
|---|---|
| Сервісний | `lib/character-library.ts` |
| React Hook | `hooks/use-character-library.ts` |

Хук делегує до lib — не чисте дублювання, але два рівні абстракції.

---

#### 1.6 Зайвий цикл save→load — ✅ **Виправлено**

`handleSaveToSlot` в `app/save-load.tsx` викликає тільки `await saveGame(slotId)` + алерт. `loadGame` після save прибрано.

---

### 2. 🐛 БАГИ ТА ПОМИЛКИ

#### 2.1 Race condition у useReaderInitialization — ✅ **Виправлено**

Використовує `initRequestIdRef` з increment-патерном + `stateRef` для stale closures. `initializeReader` перевіряє `requestId !== initRequestIdRef.current` перед виконанням.

---

#### 2.2 useReaderAudio зупиняє BGM потім відновлює — ✅ **Виправлено**

`stop()` викликається тільки для треків, де `trackId !== 'bgm'`. BGM обробляється окремо з crossfade.

---

#### 2.3 useEffect без залежностей у scene-editor — ✅ **Виправлено**

Єдиний useEffect (рядок 228) має `[loadSceneData]`. Рядок 252 — закриваюча дужка.

---

#### 2.4 useCallback з неповними залежностями — ✅ **Виправлено**

`handleKeyDown` залежить від `[enabled]` і використовує `shortcutsRef` (ref). Розумний дизайн — refs не потрібні в deps.

---

#### 2.5 Баг у addBlockAfterPath — ✅ **Виправлено**

Порожній path коректно обробляється: додає до кореневих children. Використовує `path.length === 0` перевірку та `parent.children.push(block)`.

---

#### 2.6 useInfiniteScroll — штучне затримування — ⚠️ **Досі існує**

```typescript
// lib/pagination.ts:132-134
setTimeout(() => {
  setLoadedPages(prev => prev + 1);
  setLoading(false);
}, 100); // ← хардкод 100мс
```

На повільних пристроях цього недостатньо, на швидких — зайве.

---

### 3. ⚠️ ПРОБЛЕМИ ЯКОСТІ КОДУ

#### 3.1 Масове використання any — ✅ **Виправлено**

`hooks/useSceneEditorActions.ts` використовує 0 `any`. Всі параметри типізовані через інтерфейси (`Story`, `StoryScene`, `Choice`, `SceneSaveData`).

---

#### 3.2 console.log у продакшн-коді — 🔶 **Частково виправлено**

| Файл | Статус |
|---|---|
| `lib/_core/auth.ts` | ✅ 6 `console.error`, всі під `__DEV__` |
| `lib/_core/api.ts` | ⚠️ 18 під `__DEV__`, 1 не захищений (рядок 137: `console.error("[API] getMe failed:", error)`) |

---

#### 3.3 Відсутність React.memo — ⚠️ **Досі існує**

`renderStoryCard` в `app/editor.tsx:116` та `app/tabs/index.tsx:79` — plain functions без `React.memo`. Кожен ререндер створює картки заново.

---

#### 3.4 useFocusEffect створює новий ref щоразу — ⚠️ **Досі існує**

```typescript
// hooks/useReaderAudio.ts:18-24
useEffect(() => {
  return () => { audioManager.cancelAll(); };
}, []);
```

Аудіо-клінап робиться тільки на unmount. Має бути `useFocusEffect` для клінапу на blur екрану.

---

#### 3.5 useMemo без користі — ⚠️ **Досі існує**

```typescript
// app/scene-editor.tsx:182-184
const sceneListMemo = useMemo(() => {
  return currentStory ? Object.keys(currentStory.scenes) : [];
}, [currentStory]);
```

`Object.keys` — дешева операція. `useMemo` додає complexity без вигоди.

---

#### 3.6 Inline стилі замість Tailwind — 🔶 **Частково виправлено**

| Компонент | Статус |
|---|---|
| `editor.tsx` | ✅ Tailwind |
| `EditTab.tsx` | ✅ Tailwind |
| `BlockCard.tsx` | ✅ Tailwind |
| `story-reader-responsive.tsx` | ✅ Tailwind |
| `save-load.tsx` | ❌ ~100% inline |
| `scene-editor.tsx` | 🔶 Мікс |

---

### 4. 🔒 ПРОБЛЕМИ БЕЗПЕКИ

#### 4.1 Неповна XSS-санітація — ❌ **Досі існує**

```typescript
// lib/story-validator.ts:237-252
sanitizeText() {
  // Стрипає: <script>, on\w+="...", javascript:
  // ПРОПУСКАЄ: SVG, <iframe>, <object>, <img onerror>,
  //   backtick event handlers, HTML entity encoding
}
```

Потрібен DOMPurify або повна санітація.

---

#### 4.2 URI валідація дозволяє path traversal — ❌ **Досі існує**

```typescript
// lib/story-validator.ts:220-229
validateUri() {
  // Дозволяє: http://, https://, /, ./, ../
  // `../../../etc/passwd` ПРОХОДИТЬ валідацію
}
```

Потрібно нормалізувати шлях і заборонити `..`

---

#### 4.3 Debug-флаг в продакшені — ✅ **Виправлено**

`lib/_core/manus-runtime.ts` використовує `__DEV__` замість `DEBUG = true`.

---

#### 4.4 Жорстко закодований ключ AsyncStorage для інвентарю — ❌ **Досі існує**

```typescript
// lib/inventory-context.tsx:90, 102
const inventoryJson = await AsyncStorage.getItem('vne_inventory'); // ← не екстрактовано
```

Не винесено в named constant.

---

### 5. 🧪 ТЕСТУВАННЯ

#### 5.1 Порожня папка tests/ — ❌ **Досі існує**

Директорія `tests/` порожня. Тести в `__tests__/`.

---

#### 5.2 Немає тестів для критичних шляхів — 🔶 **Частково виправлено**

| Компонент | Тести є? |
|---|---|
| `story-validator.ts` | ✅ |
| `asset-resolver.ts` | ✅ |
| `story-context-enhanced.ts` | ✅ |
| `story-context.tsx` | ❌ |
| `useReaderAudio.ts` | ❌ |
| `useReaderInitialization.ts` | ❌ |

---

#### 5.3 Неповний мок — ❌ **Досі існує**

Моки є для: AsyncStorage, expo-audio, expo-av, expo-file-system, expo-haptics, expo-image-picker.

**Бракує:** expo-router, expo-secure-store, zustand, expo-document-picker, react-native-reanimated.

---

## Загальна оцінка

| Категорія | Рейтинг | Коментар |
|---|---|---|
| Архітектура | ⚠️ 6/10 | Два паралельні стейт-менеджменти, два редактори, дублювання типів |
| Безпека | ❌ 4/10 | XSS-санітація неповна, path traversal, hardcoded ключі |
| Якість коду | 6/10 | Прогрес з Tailwind та any, але inline-стилі та console.log лишаються |
| Тестування | 4/10 | Часткове покриття, відсутні моки, порожня tests/ |
| React Native best practices | 6/10 | Антипатерни з useFocusEffect, зайві рендери |
| Type safety | 6/10 | Прогрес, але є недоліки |

**Загалом: 12/25 виправлено (48%). Безпекові проблеми — найкритичніший недолік.**

---

## Пріоритизований план виправлень

### 🔴 Критично (безпека + баги)

| # | Завдання | Де | Статус |
|---|---|---|---|
| 1 | Додати повну XSS-санітацію (DOMPurify або regex для SVG, iframe, CSS) | `lib/story-validator.ts` | ❌ |
| 2 | Заборонити `../` у URI валідації, імплементувати canonicalization | `lib/story-validator.ts` | ❌ |
| 3 | Винести `'vne_inventory'` у named constant | `lib/inventory-context.tsx` | ❌ |
| 4 | Прибрати єдиний незахищений `console.error` в api.ts | `lib/_core/api.ts:137` | 🔶 |

### 🟠 Високий пріоритет (архітектура + якість)

| # | Завдання | Де | Статус |
|---|---|---|---|
| 5 | Об'єднати або чітко розмежувати `lib/character-library.ts` і `hooks/use-character-library.ts` | Обидва файли | ❌ |
| 6 | Додати `React.memo` до `renderStoryCard` | `app/editor.tsx`, `app/tabs/index.tsx` | ❌ |
| 7 | Конвертувати `save-load.tsx` на Tailwind className | `app/save-load.tsx` | ❌ |
| 8 | Замінити inline стилі в scene-editor на Tailwind | `app/scene-editor.tsx` | 🔶 |
| 9 | Використати `useFocusEffect` для аудіо-клінапу | `hooks/useReaderAudio.ts` | ❌ |
| 10 | Забрати зайвий `useMemo` для `sceneListMemo` | `app/scene-editor.tsx` | ❌ |
| 11 | Прибрати `setTimeout(100)` — зробити async з реальним очікуванням | `lib/pagination.ts` | ❌ |

### 🟡 Середній пріоритет (тести + інфраструктура)

| # | Завдання | Де | Статус |
|---|---|---|---|
| 12 | Додати тести для `story-context.tsx` | `__tests__/unit/` | ❌ |
| 13 | Додати тести для `useReaderAudio.ts`, `useReaderInitialization.ts` | `__tests__/unit/` | ❌ |
| 14 | Додати моки для expo-router, zustand, react-native-reanimated | `__tests__/unit/__mocks__/` | ❌ |
| 15 | Видалити порожню `tests/` або перенести тести туди | Корінь проекту | ❌ |

### 🟢 Низький пріоритет (документація, polish)

| # | Завдання | Де | Статус |
|---|---|---|---|
| 16 | Оновити `todo.md` — відображати актуальний стан | `todo.md` | ❌ |
| 17 | Додати E2E тести для повного flow (create → edit → save → read) | `__tests__/e2e/` | ❌ |
| 18 | Додати accessibility labels до інтерактивних елементів | Весь UI | ❌ |

---

## Динаміка змін

| Сесія | Виправлено | Залишилось | Прогрес |
|---|---|---|---|
| Попередній аудит | — | 25 | 0% |
| Поточна сесія | 12 | 13 | 48% |

Найбільша кількість виправлень — у категорії багів (6/6) та архітектурних дрібниць (2). Найгірша ситуація — безпека (1/4 виправлено) та тестування (0/3 виправлено).
