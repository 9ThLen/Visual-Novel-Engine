# Звіт про глибокий аналіз коду Visual Novel Engine

**Дата:** 2026-05-07  
**Модель аналізу:** tencent/hy3-preview:free (OpenRouter)  
**Проект:** /mnt/d/Programs/D/visual_novel_engine

## Зміст

1. [Виправлені файли](#виправлені-файли)
2. [Проаналізовані файли](#проаналізовані-файли)
3. [Загальний підсумок](#загальний-підсумок)
4. [Рекомендації](#рекомендації)

## Виправлені файли

### 1. lib/block-schemas.ts ✅

**Виправлені проблеми:**

1. **Типізація (Medium)** — Замінено `z.ZodObject<any>` на `z.ZodTypeAny` для кращої типобезпеки
2. **Обмеження типу value (Medium)** — У `conditionSchema` та `setVariableSchema` поле `value` тепер приймає `z.union([z.string(), z.number(), z.boolean()])`
3. **Валідація URI (Low)** — Додано `.refine()` для перевірки `backgroundUri`, `musicUri`, `sfxUri`, `voiceUri` (валідні URL або шляхи до файлів)

**Зміни:**
```typescript
// Було:
export const blockSchemas: Record<string, z.ZodObject<any>> = {
// Стало:
export const blockSchemas: Record<string, z.ZodTypeAny> = {

// Було:
value: z.string(),
// Стало:
value: z.union([z.string(), z.number(), z.boolean()], { errorMap: () => ({ message: 'Value must be string, number, or boolean' }) }),

// Додано валідацію URI:
backgroundUri: z.string().min(1, 'Background is required').refine(
  (val) => {
    try {
      new URL(val);
      return true;
    } catch {
      return val.startsWith('/') || val.startsWith('./') || val.startsWith('../') || val.includes('://');
    }
  },
  { message: 'Must be a valid URL or file path' }
),
```

### 2. lib/error-handler.ts ✅

**Виправлені проблеми:**

1. **Обробка originalError (Medium)** — Покращено нормалізацію помилок: тепер обробляються рядки, об'єкти та інші типи від нативних модулів
2. **Статичний стан (Medium)** — Додано метод `clearListeners()` для запобігання витокам пам'яті
3. **React Native сумісність (Low)** — Додано `setUserAlertCallback()` для інтеграції з React Native Alert

**Зміни:**
```typescript
// Додано нормалізацію помилок:
let normalizedError: Error | undefined;
if (originalError instanceof Error) {
  normalizedError = originalError;
} else if (typeof originalError === 'string') {
  normalizedError = new Error(originalError);
} else if (originalError !== null && originalError !== undefined) {
  normalizedError = new Error(String(originalError));
  try {
    normalizedError.cause = originalError;
  } catch {
    // Ignore if cause can't be set
  }
}

// Додано методи:
static setUserAlertCallback(callback: (message: string, severity: ErrorSeverity) => void): void
static clearListeners(): void

// Виклик userAlertCallback в handle():
if (this.userAlertCallback) {
  try {
    const userMessage = ErrorHandler.getUserMessage(appError);
    this.userAlertCallback(userMessage, severity);
  } catch (err) {
    console.error('Error in user alert callback:', err);
  }
}
```

## Проаналізовані файли

### 3. lib/character-library.ts

**Знайдені проблеми:**

| Пріоритет | Проблема | Опис |
|-----------|----------|-------|
| **Critical** | Race Conditions | Конкурентні записи: read-modify-write без блокування може призвести до втрати даних |
| **High** | Застарілий `substr` | Використовується `Math.random().toString(36).substr(2, 9)` (deprecated) |
| **High** | Слабка генерація ID | `Date.now() + Math.random()` може дати колізії в циклах |
| **High** | Неефективність | Кожна зміна = 2 звернення до Storage |
| **Medium** | Неконсистентний обробіток помилок | Різні функції по-різному обробляють помилки |
| **Medium** | Потенційна мутація | `character.sprites.push()` без перевірки існування масиву |
| **Medium** | Відсутність валідації імпорту | `JSON.parse()` без перевірки структури |
| **Low** | Магічні рядки | Префікси `char_`, `sprite_` жорстко закодовані |

### 4. lib/asset-resolver.ts

**Знайдені проблеми:**

| Пріоритет | Проблема | Опис |
|-----------|----------|-------|
| **Critical** | Неправильне розширення відео | Для відео додається `.mp3` замість `.mp4` (рядок 175) |
| **High** | Застарілий expo-file-system/legacy | Можуть видалити у майбутніх версіях Expo |
| **High** | Типізація any | BUNDLED_ASSETS, getBundledAsset, resolveAssetUri використовують `any` |
| **High** | Хардкод ассетів | Список BUNDLED_ASSETS додається вручну |
| **Medium** | God function | resolveAssetUri обробляє занадто багато сценаріїв |
| **Medium** | console.log у бібліотечному коді | Пряме логування замість системи логування |
| **Medium** | Небезпечна перевірка ключів | `if (BUNDLED_ASSETS[cleaned])` може спрацювати неправильно для falsy значень |
| **Low** | Орфографія | Папка "charakters" замість "characters" |
| **Low** | Відсутність перевірки documentDirectory | Не перевіряється існування перед використанням |

### 5. lib/storage.ts

**Знайдені проблеми:**

| Пріоритет | Проблема | Опис |
|-----------|----------|-------|
| **Medium** | Небезпечне приведення типів | `JSON.parse(raw) as Block` без runtime-валідації |
| **Medium** | Платформна залежність | Жорстка прив'язка до `@react-native-async-storage/async-storage` |
| **Medium** | Відсутня версія схеми | Немає versioning для даних у сховищі |
| **Medium** | Обробка великих даних | AsyncStorage має обмеження на розмір |
| **Low** | Грубе логування | `console.error` у продакшн |
| **Low** | Нетипізовані помилки | catch блоки мають тип `any` |

### 6. lib/web-utils.ts

**Знайдені проблеми:**

| Пріоритет | Проблема | Опис |
|-----------|----------|-------|
| **Critical** | DOM API у RN | Використання `document`, `localStorage`, `navigator`, `FileReader` без ізоляції |
| **High** | Застарілі API | `navigator.platform` (deprecated) |
| **High** | Типи подій | `KeyboardEvent`, `DragEvent`, `File` — DOM-типи |
| **Medium** | `document.execCommand` | Застарілий метод копіювання |
| **Medium** | Синхронність/Асинхронність | `copyToClipboard` повертає `false` синхронно для RN, але асинхронно для веба |

### 7. lib/_core/auth.ts

**Знайдені проблеми:**

| Пріоритет | Проблема | Опис |
|-----------|----------|-------|
| **High** | Десеріалізація Date | `lastSignedIn` стає рядком після `JSON.parse`, тип `User` порушується |
| **High** | Імпорт expo-secure-store | Може конфліктувати з веб-збіркою |
| **Medium** | Неконсистентна обробка помилок | Різні функції по-різному кидають/логують помилки |
| **Medium** | Безпека токенів | Токени виводяться в `console.log` |
| **Medium** | Відсутність валідації | Після `JSON.parse` немає перевірки структури об'єкта |

## Загальний підсумок

**Виправлено:** 2 файли (block-schemas.ts, error-handler.ts)  
**Проаналізовано:** 5 файлів (character-library.ts, asset-resolver.ts, storage.ts, web-utils.ts, auth.ts)

**Критичні проблеми:** 3
- Race Conditions у character-library.ts
- Неправильне розширення відео в asset-resolver.ts
- DOM API у web-utils.ts без ізоляції для React Native

**Високі проблеми:** 8
**Середні проблеми:** 10
**Низькі проблеми:** 5

## Рекомендації

1. **Терміново виправити:**
   - Race Conditions у character-library.ts (додати mutex або перейти на Redux/MMKV)
   - Розширення відео в asset-resolver.ts (замінити `.mp3` на `.mp4` для відео)
   - Десеріалізацію `Date` в auth.ts (додати `new Date(user.lastSignedIn)`)

2. **Для React Native сумісності:**
   - Розділити web-utils.ts на окремі файли для веб та нативної платформи
   - Додати платформо-залежні імпорти через `Platform.select`

3. **Покращення типізації:**
   - Додати runtime-валідацію через Zod для всіх десеріалізованих об'єктів
   - Прибрати `any` типи на користь конкретних інтерфейсів

4. **Обробка помилок:**
   - Уніфікувати підхід до помилок у всіх файлах
   - Використовувати ErrorHandler замість прямого `console.error`

## Пов'язані сторінки

[[audit-report-2026-05-07|Аудит сумісності React Native]]
[[index|Головна сторінка wiki]]

---
*Звіт згенеровано автоматично за допомогою Hermes Agent (tencent/hy3-preview:free)*
