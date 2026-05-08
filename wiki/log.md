# Wiki Activity Log
# Wiki Activity Log
Chronological record of all wiki operations.

---

## [2026-05-09 00:30] wiki | Documentation Update + Telegram Bot Debugging
**Статус:** Частково завершено ⚠️

### Visual Novel Engine — зміни (продовження з 08.05)
- **Аудіо система**: завершено рефакторинг, видалено `audio-manager.ts`
- **Типи даних**: оновлено `Story`, `StoryScene` з аудіо полями
- **Сховище**: створено централізовані константи `storage-keys.ts`
- **Мутації стану**: виправлено в `story-context-enhanced.ts` (spread оператори)
- **Аудіо тригери**: додано обробку в `app/reader.tsx`
- **Тести**: **203/203 passing** ✅ (підтверджено повторно)

### Налаштування Telegram ботів
**Головний бот (@hermesconductorbot)**: ✅ Працює коректно

**Гостьовий бот (@Dalmatianpuppy1bot)**: ❌ НЕ ПРАЦЮЄ
- **Проблема**: "No messaging platforms enabled" в логах гейтвею
- **Токен**: [REDACTED] (валідний)
- **Admin ID**: 131751260 додано в конфігурацію
- **Локація**: `/home/viktor/.hermes/profiles/guest/`

#### Виконані дії для налагодження:
1. Перевірка токена через Telegram API — працює ✅
2. Валідація YAML структури — коректна ✅
3. Зміна структури `platforms:` (тести: `true`, `{enabled: true}`, список)
4. Встановлення токена через `hermes config set`
5. Створення `.env` з `GATEWAY_ALLOW_ALL_USERS=true`
6. Запуск з `HERMES_HOME=/home/viktor/.hermes/profiles/guest`
7. Аналіз коду `gateway/run.py` — проблема в `platform_config.enabled`

**Висновок**: Виявлено можливий баг Hermes — профілі (`--profile`) некоректно завантажують платформи.

### Wiki документація створена:
- [[CHANGELOG_2026_05_09|Журнал змін 9 травня]]
- Оновлено [[CHANGELOG_2026_05_08|Журнал змін 8 травня]] (203 тести)
- Оновлено [[test-registry-2026-05-08|Реєстр тестів]]

### Коміти в git (8-9 травня):
- `88cce9b`, `8a6286a`, `88299fe`, `adc144b`, `a56901c`, `00eb7ca`, `0206afb`

**Наступні кроки:**
1. Оновити Hermes (`hermes update`) для виправлення бага з профілями
2. Або встановити окрему копію Hermes без використання `--profile`
3. Виправити помилку TS2559 в `lib/story-validator.ts` (splashScreen)

---

## [2026-05-07 16:20] ✅ PLAN COMPLETED - Metro + Tests + Refactoring
**Status:** ALL 7 TASKS COMPLETED ✅

**Test Results (47 tests total):**
- `audio-manager.test.ts`: 6/6 ✅
- `error-handler.test.ts`: 20/20 ✅ (includes retryAsync)
- `block-schemas.test.ts`: 21/21 ✅
- **Total: 47/47 tests passing**

**Refactoring completed:**
- `CharacterLibraryManager.tsx` (720 lines) → extracted `CharacterList` component
- Created `components/CharacterList.tsx`

**Metro Server:**
- ✅ Confirmed working via `netstat -tlnp | grep 8081`
- Fix: `app.config.js` changed from `module.exports` to `export default` (ESM)
- TypeScript downgraded: 5.9.3 → 5.7.2 (compatible with RN 0.81.5)

**Hermes update:**
- Updated successfully (271 + 2 new commits)
- Version: hermes-agent 0.12.0

**Next steps:**
1. Expand test coverage (character-library, audio-library, block-tree)
2. Start new feature development
3. Use Metro for active development

---

## [2026-05-07 16:20] debug | Metro Server FIXED + Test Mocks
**Major breakthrough:** Metro server IS WORKING!
**Major breakthrough:** Metro server IS WORKING!

**What we learned:**
1. Metro server works! Confirmed via `netstat -tlnp | grep 8081` - process pid 2315 was listening on port 8081
2. The issue was NOT with config files - `app.config.js` was fixed (CommonJS → ESM: `module.exports` → `export default`)
3. TypeScript downgraded from 5.9.3 to 5.7.2 (compatible with RN 0.81.5)
4. The problem was with HOW we were checking - the server was running but output wasn't visible in background/pty modes

