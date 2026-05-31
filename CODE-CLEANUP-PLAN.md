# Phase 09 — Code Quality Cleanup

## Meta
- **Goal:** Fix top-priority issues from code review (7.5/10 → 8.5/10 target)
- **Skip:** PL i18n keys (user decision)
- **Mode:** bugfix + refactor (no new features)

## Wave 1 — Безпечні, ізольовані зміни (паралельно)

| # | Task | Files | Risk |
|---|------|-------|------|
| 1 | **Fix 2 conditional hooks** | `app/scene-editor.tsx:70`, `components/SplashScreen.tsx:37` | MEDIUM — runtime crash fix, треба не зламати логіку |
| 2 | **Run `eslint --fix`** | весь проект | LOW — auto-fix ~20 warnings |
| 3 | **Add coverage script** | `package.json` | LOW — 1 рядок |
| 4 | **Sync `theme.config.d.ts`** | `theme.config.d.ts` | LOW — додати 2 токени |
| 5 | **Remove `?? '#fff'` fallbacks** | ~8 компонентів (де `text-inverse` вже гарантовано працює) | LOW — механічно |
| 6 | **Add `conditionUtils.test.ts`** | `__tests__/unit/lib/` | LOW — pure function, детерміністична |

## Wave 2 — Потребує ручного review (після Wave 1)

| # | Task | Files | Risk |
|---|------|-------|------|
| 7 | **Remove unused imports** | 14+ файлів (lint підказує) | LOW-MEDIUM — перевірити що не зламано barrel exports |
| 8 | **Write 5-10 smoke tests** | `__tests__/unit/components/` | LOW — базові render тести для Button, ConfirmDialog, LanguageSelector |

## Деталі задач

### Task 1: Fix 2 conditional hooks

**app/scene-editor.tsx:70**
- `useMemo` після `if (!storyId) return <View />`
- Фікс: підняти `useMemo` (та інші хуки) перед early return, або замінити early return на `if (!storyId) return <View />` після всіх хуків

**components/SplashScreen.tsx:37**
- `useVideoPlayer` після `if (config?.type === 'image') return (...)`
- Фікс: викликати `useVideoPlayer` завжди (до early return), з `config?.type === 'video'` guard всередині

### Task 2: eslint --fix
```bash
npx eslint . --fix
```
Потім перевірити що `npm run check` passes.

### Task 3: Coverage script
Додати в `package.json` scripts:
```json
"coverage": "vitest run --coverage"
```

### Task 4: Sync theme.config.d.ts
Додати відсутні токени:
- `'surface-container'?: string;`
- `'secondary'?: string;`

### Task 5: Remove `?? '#fff'` fallbacks
Шукати `colors\['text-inverse'\] \?\? '#fff'` та `colors\['text-inverse'\] \?\? '#FFFFFF'` — прибрати `?? '#fff'`/`?? '#FFFFFF'`, залишити `colors['text-inverse']`. Чи тільки там де файл активно використовує `colors['text-inverse']` і гарантовано має доступ до виправленого аліаса.

### Task 6: conditionUtils.test.ts
Тестувати всі 8 операторів (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `has`, `not_has`), порожні умови, null variables.

### Task 7: Remove unused imports
За лінт-звітом: `Choice` в reader, `Button`/`MiniPreview` в SceneComposer, `Dimensions`/`TimelineStep` в PlayMode, `BLOCK_CATEGORY_MAP` в BlockLibraryPanel, `BLOCK_TYPE_INFO` в MiniPreview, `ESTIMATED_BLOCK_HEIGHT` в TimelinePanel, `useAppStore` в SaveSceneDialog, `characterLibraries` в CharacterCreator, `isAudioCategory`/`getCategoryIcon` в AssetPicker, `sceneStack`/`showChoices` в PlayMode, `currentTextContent` в story-reader-responsive + 3 duplicate imports.

### Task 8: Smoke tests
- Button: renders 5 variants, loading state, disabled state
- ConfirmDialog: renders with destructive/normal mode, buttons have a11y labels
- LanguageSelector: renders 3 languages, selected state styled correctly
- ScreenContainer: renders children with safe area
- ErrorBoundary: renders fallback on error
