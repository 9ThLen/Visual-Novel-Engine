# VNE Critical Issues Fix Plan

> **Для виконавця:** Використовуй цей план задача-по-задачі. Кожна задача = 2-5 хвилин. Коміт після кожної задачі. Перевіряй `npx tsc --noExit` після кожної зміни.

**Goal:** Виправити всі знайдені проблеми з ревізії: OAuth C-1, Math.random IDs, deprecated barrel imports, console.log cleanup, build-tailwind-theme-colors.js

**Architecture:** Мінімальні точкові зміни, без рефакторингу. Кожна задача — одне конкретне виправлення.

**Tech Stack:** TypeScript, React Native (Expo), Zustand, Web Crypto API

**Priority Order:**
1. P1-CRITICAL: OAuth C-1 (security)
2. P1-CRITICAL: Math.random IDs → crypto (security)
3. P2-HIGH: Deprecated barrel imports cleanup
4. P2-HIGH: story-reader-responsive.tsx import fix
5. P3-MEDIUM: console.log cleanup
6. P3-LOW: Remove orphaned build-tailwind-theme-colors.js

---

## P1-CRITICAL-1: OAuth callback — прибрати params.user з URL

**Ризик:** Зловмисник може підробити user дані в URL параметрі.

**Files:**
- Modify: `app/oauth/callback.tsx:35-49,190`

### Task P1.1: Замінити params.user на API виклик

**Objective:** Прибрати небезпечне декодування user info з URL, використати backend API.

**Files:**
- Modify: `app/oauth/callback.tsx`

**Step 1: Прочитай поточний код**

Read `app/oauth/callback.tsoc.tsx` lines 30-55 та 185-195.

**Step 2: Замінити блок params.user**

Знайди та видали:
```typescript
if (params.user) {
  const userJson = typeof atob !== "undefined"
    ? atob(params.user)
    : Buffer.from(params.user, "base64").toString("utf-8");
  const userData = JSON.parse(userJson);
  const userInfo: Auth.User = {
    id: userData.id,
    openId: userData.openId,
    name: userData.name,
    email: userData.email,
    loginMethod: userData.loginMethod,
    lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
  };
  await Auth.setUserInfo(userInfo);
}
```

Замінити на:
```typescript
// Fetch user info from backend using the trusted sessionToken
try {
  const userInfo = await Api.getMe();
  if (userInfo) {
    await Auth.setUserInfo(userInfo);
  }
} catch (e) {
  // Non-fatal: user info will be empty, session token is still valid
  console.warn('[OAuth] Failed to fetch user info from API:', e);
}
```

Імпорт Api додати на початок файлу (якщо ще немає):
```typescript
import { Api } from '@/lib/_core/api';
```

**Step 3: Прибрати params.user з залежностей useEffect**

Знайди:
```typescript
}, [params.code, params.state, params.error, params.sessionToken, params.user, router]);
```

Замінити на:
```typescript
}, [params.code, params.state, params.error, params.sessionToken, router]);
```

**Step 4: Перевірити TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 5: Коміт**

```bash
git add app/oauth/callback.tsx
git commit -m "fix(security): CRITICAL C-1 — replace params.user URL decoding with Api.getMe() backend call"
```

---

## P1-CRITICAL-2: Замінити Math.random() на crypto.getRandomValues() в id-utils.ts

**Ризик:** Math.random() не є криптографічно безпечним, може давати передбачувані ID.

**Files:**
- Modify: `lib/id-utils.ts`

### Task P2.1: Рефакторинг generateId()

**Objective:** Замінити Math.random() на crypto.getRandomValues() для всіх ID-генераторів.

**Files:**
- Modify: `lib/id-utils.ts`

**Step 1: Прочитай поточний код**

Read `lib/id-utils.ts`.

**Step 2: Замінити весь файл**

Новий вміст:
```typescript
/**
 * Generate a cryptographically secure random ID.
 * Uses crypto.getRandomValues() with Math.random() fallback for environments without crypto.
 */

function getRandomBytes(length: number): string {
  // Use crypto.getRandomValues() if available (modern browsers, Node 19+, React Native with polyfill)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
  }
  // Fallback for older environments
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 36).toString(36);
  }
  return result;
}

export function generateId(prefix: string, length = 7): string {
  return `${prefix}_${Date.now()}_${getRandomBytes(length)}`;
}

export function generateAssetId(): string {
  return `asset_${Date.now()}_${getRandomBytes(6)}`;
}

export function generateStoryId(): string {
  return `story_${Date.now()}_${getRandomBytes(5)}`;
}
```

**Step 3: Перевірити TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Коміт**

```bash
git add lib/id-utils.ts
git commit -m "fix(security): replace Math.random() with crypto.getRandomValues() in id-utils"
```

---

## P2-HIGH-1: Прибрати імпорти з deprecated barrel lib/types.ts

**Objective:** Оновити імпорти в 3 файлах, які ще тягнуть legacy типи з lib/types.ts.

### Task P3.1: Оновити reader-runtime.ts

**Files:**
- Modify: `lib/reader-runtime.ts:13`

**Step 1: Знайди рядок**
```typescript
import type { PlaybackState, SaveSlot } from '@/lib/types';
```

**Step 2: Замінити на**
```typescript
import type { PlaybackState } from '@/lib/engine/types';
import type { SaveSlot } from '@/lib/story-domain';
```

**Step 3: Перевірити tsc, потім коміт**
```bash
npx tsc --noEmit
git add lib/reader-runtime.ts
git commit -m "refactor(types): import PlaybackState/SaveSlot from domain modules instead of lib/types barrel"
```

