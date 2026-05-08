# Журнал змін — 9 травня 2026

## Огляд сесії
Продовження роботи над Visual Novel Engine та налаштування Hermes Telegram ботів.

## Зміни у Visual Novel Engine

### Виправлення аудіо системи (2026-05-08, завершено 09.05)
- Видалено застарілий `lib/audio-manager.ts`
- Основним аудіо менеджером став `lib/audio-manager-enhanced.ts`
- Додано експорт `audioManager` для зворотної сумісності
- Оновлено `app/reader.tsx` — змінено імпорт на новий менеджер

### Оновлення типів даних
- `lib/types.ts`: додано `audioLibrary?: AudioLibraryItem[]` до типу `Story`
- `lib/types.ts`: додано `audioTriggers?: AudioTrigger[]` до типу `StoryScene`
- Поля `musicUri` та `voiceAudioUri` позначено як `@deprecated`
- `lib/audio-types.ts`: `StoryWithAudio` тепер розширює `Story`
- `lib/block-types.ts`: змінено `Record<string, any>` на `Record<string, unknown>`

### Централізація ключів сховища
- Створено `lib/storage-keys.ts` з константами: `STORIES`, `SAVE_SLOTS`, `SETTINGS`, `BLOCK_TREE`
- Оновлено `lib/storage.ts`: використання `STORAGE_KEYS.BLOCK_TREE`
- Оновлено `lib/story-context.tsx`: всі ключі AsyncStorage замінено на константи
- Оновлено `lib/story-context-enhanced.ts`: аналогічно
- Оновлено `app/tabs/index.tsx`: використання `STORAGE_KEYS.STORIES`

### Виправлення мутацій стану
- Переписано `lib/story-context-enhanced.ts`: замінено прямі мутації стану на spread оператори
- Функції `updateScene`, `addScene`, `deleteScene`, `addChoice`, `deleteChoice` тепер створюють копії об'єктів

### Інтеграція аудіо тригерів
- `app/reader.tsx`: додано виклик `audioManager.processTriggers()` при зміні сцени

### Виправлення catch блоків
- `lib/ui-feedback.ts`: заповнено порожні блоки `catch {}` логуванням через `console.debug`

### Валідація історій
- `lib/story-validator.ts`: додано базову валідацію для `splashScreen` та `interactiveObjects`
- **Відома помилка**: `TS2559: Type 'string' has no properties in common with type 'SplashScreenConfig'` в рядку 126 — потребує узгодження типів

## Тестування
- **Статус**: 203 тести пройдено успішно (15 файлів)
- Детальний реєстр: `wiki/test-registry-2026-05-08.md`

## Налаштування Telegram ботів

### Головний бот (@hermesconductorbot)
- **Статус**: Працює коректно
- PID: 5278
- Токен: [REDACTED] (валідний)

### Гостьовий бот (@Dalmatianpuppy1bot)
- **Статус**: НЕ ПРАЦЮЄ — не відповідає на повідомлення
- **Причина**: Hermes показує "No messaging platforms enabled" в логах
- **Локація конфігурації**: `/home/viktor/.hermes/profiles/guest/`
- **Токен бота**: [REDACTED] (валідний, підтверджено через Telegram API)
- **Admin ID**: 131751260 додано в `admin_users`

#### Виконані дії для налагодження:
1. Перевірка токена через `curl https://api.telegram.org/bot<token>/getMe` — працює
2. Валідація YAML структури `config.yaml` через Python yaml parser — коректна
3. Додавання `admin_users: [131751260]`
4. Створення `.env` файлу з `TELEGRAM_TOKEN` та `GATEWAY_ALLOW_ALL_USERS=true`
5. Зміна структури `platforms:` (спроби: `telegram: true`, `telegram: {enabled: true}`, `- telegram`)
6. Встановлення токена через `hermes --profile guest config set telegram.token`
7. Спроба запуску з `HERMES_HOME=/home/viktor/.hermes/profiles/guest`
8. Перевірка коду `gateway/run.py` — проблема в умові `if not platform_config.enabled`

**Висновок**: Виявлено можливий баг Hermes — профілі (`--profile`) некоректно завантажують налаштування `platforms`, через що гейтвей не бачить Telegram. `hermes --profile guest config show` показує `Telegram: not configured`, хоча токен є в файлі.

**Рекомендація**: Оновити Hermes (`hermes update`) або встановити окрему копію Hermes в `/mnt/d/Programs/D/guest-hermes` без використання профілів.

## Коміти в git
- `88cce9b`: Audio system refactor
- `8a6286a`: Update types with audio fields
- `88299fe`, `adc144b`: Centralize storage keys
- `a56901c`: Fix state mutations with spread operators
- `00eb7ca`: Integrate audio triggers in reader
- `0206afb`: Fix empty catch blocks

## Wiki документація
- `wiki/CHANGELOG_2026_05_08.md`: оновлено (203 тести)
- `wiki/log.md`: додано записи за 2026-05-08/09
- `wiki/next-session-plan-2026-05-09.md`: план на наступну сесію
- `wiki/test-registry-2026-05-08.md`: повний реєстр 203 тестів
- `wiki/CHANGELOG_2026_05_09.md`: цей файл

## Пов'язані сторінки
[[CHANGELOG_2026_05_08|Зміни 8 травня]]
[[test-registry-2026-05-08|Реєстр тестів]]
[[next-session-plan-2026-05-09|План на наступну сесію]]
[[log|Головний журнал подій]]
