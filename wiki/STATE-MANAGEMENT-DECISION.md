# Вирішення: Дві системи стейт-менеджменту — Context+useReducer vs Zustand

## Поточний стан

### Система 1: React Context + useReducer
- **Файли:** `lib/story-context.tsx`, `lib/inventory-context.tsx`, `lib/i18n-context.tsx`
- **useStory()** — CRUD історій, playback, save/load, settings
- **useInventory()** — інвентар гравця (AsyncStorage)
- **useI18n()** — мови та переклади
- **Споживачі:** `app/editor.tsx`, `app/scene-editor.tsx`, `app/reader.tsx`, `app/save-load.tsx`, `app/node-editor.tsx`, `app/settings.tsx`, `app/tabs/index.tsx`, `components/LanguageSelector.tsx`, `components/InteractiveObjectsLayer.tsx`

### Система 2: Zustand
- **Файл:** `stores/scene-store.ts`
- **useSceneStore()** — граф сцен LEGO-редактора (elements, timeline, snap)
- **Споживачі:** `components/lego-editor/TimelineEditor.tsx`, `hooks/lego/useSceneManagement.ts`, `hooks/lego/useLegoDnD.ts`, `lib/scene-persistence.ts`

## Аналіз доменів

| Домен | Система | Тип даних | Життєвий цикл |
|-------|---------|-----------|---------------|
| Story CRUD + Playback | Context | `Story`, `SaveSlot`, `PlaybackState`, `UserSettings` | Global app lifetime |
| Inventory | Context | `InventoryItem[]` | Session |
| i18n | Context | `Language`, translations | Session |
| LEGO Editor Canvas | Zustand | `Scene[]`, `AtomBlock[]`, `TimelineEvent[]` | Editor session only |

## Рішення: **Залишити окремими доменами**

**Обґрунтування:**
1. **Різні домени** — Story Context керує runtime-даними VN (історії, прогрес), Scene Store керує editor-time даними (LEGO canvas). Це принципово різні моделі.
2. **Різні споживачі** — ні один компонент не використовує одночасно `useStory()` і `useSceneStore()`.
3. **Різні формати даних** — `StoryScene` (text, choices, audio URIs) vs `Scene` (elements, timeline, snap grid).
4. **Зберігання** — Context використовує AsyncStorage через Repository pattern, Zustand — вбудований persist middleware.

## Додатково: Два типи "Scene"

- `StoryScene` (`lib/types.ts`) — контент сцени (текст, вибори, персонажі, аудіо)
- `Scene` (`lib/scene-types.ts`) — LEGO canvas сцена (елементи, таймлайн)

Це **не конфлікт**, а різні абстракції для різних редакторів.

## Статус тестування

- **22 тестові файли**
- **375+ тестів**
- Покриття: reducer-логіка (`storyReducer`), хуки (`useReaderAudio`, `useReaderInitialization`), CRUD (`story-context-enhanced`), валідація (`story-validator`), санітація, аудіо (audio-trigger-scheduler)
- Інфраструктура: Vitest + jsdom для React-тестів, моки для AsyncStorage, expo-av, expo-audio, zustand

## Статус міграції на Tailwind

| Файл | Статус | Залишкові inline styles |
|------|--------|------------------------|
| `app/editor.tsx` | ✅ Повністю | 0 |
| `app/scene-editor.tsx` | ✅ Повністю | 0 |
| `app/save-load.tsx` | ✅ Повністю | 0 |
| `app/tabs/index.tsx` | ✅ Повністю | 0 |
| `app/node-editor.tsx` | Повністю | Тільки динамічні стилі |
| `components/node-editor/SceneEditorPanel.tsx` | ✅ Повністю | 0 (стилі видалено) |
| `components/block-editor/BlockCard.tsx` | ✅ Повністю | 0 |
| `components/block-editor/BlockConfigPanel.tsx` | ✅ Повністю | 0 |
| `components/scene-editor/EditTab.tsx` | 🗑 Видалено | — |

## Рекомендація
> **Не об'єднувати.** Кожна система обслуговує свій домен. Стандартизувати лише інтерфейс (публічний API hooks), а не реалізацію.

Якщо в майбутньому буде потреба — можна створити єдиний Zustand store з slices на кшталт Redux Toolkit, але зараз це over-engineering.