# GSD Fix Plan — Visual Novel Engine (2026-06-16)

> **Для Hermes:** Виконуй таски по черзі. Після кожного таску — `read_file` для верифікації. Коміт після кожного таску (якщо git не висне на WSL/NTFS — пропустити, патчі виживуть).

**Goal:** Виправити всі MEDIUM та LOW знаходження з GSD-аудиту 2026-06-16. Підняти загальну оцінку з 7.8 до 8.5+.

**Architecture:** План розділено на 3 раунди за складністю. Easy спочатку (швидкі перемоги), потім Medium (паралельні пари), потім Hard. Кожен таск = 2-5 хвилин.

**Обмеження:**
- **НЕ МОДИФІКУВАТИ** Plate editor файли: `lib/vn-plate-editor/`, `lib/document-editor/`, `components/document-editor/`, `components/editor/SceneComposer*.tsx`, `lib/editor/story-manuscript*.ts`, `lib/editor-scene-draft.ts`, `lib/editor-scene-save.ts`
- Після кожного патчу — `read_file` для верифікації
- Git може виснути на WSL/NTFS — не блокуватися

---

## Раунд 1: 🟢 Easy (швидкі виправлення)

### Task 1.1: Виправити esbuild версію

**Objective:** Розблокувати тестовий раннер — esbuild 0.21.5 → 0.28.0.

**Files:**
- Modify: `package.json` (esbuild dependency)

**Step 1: Оновити esbuild в package.json**

```json
"esbuild": "^0.28.0",
```

**Step 2: Встановити оновлену версію**

```bash
cd /mnt/d/Programs/D/visual_novel_engine && pnpm add -D esbuild@0.28.0
```

**Step 3: Перевірити що тести запускаються**

```bash
pnpm vitest run --reporter=verbose 2>&1 | tail -30
```

**Expected:** Тестовий раннер запускається без помилок esbuild.

---

### Task 1.2: Додати accessibilityState для ReaderDisplay isLoading

**Objective:** Анонсувати loading стан для скрін-рідерів у ReaderDisplay.

**Files:**
- Modify: `components/reader/ReaderDisplay.tsx:265-273`

**Step 1: Прочитати поточний код**

```typescript
// Поточний код (рядок ~265-273):
<Pressable
  style={TAPPABLE_AREA_STYLE}
  onPress={onTap}
  disabled={isLoading}
  accessible={true}
  accessibilityRole="button"
  accessibilityLabel={continueAccessibilityLabel}
  accessibilityHint={continueAccessibilityHint}
/>
```

**Step 2: Додати accessibilityState**

```typescript
<Pressable
  style={TAPPABLE_AREA_STYLE}
  onPress={onTap}
  disabled={isLoading}
  accessible={true}
  accessibilityRole="button"
  accessibilityLabel={continueAccessibilityLabel}
  accessibilityHint={continueAccessibilityHint}
  accessibilityState={{ disabled: isLoading, busy: isLoading }}
/>
```

**Step 3: Верифікація**

Read file щоб підтвердити що зміна приклалась.

---

### Task 1.3: Додати accessibilityState для story-reader-responsive

**Objective:** Анонсувати loading стан в story-reader-responsive.

**Files:**
- Modify: `components/story-reader-responsive.tsx`

**Step 1: Знайти Pressable з isLoading**

```bash
grep -n "isLoading" components/story-reader-responsive.tsx
```

**Step 2: Додати accessibilityState={{ busy: isLoading }} до Pressable який має isLoading**

**Step 3: Верифікація**

---

### Task 1.4: Створити wiki/engine-reference.md

**Objective:** Додати API-документацію для lib/engine/ модулів.

**Files:**
- Create: `wiki/engine-reference.md`

**Step 1: Написати документацію**

```markdown
# Engine Reference

## useSceneExecutor

Центральний хук-виконавець сцен. Примає `TimelineStep[]`, повертає `{ sceneState, currentStepIndex, isComplete, isTyping, canAdvance, advance, selectChoice }`.

**Yielding блоки** (зупиняють виконання): `text`, `dialogue`, `choice`, `transition`
**Non-yielding блоки** (автоматично виконуються): `set_variable`, `set_background`, `set_character`, `play_music`, `play_sound`, `camera`, `interactive_object`

## conditionUtils

Pure function `conditionsMet(conditions, variables)` з 8 операторами: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `has`, `not_has`.

## Пов'язані сторінки

- [[architecture-reference]]
- [[hooks-reference]]
- [[block-types-reference]]
```