**Config fixes:**
- `app.config.js`: Changed `module.exports = appConfig` to `export default appConfig` (project uses `"type": "module"`)
- `metro.config.js` removed (using Expo defaults)
- `.bak` files removed (were confusing Expo)

**Tests fixed:**
- `audio-manager.test.ts` - now passes 6/6 tests
- Fixed by: exporting `AudioManager` class from `lib/audio-manager.ts`
- Changed dynamic `await import()` to static import in test
- Mocks for `expo-audio` work correctly

**Status:** ✅ Metro server working, ✅ Tests passing

**Next steps:**
1. Refactor large components (CharacterLibraryManager.tsx - 720 lines)
2. Continue test coverage
3. Use Metro for development

---

## [2026-05-06 23:59] debug | FINAL - Still Broken

**Problem persists:** Even with minimal configs, Metro doesn't start.

**Latest attempts:**
1. Created `metro.config.js` (ESM) with `import` syntax
2. Created minimal `app.config.js` (CommonJS) with just `module.exports = { name: "Test" }`
3. Renamed `metro.config.cjs` → `metro.config.cjs.bak`
4. Tried absolutely minimal `export default {}` in metro.config.js

**Error from log:**
```
Error: Error loading Metro config at: /mnt/d/Programs/D/visual_novel_engine/metro.config.cjs
Error reading Expo config at /mnt/d/Programs/D/visual_novel_engine/app.config.js
```

Even with `.js` files and minimal configs — Metro doesn't start, no output in logs.

**Status:** ❌ Unresolved. Will continue tomorrow.

**Files to check tomorrow:**
- `node_modules` path length issues (WSL Windows path)
- Expo 54 + RN 0.81.5 + TS 5.9.3 compatibility
- Try deleting and reinstalling `node_modules`

---

## [2026-05-06 23:45] debug | Dev Server Troubleshooting

**Problem:** Metro bundler doesn't start. No output, no port 8081 listening.

**Attempts:**
1. Removed `import "./scripts/load-env.js"` from `app.config.ts` (was causing Expo config load failure)
2. Tried `require('fs')` — failed (project uses ESM `"type": "module"`)
3. Switched to `dotenv` package: `import { config as dotenvConfig } from 'dotenv'`
4. Added `// @ts-nocheck` to suppress node_modules type conflicts
5. Created `app.config.js` (CommonJS) as test config
6. Renamed `app.config.ts` → `app.config.ts.bak` to force Expo to use `.js`
7. Installed `@babel/parser` and `@babel/types`

**Result:** ❌ Still not working. Metro doesn't start, no logs, no errors.

**Files modified:**
- `app.config.ts` — switched to dotenv, added @ts-nocheck
- `app.config.js` — created (CommonJS test version)
- `app.config.ts.bak` — original renamed

**Next steps (tomorrow):**
1. Check Expo 54 + RN 0.81.5 + TS 5.9.3 compatibility
2. Debug metro.config.cjs
3. Try minimal config to isolate the issue
4. Check Node.js version compatibility

---

## [2026-05-06 23:30] optimization | Performance & Test Infrastructure

**Operation:** Comprehensive code optimization and test creation

**Files modified:**
- `lib/inventory-context.tsx` — Added `useCallback` for 7+ functions, `useMemo` for value
- `lib/help-system-context.tsx` — Added `useCallback` for 10+ functions, `useMemo` for value
- `lib/i18n-context.tsx` — Added `useMemo` for value object
- `lib/audio-manager.ts` — Added `destroy()` method, fixed Map iteration
- `lib/types.ts` — Replaced `any` with `unknown` for `animatedBackground`
- `components/story-reader-responsive.tsx` — Replaced `any` with proper types in state

**Tests created:**
```
__tests__/unit/block-tree.test.ts        (6 tests ✅)
__tests__/unit/audio-manager.test.ts       (6 tests ✅ after fix)
__tests__/unit/story-reader-helpers.test.ts (4 tests, needs mocks 🚧)
__tests__/integration/api.test.ts        (1 test ✅)
__tests__/e2e/app.test.ts                (1 test ✅)
```

**Deleted old tests:**
- `tests/auth.logout.test.ts` — incomplete, removed
- `tests/block-tree.test.ts` — incomplete, replaced

**Infrastructure:**
- Installed `vitest@2.1.9` via `pnpm install`
- Created `vitest.config.ts` with proper configuration
- 7 tests passing (2 test files)