### Task P3.2: Оновити reader-launch.ts

**Files:**
- Modify: `lib/reader-launch.ts:1`

**Step 1: Знайди**
```typescript
import type { PlaybackState } from '@/lib/types';
```

**Step 2: Замінити на**
```typescript
import type { PlaybackState } from '@/lib/engine/types';
```

**Step 3: Перевірити tsc, потім коміт**

### Task P3.3: Оновити reader.tsx

**Files:**
- Modify: `app/reader.tsx:11`

**Step 1: Знайди**
```typescript
import { PlaybackState } from '@/lib/types';
```

**Step 2: Замінити на**
```typescript
import type { PlaybackState } from '@/lib/engine/types';
```

**Step 3: Перевірити tsc, потім коміт**

### Task P3.4: Оновити useReaderInitialization.ts

**Files:**
- Modify: `hooks/useReaderInitialization.ts:6`

**Step 1: Знайди**
```typescript
import type { PlaybackState } from '@/lib/types';
```

**Step 2: Замінити на**
```typescript
import type { PlaybackState } from '@/lib/engine/types';
```

**Step 3: Перевірити tsc, потім коміт**

---

## P2-HIGH-2: Замінити StoryScene/Choice imports з lib/types у story-reader-responsive.tsx

**Objective:** story-reader-responsive.tsx імпортує legacy StoryScene і Choice з lib/types.ts. Замінити на SceneRecord з engine/types.

### Task P4.1: Аналіз використання StoryScene/Choice у компоненті

**Files:**
- Read: `components/story-reader-responsive.tsx` — знайди всі використання StoryScene і Choice

**Step 1: Прочитай файл, знайди всі references до StoryScene та Choice**

```bash
grep -n "StoryScene\|Choice" components/story-reader-responsive.tsx
```

**Step 2: Визначи які поля StoryScene використовуються**
- Якщо використовуються `id`, `name`, `timeline`, `connections` — замінити на SceneRecord
- Якщо використовуються `choices` — перевірити, чи Choice[] приходить з timeline блоків

**Step 3: Оновити імпорт**

Було:
```typescript
import { StoryScene, Choice } from '@/lib/types';
```

Стане:
```typescript
import type { SceneRecord, TimelineStep } from '@/lib/engine/types';
```

**Step 4: Оновити типи в компоненті**
- Замінити `StoryScene` на `SceneRecord` всюди
- Замінити `Choice` на inline type або import з engine/types

**Step 5: Перевірити tsc, потім коміт**

---

## P3-MEDIUM-1: Почистити console.log/warn в lib/

**Objective:** Додати `__DEV__` guard до всіх console викликів в lib/, де його немає.

### Task P5.1: Оновити audio-player-service.ts

**Files:**
- Modify: `lib/audio-player-service.ts:29`

**Step 1: Знайди**
```typescript
console.log(`[AudioPlayerService] ${event}`, context ?? {});
```

**Step 2: Замінити на**
```typescript
if (__DEV__) console.log(`[AudioPlayerService] ${event}`, context ?? {});
```

**Step 3: Коміт**

### Task P5.2: Оновити story-manuscript-save.ts

**Files:**
- Modify: `lib/editor/story-manuscript-save.ts:77,84`

**Step 1: Знайди оба console.warn виклики**

**Step 2: Обгорнути якщо ще не обгорнуті**
```typescript
if (__DEV__) console.warn(...)
```

**Step 3: Коміт**

---

## P3-LOW-1: Видалити зайвий build-tailwind-theme-colors.js

**Objective:** Видалити файл, який не використовується ніде.

### Task P6.1: Видалення

**Step 1: Переконатися що нігде не імпортується**
```bash
grep -rn "build-tailwind" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json"
```

**Step 2: Видалити файл**
```bash
git rm lib/build-tailwind-theme-colors.js
```

**Step 3: Коміт**
```bash
git commit -m "chore: remove unused build-tailwind-theme-colors.js"
```

---

## ПІДСУМКОВИЙ ЧЕКЛІСТ

- [ ] P1.1: OAuth callback — params.user → Api.getMe()
- [ ] P2.1: id-utils.ts — Math.random → crypto.getRandomValues
- [ ] P3.1: reader-runtime.ts — імпорти з domain модулів
- [ ] P3.2: reader-launch.ts — PlaybackState з engine/types
- [ ] P3.3: reader.tsx — PlaybackState з engine/types
- [ ] P3.4: useReaderInitialization.ts — PlaybackState з engine/types
- [ ] P4.1: story-reader-responsive.tsx — StoryScene/Choice → SceneRecord
- [ ] P5.1: audio-player-service.ts — __DEV__ guard для console.log
- [ ] P5.2: story-manuscript-save.ts — __DEV__ guard для console.warn
- [ ] P6.1: Видалити build-tailwind-theme-colors.js

Після виконання всіх задач:
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → всі тести проходять
- [ ] Оновити `wiki/final-migration-audit.md` — прибрати виправлені пункти
- [ ] Оновити `wiki/security-audit-report-2026-05-31-rev2.md` — оновити статус C-1

---

## ОЧІКУВАНИЙ РЕЗУЛЬТАТ

| Метрика | До | Після |
|---|---|---|
| Security audit score | 8.5/10 | 9.5/10 |
| CRITICAL issues | 1 | 0 |
| Deprecated barrel importers | 6 | 0 |
| Math.random usage | 3 | 0 (with fallback) |
| console.log without __DEV__ | ~5 | 0 |
| Orphaned files | 1 | 0 |
