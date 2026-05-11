# Виправлення runtime-помилок — 2026-05-09

**Дата:** 2026-05-09  
**Статус:** Завершено ✅  
**Пріоритет:** Критично

## Контекст

Після успішної збірки проекту (Metro працює, бандл генерується), додаток не відображав нічого і видавав помилку при запуску. Діагностика виявила декілька критичних помилок.

## Знайдені та виправлені помилки

### 1. Подвійні коми в `AsyncStorage.setItem()` — `lib/story-context.tsx`

**Проблема:** 6 місць мали синтаксичну помилку `AsyncStorage.setItem(KEY, , JSON.stringify(...))` — зайва кома між аргументами.

**Рядки:** 215, 267, 334, 350, 372, 383

**Виправлення:** Видалено зайві коми:
```typescript
// БУЛО (помилка):
AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, , JSON.stringify(updatedSlots))
// СТАЛО:
AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, JSON.stringify(updatedSlots))
```

**Наслідки:** Без цього виправлення Babel не міг розпарсити файл — SyntaxError на рівні імпорту.

### 2. Подвійні номери рядків у `lib/story-context.tsx`

**Проблема:** Кожен рядок файлу мав дубльовані номери: `1|     1|import React...` замість `import React...`. Файл був пошкоджений — імовірно, результат подвійного запису з номерами рядків.

**Помилка при запуску:**
```
SyntaxError: `import` can only be used in `import()` or `import.meta`. (1:7)
```

**Виправлення:** Очищено файл від усіх вбудованих номерів рядків. Файл переписано з чистим кодом.

### 3. Відсутній `useState` для `isInitialized` — `app/tabs/index.tsx`

**Проблема:** Змінна `isInitialized` використовувалась у рендері (рядок 145: `if (!isInitialized)`), але не була оголошена через `useState`.

**Виправлення:** Додано:
```typescript
const [isInitialized, setIsInitialized] = useState(false);
```

### 4. Зламаний симлінк `node_modules/expo-asset`

**Проблема:** pnpm на WSL/NTFS створив символічне посилання `node_modules/expo-asset` на неіснуючу директорію. Ціль симлінку містила неправильний хеш імені (відсутній `metro-co` сегмент).

**Помилка при запуску Metro:**
```
PluginError: Failed to resolve plugin for module "expo-asset" relative to "/mnt/d/Programs/D/visual_novel_engine". Do you have node modules installed?
```

**Виправлення:** Перестворено симлінк з правильним шляхом:
```bash
rm node_modules/expo-asset
ln -s .pnpm/expo-asset@12.0.13_..._metro-co_.../node_modules/expo-asset expo-asset
```

## Результати перевірки

| Перевірка | Результат |
|-----------|-----------|
| Тести Vitest | ✅ 219/219 проходять (16 файлів) |
| Бандл Android | ✅ 13,121,437 байт (без помилок) |
| Бандл Web | ✅ 9,940,316 байт (без помилок) |
| Усі `@/` імпорти | ✅ 57 файлів перевірено, всі резолвляться |
| Файли з подвійними номерами | ✅ Жодного не знайдено |
| Metro сервер | ✅ Працює на порту 8081 |

## Що залишилось перевірити

Ці перевірки потребують реального пристрою/емулятора:

- [ ] **Canvas** — перетягування атомів, магнітне притягування
- [ ] **Timeline** — додавання подій, реорганізація
- [ ] **Graph** — візуалізація графу сюжету
- [ ] **Збереження/завантаження** — через AsyncStorage
- [ ] **Runtime-помилки** — при реальному використанні

**Рекомендація:** Запустити `npx expo start --tunnel` і підключитись через Expo Go на телефоні.

### 5. Відсутній плагін Reanimated у babel.config.cjs (виявлено користувачем)

**Проблема:** У `babel.config.cjs` не було підключено `react-native-reanimated/plugin`. LEGO Editor активно використовує складні анімації та drag-and-drop через Reanimated. Без цього плагіна додаток "тихо" падав (crash) ще до того, як міг показати інтерфейс — білий екран.

**Виправлення:** Додано плагін у babel.config.cjs:
```javascript
plugins.push("react-native-reanimated/plugin");
plugins.push("react-native-worklets/plugin");
```

### 6. Неправильне розташування файлу lego-editor.tsx (виявлено користувачем)

**Проблема:** Файл `lego-editor.tsx` знаходився в корені `app/`, але Expo Router шукав його всередині `app/tabs/` (як частину нижнього меню). Через це вкладка LEGO не рендерилась.

**Виправлення:** Переміщено файл:
```
app/lego-editor.tsx → app/tabs/lego-editor.tsx
```

### 7. Застарілі unstable_settings у _layout.tsx (виявлено користувачем)

**Проблема:** `unstable_settings` з `anchor: "tabs"` конфліктували з новим маршрутизацією після переміщення `lego-editor.tsx`.

**Виправлення:** Видалено `export const unstable_settings` з `app/_layout.tsx`.

## Файли змінено

| Файл | Тип зміни |
|------|-----------|
| `lib/story-context.tsx` | Виправлено подвійні коми (6 місць), очищено номери рядків |
| `app/tabs/index.tsx` | Додано `useState` для `isInitialized` |
| `node_modules/expo-asset` | Перестворено симлінк |
| `babel.config.cjs` | Додано `react-native-reanimated/plugin` та `react-native-worklets/plugin` |
| `app/lego-editor.tsx` | Переміщено в `app/tabs/lego-editor.tsx` |
| `app/_layout.tsx` | Видалено `unstable_settings` |

## Пов'язані сторінки
- [[PNPM_WINDOWS_CMD_WRAPPERS_FIX|Виправлення pnpm на Windows — .cmd wrappers (споріднена проблема з pnpm)]]
- [[next-session-plan-2026-05-09|План на сесію 2026-05-09]]
- [[next-session-plan-2026-05-10|План на сесію 2026-05-10]]
- [[CHANGELOG_2026_05_09|Журнал змін 2026-05-09]]
- [[log|Журнал подій]]
- [[index|Головна сторінка Wiki]]