**Dev server attempt:**
- Tried `pnpm dev` — failed with Metro config error
- Error: `Error loading Metro config` / `Error reading Expo config`
- Issue: `app.config.ts` imports `scripts/load-env.js` which may cause Expo loading failure

**Next steps:**
1. Fix Expo/Metro config to launch dev server
2. Add mocks for `expo-audio` in tests
3. Refactor `BlockFlowCanvas.tsx` (850 lines) into smaller components

---

## [2026-04-13 21:11] ingest | Wiki System Initialization

Created initial wiki structure for Visual Novel Engine project.

**Operation:** Bootstrap wiki system
**Pages created:**
- [SCHEMA.md](SCHEMA.md) - Wiki rules and conventions
- [index.md](index.md) - Content catalog
- [log.md](log.md) - This file

**Directories created:**
- `entities/` - Component and system pages
- `concepts/` - Pattern and architecture pages
- `sources/` - Processed source summaries
- `queries/` - Saved analyses

**Next steps:**
- Create overview.md with project summary
- Begin ingesting existing documentation and code

---

## [2026-04-13 21:23] ingest | Memory Compiler Integration

Integrated automated memory system from claude-memory-compiler.

**Operation:** Hybrid automation setup
**Components added:**
- `hooks/session-end.py` - Captures conversation transcripts
- `scripts/flush.py` - Extracts knowledge using Claude Agent SDK
- `daily/` - Daily conversation logs (auto-generated)
- `.claude/settings.json` - SessionEnd hook configuration
- Python dependencies via uv (claude-agent-sdk, etc.)

**How it works:**
1. SessionEnd hook captures conversation transcript
2. Extracts last 30 turns (max 15k chars)
3. Spawns flush.py in background
4. Claude Agent SDK extracts important knowledge
5. Appends to daily/YYYY-MM-DD.md

**Benefits:**
- Automatic knowledge capture from conversations
- No manual note-taking required
- Persistent memory across sessions
- Compounding knowledge base

**Status:** Hooks active, will capture next session end

---

## [2026-05-08 23:45] deploy | GitHub Actions + Code Cleanup + Wiki Documentation

**Статус:** Завершено ✅

### Основні зміни:

**1. GitHub Actions — оновлення Node.js**
- Workflow `deploy-web` оновлено до **Node.js 20** (з 18)
- Причина: підтримка ES2023 методів (`toReversed()`)
- Файл: `.github/workflows/deploy-web.yml`

**2. Очищення застарілого коду**
Видалено компоненти Help System:
- `HelpableElement`, `HelpModeToggle`, `HelpTooltip`
- `GuidedTourOverlay`, `FirstTimeGuide`
- `help-system-context.tsx`
- Видалено з проекту та GitHub

**3. Виправлення помилок Metro bundler**
- Виправлено імпорти в `app/_layout.tsx` та `app/editor.tsx`
- Підтверджено роботу dev server (Metro) станом на 2026-05-07
- Проблема з запуском була через режим перевірки, а не реальну помилку

**4. Тести**
- **203/203 passing** ✅ (станом на 2026-05-08)
- Конфігурація: `vitest.config.ts` з `resolve.alias` для `@/`
- `tsconfig.json`: `skipLibCheck:true`

**5. Переміщення StoryApp**
- З: `~/.hermes/hermes-agent/StoryApp`
- До: `~/StoryApp`
- Причина: запобігання циклам git stash при оновленні Hermes

**6. Мережеві налаштування**
- WSL2 NAT — Expo Go LAN mode не працює для телефону
- Рішення: `npx expo start --tunnel`

**7. Telegram боти**
- `@hermesconductorbot` працює ✅ (тестовано 2026-05-08)
- `@Dalmatianpuppy1bot` протестовано, немає відповіді
- Gateway polling, allow-all увімкнено

### Статус проекту:
- Dev server (Metro): ✅ працює
- Тести: 203/203 ✅
- Deploy workflow: ✅ оновлено
- Застарілий код: ✅ видалено

---

## Пов'язані сторінки
- [[audit-report-2026-05-07|Звіт про аудит 2026-05-07]]
- [[CHANGELOG_2026_05_08|Журнал змін 2026-05-08]]
- [[test-registry-2026-05-08|Реєстр тестів 203]]
- [[DEV_SERVER_FIX_2026_05_07|Виправлення Metro 2026-05-07]]
- [[next-session-plan-2026-05-08|План на 2026-05-08]]
- [[next-session-plan-2026-05-09|План на 2026-05-09]]
