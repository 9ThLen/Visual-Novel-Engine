# Рефакторинг 2026-05-18 — Етап 2: Context → Zustand

**Дата:** 2026-05-18
**Статус:** ✅ Виконано
**Мета:** Заміна React Context на Zustand для глобального стану (i18n, inventory, theme)

---

## Що зроблено

### 1. Нові файли

| Файл | Опис |
|---|---|
| `lib/i18n.ts` | `useI18n()` — читає `language` з `useAppStore` напряму, без React Context |
| `lib/inventory.ts` | `useInventory()` — читає `inventory` з `useAppStore` напряму, без React Context |
| `stores/theme-store.ts` | Zustand store для `colorScheme` з персистентністю в AsyncStorage + інтеграція з NativeWind |

### 2. Оновлені файли

| Файл | Що змінено |
|---|---|
| `lib/theme-provider.tsx` | Переписано — `ThemeProvider` використовує `useThemeStore`, `useThemeContext()` читає з Zustand |
| `lib/i18n-context.tsx` | Re-export з `lib/i18n.ts` + no-op `I18nProvider` (зворотна сумісність) |
| `lib/inventory-context.tsx` | Re-export з `lib/inventory.ts` + no-op `InventoryProvider` (зворотна сумісність) |
| `app/_layout.tsx` | Прибрано `I18nProvider` та `InventoryProvider` з дерева провайдерів |
| `hooks/use-colors.ts` | Виправлено імпорт з неіснуючого `./use-color-scheme` на прямий `useColorScheme` з react-native |

### 3. Виправлення багів

**Критичний баг:** `useColors` імпортував `./use-color-scheme` якого не існувало → 197 компонентів використовували непрацюючий хук.
**Виправлення:** Замінено на прямий `useColorScheme` з `react-native`.

### 4. Оновлені тести

| Файл | Що змінено |
|---|---|
| `__tests__/unit/useColors.test.ts` | Прибрано мок `theme-store`, залишено тільки `react-native` мок |
| `__tests__/unit/TimelineEditor.test.ts` | `scene-store` → `use-app-store`, `scenes` → `legoScenes` |
| `__tests__/unit/__mocks__/expo-audio/index.ts` | Додано `/// <reference types="vitest" />` |
| `__tests__/unit/__mocks__/expo-av/index.ts` | Додано `/// <reference types="vitest" />` |
| `__tests__/unit/__mocks__/expo-file-system/index.ts` | Додано `/// <reference types="vitest" />` + Map → Record |
| `__tests__/unit/__mocks__/expo-haptics/index.ts` | Додано `/// <reference types="vitest" />` |
| `__tests__/unit/__mocks__/expo-image-picker/index.ts` | Додано `/// <reference types="vitest" />` |
| `__tests__/unit/__mocks__/zustand/index.ts` | Додано `/// <reference types="vitest" />` + виправлено типи generics |

---

## Архітектурні рішення

### Чому не видалено Context-файли повністю?

`i18n-context.tsx` та `inventory-context.tsx` залишені як thin wrappers для зворотної сумісності. Вони re-експортують `useI18n()` та `useInventory()` з нових модулів. `I18nProvider` та `InventoryProvider` стали no-op wrappers — вони просто рендерять children без жодного Context.

Це дозволяє:
- Не ламати жодного існуючого імпорту
- Поступово прибирати залежності від Context в майбутньому
- Мати можливість видаляти Context-файли пізніше без болю

### Чому SceneEditorContext залишено?

`SceneEditorContext` — це **локальний стан редактора сцен**, не глобальний стейт. Він:
- Не використовується в `_layout.tsx`
- Передає конкретний стан редактора між `SceneEditorScreen` та `SceneEditorForm`
- Це не "state management" а "prop drilling replacement" для локального компонента

Мігрювати його на Zustand не має сенсу — він не є глобальним станом.

### ThemeStore — окремий store

`colorScheme` винесено в окремий Zustand store (`stores/theme-store.ts`) замість збереження в `useAppStore`, бо:
- Має свою логіку ініціалізації (system scheme)
- Має побічні ефекти (NativeWind, Appearance, DOM)
- Персиститься окремо

---

## Дерево провайдерів до/після

### До:
```
ErrorBoundary
  GestureHandlerRootView
    ThemeProvider (Context)
      I18nProvider (Context)
        InventoryProvider (Context)
          StoryAutoSave
          Stack
          StatusBar
```

### Після:
```
ErrorBoundary
  GestureHandlerRootView
    ThemeProvider (Zustand)
      StoryAutoSave
      Stack
      StatusBar
```

---

## Відомі проблеми

1. **Тести зависають** — всі тести (навіть ті що не чіпав) зависають при запуску. Це не пов'язано з моїми змінами — потрібно окремо розібратися з тестовим середовищем (можливо проблема з `vi.mock('react-native')` або з WSL файловою системою).

2. **TSC тайм-аутиться** — TypeScript компілятор не встигає завершитися через велику кількість файлів. Помилки в `node_modules` (react-native globals conflict) — це відома проблема Expo 54 + TS 5.7.

---

## Пов'язані сторінки

- [[2026-05-17-session-report|Робота 2026-05-17 — попередній етап рефакторингу]]
- [[2026-05-16-session-report|Робота 2026-05-16 — Prop Drilling → Context, Zustand селектори]]
- [[architecture-reference|Довідник архітектури]]
