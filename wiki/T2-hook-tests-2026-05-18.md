# T2 — Тести для хуків (2026-05-18)

## Мета

Покрити тестами всі хуки додатку. До T2 були тести тільки для `useReaderAudio`, `useReaderInitialization`, `useResponsiveLayout`.

## Створені тести

| Файл | Хук | Тестів |
|------|-----|--------|
| `useColors.test.ts` | `useColors` | 7 |
| `useColorScheme.test.ts` | `useColorScheme` | 2 |
| `useAutoSave.test.ts` | `useAutoSave` | 8 |
| `useKeyboardShortcuts.test.ts` | `useKeyboardShortcuts`, `useSaveShortcut`, `useEscapeKey`, `COMMON_SHORTCUTS` | 16 |
| `useFilePicker.test.ts` | `useFilePicker` | 7 |
| `usePagination.test.ts` | `usePagination`, `useInfiniteScroll`, `useSearchablePagination`, `useSortablePagination` | 22 |

**Загало́м нових тестів: 62**

## Покриття хуків

### ✅ Покриті тестами (10 хуків)
- `useColors` — кольорова система, backward compat aliases
- `useColorScheme` — темна/світла тема
- `useAutoSave` — автозбереження з таймером 2с
- `useKeyboardShortcuts` — клавіатурні скорочення (Ctrl+S, Escape, Shift+key)
- `useFilePicker` — вибір файлів (image/audio)
- `usePagination` — пагінація з навігацією
- `useInfiniteScroll` — нескінченний скрол
- `useSearchablePagination` — пошук + пагінація
- `useSortablePagination` — сортування + пагінація
- `useReaderAudio` — аудіо менеджер (вже був)
- `useReaderInitialization` — ініціалізація рідера (вже був)
- `useResponsiveLayout` — responsive layout (вже був)

### ⏳ Без тестів (6 хуків — потребують інтеграційного тестування)
- `useAuth` — потребує мокання API + AsyncStorage
- `useSceneData` — потребує мокання character library
- `useSceneEditorActions` — потребує мокання story context + router
- `useSceneEditorMedia` — потребує мокання expo-image-picker
- `useCharacterLibrary` — потребує мокання API
- Lego hooks (`useSceneManagement`, `useLegoTabs`, `useLegoDnD`) — потребують Zustand store

## Патерни тестування

### Мокання react-native
```typescript
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  useWindowDimensions: vi.fn(),
}));
```

### Мокання залежностей через vi.mock
```typescript
vi.mock('../../lib/theme-provider', () => ({
  useThemeContext: () => ({ colorScheme: 'dark', colors: mockColors }),
}));
```

### Тестування таймерів (useAutoSave)
```typescript
vi.useFakeTimers();
act(() => { vi.advanceTimersByTime(2000); });
expect(onAutoSave).toHaveBeenCalledTimes(1);
```

### Тестування клавіатурних подій
```typescript
window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
```

## TypeScript

Всі помилки лінтера — існуючі проблеми з node_modules (react-native type conflicts, vite, vitest).
Нові тести не вносять нових помилок TypeScript.

## Пов'язані сторінки

- [[T1-component-tests-2026-05-18|T1 — Тести для компонентів]]
- [[T3-integration-tests-2026-05-18|T3 — Інтеграційні тести]]
- [[wiki/index.md|Головна вікі]]
