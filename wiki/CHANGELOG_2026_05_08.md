# Журнал змін — 8 травня 2026

## Основні досягнення

### 1. GitHub Actions — оновлення Node.js
- Workflow `deploy-web` оновлено до **Node.js 20** (замість 18)
- Причина: підтримка ES2023 методів (зокрема `toReversed()`)
- Файл: `.github/workflows/deploy-web.yml`

### 2. Очищення застарілих компонентів Help System
Видалено з проекту та GitHub:
- `HelpableElement`
- `HelpModeToggle`
- `HelpTooltip`
- `GuidedTourOverlay`
- `FirstTimeGuide`
- `help-system-context.tsx`

### 3. Виправлення помилок Metro bundler
- Виправлено помилки імпорту в `app/_layout.tsx` та `app/editor.tsx`
- Підтверджено роботу dev server (Metro) станом на 2026-05-07
- Виявлено: проблема з запуском була через режим перевірки (background/pty), а не реальну помилку сервера

### 4. Оновлення залежностей
- TypeScript: downgrade з 5.9.3 до **5.7.2** (сумісність з React Native 0.81.5)
- Тести: **203/203 passing** (станом на 2026-05-08)

### 5. Рефакторинг
- `CharacterLibraryManager.tsx`: виділено компонент `CharacterList`

### 6. Переміщення проекту StoryApp
- З: `~/.hermes/hermes-agent/StoryApp`
- До: `~/StoryApp`
- Причина: запобігання циклам git stash при оновленні Hermes desktop installer

### 7. Налаштування мережі для тестування
- WSL2 використовує NAT з окремим підмережем
- Для тестування на фізичних пристроях через Expo Go LAN mode не працює
- Рішення: використовувати `npx expo start --tunnel` (через Expo хмару)

## Технічні деталі

### Конфігурація тестування
- `vitest.config.ts` з `resolve.alias` для `@/` шляхів
- `tsconfig.json` з `skipLibCheck:true` (не `typecheck:false`)
- Для модулів RN що використовують `require()` на рівні модуля: мокати через `vi.mock()` factory

### Статус роботи
- Dev server (Metro): працює ✅
- Тести: 203/203 ✅
- Deploy workflow: оновлено ✅
- Застарілий код: видалено ✅

## Пов'язані сторінки

[[DEV_SERVER_FIX_2026_05_07|Виправлення сервера розробки 2026-05-07]]
[[lego-block-system-plan-2026-05-07|План LEGO-блоків 2026-05-07]]
[[next-session-plan-2026-05-08|План наступної сесії 2026-05-08]]
[[test-registry-2026-05-08|Реєстр тестів 203]]
[[log|Журнал подій]]
[[index|Головна сторінка wiki]]