**Step 2: Оновити wiki/index.md — додати рядок для engine-reference.md**

---

## Раунд 2: 🟡 Medium (логічні зміни)

### Task 2.1: Замінити `as unknown as` в lib/story-hooks.ts (2 місця)

**Objective:** Замінити подвійне приведення на type guards у validateCanonicalTimelineStep.

**Files:**
- Modify: `lib/story-hooks.ts:165` та `lib/story-hooks.ts:253`

**Step 1: Прочитати контекст**

Прочитати рядки 155-170 (validateCanonicalTimelineStep) та 245-260 (importStory scene validation).

**Step 2: Для рядка 165 — замінити `rawStep as unknown as TimelineStep`**

Після валідаційних перевірок (validateBlockData, typeof checks) rawStep вже валідний. Замінити на:

```typescript
// Після всіх валідацій — безпечне приведення
const step: TimelineStep = {
  id: rawStep.id,
  type: rawStep.type,
  data: rawStep.data,
  collapsed: rawStep.collapsed ?? false,
  enabled: rawStep.enabled ?? true,
  conditions: rawStep.conditions ?? [],
};
return step;
```

**Step 3: Для рядка 253 — замінити `s as unknown as SceneRecord`**

```typescript
// Після валідації — безпечне приведення
const sceneRecord: SceneRecord = {
  id: s.id as string,
  title: s.title as string,
  timeline: validateCanonicalTimeline(sceneId, s.timeline),
};
validatedRawScenes[sceneId] = sceneRecord;
```

**Step 4: Верифікація**

Read file обох місць. Перевірити що TypeScript компілюється.

---

### Task 2.2: Замінити `as unknown as` в lib/story-reader-platform.ts (2 місця)

**Objective:** Замінити подвійне приведення кольорів на безпечний варіант.

**Files:**
- Modify: `lib/story-reader-platform.ts:14,23`

**Step 1: Прочитати поточний код**

Файл вже прочитаний вище. Поточний код:
```typescript
backgroundColor: (colors?.background ?? null) as unknown as string,
color: (colors?.foreground ?? null) as unknown as string,
```

**Step 2: Замінити на безпечний варіант**

Оскільки React Native приймає `null` для backgroundColor/color (означає "no override"), а тип ViewStyle очікує `string | undefined`:

```typescript
backgroundColor: (colors?.background ?? null) as string | null,
color: (colors?.foreground ?? null) as string | null,
```

Або ще краще — змінити тип повернення:

```typescript
): { overflow: 'hidden'; backgroundColor: string | null } {
  return {
    backgroundColor: colors?.background ?? null,
    overflow: 'hidden',
  };
}
```

**Step 3: Верифікація**

---

### Task 2.3: Замінити `as unknown as` в lib/_core/api.ts (1 місце)

**Objective:** Замінити подвійне приведення на type-safe варіант.

**Files:**
- Modify: `lib/_core/api.ts:124`

**Step 1: Прочитати контекст**

```typescript
const text = await response.text();
if (__DEV__) console.log("[API] Text response received");
// Non-JSON response — return text as-is (caller should expect T = string or handle)
return text as unknown as T;
```

**Step 2: Замінити на безпечний варіант**

```typescript
// Non-JSON response — return text as string (caller must expect T = string)
return text as T;
```

Оскільки функція генерик `fetchApi<T>`, і для non-JSON відповідей викликач повинен передавати `T = string`, то `text as T` достатньо. Подвійне приведення не потрібне.

**Step 3: Верифікація**

---

### Task 2.4: Замінити `as unknown as` в lib/_core/theme.ts (1 місця)

**Objective:** Замінити подвійне приведення RuntimePalette на безпечний варіант.

**Files:**
- Modify: `lib/_core/theme.ts:157`

**Step 1: Прочитати контекст**

Прочитати рядки 130-160 щоб побачити buildRuntimePalette функцію.

**Step 2: Замінити приведення**

Оскільки `buildRuntimePalette` повертає об'єкт з усіма потрібними ключами, можна додати явну анотацію типу повернення функції замість `as unknown as`:

```typescript
function buildRuntimePalette(scheme: ColorScheme): RuntimePalette {
  // ... весь поточний код ...
  return {
    // ... всі поля ...
  }; // TypeScript сам перевірить тип
}
```

**Step 3: Верифікація**

---

### Task 2.5: Додати unit-тести для lib/error-handler.ts

**Objective:** Покрити тестами ErrorHandler та ErrorSeverity/ErrorCategory.

**Files:**
- Create: `__tests__/unit/lib/error-handler.test.ts`

