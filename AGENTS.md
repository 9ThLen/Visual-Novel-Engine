# AGENTS.md — Visual Novel Engine

## Правило: Використання Context7 для документації

**ОБОВ'ЯЗКОВО** використовуй Context7 MCP коли:

1. **Не знаєш API бібліотеки** — якщо не впевнений у тому, як працює конкретна функція, клас або метод
2. **Складний код** — коли стикаєшся зі складним кодом який ти не розумієш повністю
3. **Нова бібліотека** — коли працюєш з бібліотекою яку раніше не використовував
4. **Оновлення API** — коли підозряєш що API могло змінитися між версіями
5. **Приклади використання** — коли потрібні приклади використання конкретної функції
6. **Типи та інтерфейси** — коли потрібно дізнатися точні типи параметрів або значень, що повертаються

### Як використовувати

1. Спочатку виклич `resolve-library-id` з назвою бібліотеки
2. Потім виклич `query-docs` з отриманим ID та конкретним запитом

### Пріоритет

Context7 має **вищий пріоритет** ніж власні знання про API. Якщо ти не впевнений — завжди перевіряй через Context7.

---

## Інші правила

- **Don't fight with mistakes** — Коли стикаєшся з тією самою помилкою двічі, зупинись і досліджуй веб для 3-5 можливих виправлень, потім обери найефективніше.
- **Lego — єдина система редагування** — Block та Node системи видалено. Використовуй тільки Lego.
- **Zustand напряму** — Не використовуй React Context для стейту. Використовуй useAppStore() напряму.
- **HomeScreen init:** `initializeApp()` має чекати `useAppStore.persist.onFinishHydration()` перед `loadStories()`, а `addStory` для демо має бути в `finally` (переживає помилки `loadStories`).
- **migrateFromLegacyKeys merge:** Не затирати вже згідратовані Persist дані пустими масивами — використовуй `stories.length > 0 ? stories : current.storiesMetadata`.
- **StoryAutoSave** не має викликати `migrateFromLegacyKeys()` — HomeScreen це робить.
- **`vars()` з nativewind** підтримується на Android — це не причина невидимих кольорів.
- **Pressable + `active:` = зламаний onPress:** NativeWind `active:` модифікатор на `Pressable` блокує `onPress`. Фікс: `remapProps(Pressable, { className: false })` + обгортання `Pressable` у `<View className="...">`.
- **Web storage:** Не використовуй `@react-native-async-storage/async-storage` напряму. Використовуй `createPersistentStorage()` з `lib/persistent-storage.ts` — на web падає на `localStorage`, на native — на AsyncStorage.
- **Web splash screen:** `SplashScreen.preventAutoHideAsync()` на модульному рівні вішає web. Викликай всередині `useEffect` через динамічний `import()`.
- **Reanimated на web:** Імпорт на рівні модуля (`import "react-native-reanimated"`) може впасти. Використовуй `try { require("react-native-reanimated") } catch {}`.
- **oklch() fallback:** Для старих браузерів додавай hex/rgb fallback-кольори перед oklch.
- **Dynamic import:** Не використовуй `await import()` для модулів, які вже імпортовані статично (напр. `useAppStore`).

-- 2026-05-24 Session learnings --

- **Audio fade fix pattern:** `originalVolume` must be captured *before* any fade/stop/play operation modifies it. Save on `play()` call, use in `fadeOut`/`fadeIn` generation.
- **Variable block value type:** `operation === 'toggle'` → render `<Toggle>`; other ops → `<TextInput>` with `isNaN(Number(v)) ? v : Number(v)` parsing for numeric preservation.
- **RuntimePalette index signature:** Always add `[key: string]: string | undefined` to RuntimePalette type so dynamic bracket access (e.g. `colors['surface-2']`) works without `as any`.
- **BlockLibraryPanel is self-contained:** The panel manages its own search state internally. Do NOT pass `searchQuery`/`onSearchChange` props from parent — they are unused.
- **SceneComposer dual layout:** Phone uses tab-based view switching (`showBlockLibrary`/`showProperties`); desktop shows all three panels side-by-side. Both branches must be implemented in the component.