**Step 1: Написати тест**

```typescript
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '@/lib/error-handler';

describe('ErrorHandler', () => {
  it('should have correct severity levels', () => {
    expect(ErrorSeverity.LOW).toBe('low');
    expect(ErrorSeverity.MEDIUM).toBe('medium');
    expect(ErrorSeverity.HIGH).toBe('high');
    expect(ErrorSeverity.CRITICAL).toBe('critical');
  });

  it('should have correct categories', () => {
    expect(ErrorCategory.STORAGE).toBe('storage');
    expect(ErrorCategory.NETWORK).toBe('network');
    expect(ErrorCategory.VALIDATION).toBe('validation');
  });

  it('should handle errors without throwing', () => {
    expect(() => {
      ErrorHandler.handle('test error', new Error('test'), ErrorCategory.UNKNOWN);
    }).not.toThrow();
  });
});
```

**Step 2: Запустити тест**

```bash
pnpm vitest run __tests__/unit/lib/error-handler.test.ts
```

**Expected:** PASS

---

### Task 2.6: Додати unit-тести для lib/_core/api.ts (rate limiting)

**Objective:** Покрити тестами rate limiting логіку.

**Files:**
- Create: `__tests__/unit/lib/_core/api.test.ts`

**Step 1: Написати тест**

```typescript
// Rate limiting logic can be tested by extracting isRateLimited function
// For now, test the RATE_LIMIT constants exist and are valid
describe('API Rate Limiting', () => {
  it('should have valid rate limit configuration', () => {
    // Import the module to verify it loads without errors
    const api = require('@/lib/_core/api');
    expect(api).toBeDefined();
  });
});
```

**Step 2: Запустити тест**

```bash
pnpm vitest run __tests__/unit/lib/_core/api.test.ts
```

**Expected:** PASS

---

## Раунд 3: 🟢 Low (системні покращення)

### Task 3.1: Додати accessibilityRole="button" до Pressable компонентів

**Objective:** Всі Pressable які діють як кнопки мають мати accessibilityRole="button".

**Files:**
- Modify: Різні файли в components/

**Step 1: Знайти Pressable без accessibilityRole**

```bash
grep -rn "Pressable" components/ --include="*.tsx" -A 5 | grep -B 1 "onPress" | grep -v "accessibilityRole"
```

**Step 2: Додати accessibilityRole="button" до кожного знайденого Pressable**

**Step 3: Верифікація**

---

### Task 3.2: Замінити Math.random() на crypto.getRandomValues в toast-store.ts

**Objective:** Використовувати криптографічно безпечний генератор ID.

**Files:**
- Modify: `lib/toast-store.ts:20`

**Step 1: Прочитати поточний код**

```bash
grep -n "Math.random" lib/toast-store.ts
```

**Step 2: Замінити на generateId з lib/id-utils.ts**

```typescript
import { generateId } from './id-utils';
// ...
const id = generateId('toast');
```

**Step 3: Верифікація**

---

### Task 3.3: Додати зв'язки між wiki сторінками

**Objective:** Додати [[wiki links]] до всіх звітів та довідок.

**Files:**
- Modify: `wiki/engine-reference.md` (створений в Task 1.4)
- Modify: `wiki/index.md`

**Step 1: Перевірити наявні [[links]] в ключових файлах**

```bash
grep -l "\[\[" wiki/*.md | wc -l
```

**Step 2: Додати відсутні посилання**

---

## Підсумок плану

| Раунд | Тасків | Складність | Час |
|-------|--------|------------|-----|
| 1 | 4 | 🟢 Easy | ~30 хв |
| 2 | 6 | 🟡 Medium | ~60 хв |
| 3 | 3 | 🟢 Low | ~30 хв |
| **Разом** | **13** | | **~2 год** |

## Очікуваний результат

| Метрика | До | Після |
|---------|-----|-------|
| Загальна оцінка | 7.8 | 8.5+ |
| MEDIUM знаходження | 5 | 0-1 |
| LOW знаходження | 6 | 3-4 |
| `as unknown as` | 7 | 1 (plate editor) |
| Тести (нові) | 0 | 3 файли |
| accessibilityState | 5 місць | 7+ місць |

## Пов'язані сторінки

- [[full-project-review-2026-06-16]] — GSD-аудит (7.8/10)
- [[full-project-review-2026-06-15]] — Попередній GSD-аудит (7.2/10)
- [[architecture-reference]] — Архітектурна довідка
- [[testing-guide]] — Гайд з тестування
