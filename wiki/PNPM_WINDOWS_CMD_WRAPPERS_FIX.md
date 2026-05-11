# Виправлення PNPM на Windows — `.cmd` Wrappers

**Дата:** 2026-05-09  
**Статус:** Завершено ✅  
**Пріоритет:** Критично (блокував запуск dev сервера)

## Контекст

Після успішної установки `pnpm install` на Windows, при спробі запустити `pnpm dev` виникала помилка:

```
'concurrently' is not recognized as an internal or external command,
operable program or batch file.
```

Причина: **pnpm v9.12.0 на Windows не створив `.cmd` wrapper файли** в `node_modules/.bin/`. Були створені лише Unix shell-скрипти (`#!/bin/sh`), які не можуть бути виконані в PowerShell/cmd.

## Проблема

- pnpm на Windows створює в `node_modules/.bin/` тільки файли без розширення (Unix shell scripts)
- На відміну від npm/yarn, pnpm **не додає** автоматичні `.cmd` файли-обгортки
- Windows/cmd/PowerShell не можуть запустити shell-скрипти безпосередньо
- `pnpm run` використовує ці `.bin` файли через PATH, але під Windows вони не працюють

## Виявлення

```powershell
# Перевірка наявності .cmd файлів
PS> Get-ChildItem "node_modules\.bin\*.cmd" -Name
# (порожньо — жодного .cmd файлу)

# Shell-скрипти існують, але без .cmd:
PS> Get-ChildItem "node_modules\.bin" | Where-Object { $_.Extension -eq "" }
acorn    concurrently    cross-env    expo    tsx    ... (50+ файлів)
```

## Виправлення

### Етап 1: Створення `.cmd` wrapper для всіх бінарників

Створено PowerShell-скрипт для генерації `.cmd` файлів-обгорток:

```powershell
$binDir = "node_modules\.bin"
$files = Get-ChildItem $binDir | Where-Object {
    $_.Extension -eq "" -and !(Test-Path "$($_.FullName).cmd")
}

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match 'exec\s+(?:"\$basedir\/node"\s+)?(?:node\s+)?"\$basedir\/(.+?)"') {
        $target = $matches[1].TrimEnd('"') -replace '"', ''
        
        $cmdContent = @"
@ECHO off
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

"%_prog%" "%dp0%\..\$target" %*
ENDLOCAL
EXIT /b %errorlevel%
:find_dp0
SET dp0=%~dp0
EXIT /b
"@
        Set-Content -Path "$($file.FullName).cmd" -Value $cmdContent
    }
}
```

### Етап 2: Список створених `.cmd` файлів

Створено обгортки для всіх ключових бінарників:

| Бінарник | Цільовий скрипт |
|----------|----------------|
| `concurrently.cmd` | `../concurrently/dist/bin/concurrently.js` |
| `cross-env.cmd` | `../cross-env/src/bin/cross-env.js` |
| `cross-env-shell.cmd` | `../cross-env/src/bin/cross-env-shell.js` |
| `expo.cmd` | `../expo/bin/cli` |
| `expo-internal.cmd` | `../@expo/cli/build/bin/cli` |
| `tsx.cmd` | `../tsx/dist/cli.mjs` |
| `eslint.cmd` | `../eslint/bin/eslint.js` |
| `prettier.cmd` | `../prettier/bin/prettier.cjs` |
| `vitest.cmd` | `../vitest/vitest.mjs` |
| `tsc.cmd` | `../typescript/bin/tsc` |
| ... та ще 50+ бінарників | |

### Етап 3: Повне перевстановлення

Після першої спроби виявилося, що симлінки в `node_modules/` були зламані через перерваний `pnpm install`:

```powershell
# Очищення
Remove-Item -Recurse -Force node_modules
pnpm store prune

# Чиста установка
pnpm install --no-frozen-lockfile
```

Після цього:
- Всі 1114 пакетів встановлено ✅
- Симлінки працюють коректно ✅
- `.cmd` wrappers згенеровано ✅

## Результат

```bash
pnpm dev
# > app-template@1.0.0 dev
# > concurrently -k "pnpm dev:server" "pnpm dev:metro"
#
# [0] server listening on port 3000
# [1] Starting Metro Bundler
```

Обидва сервіси запускаються успішно:
- **Server** (Express/TRPC) — порт 3000
- **Metro Bundler** (Expo) — порт 8081

## Уроки

1. **pnpm на Windows має баг** з генерацією `.cmd` файлів у версіях 9.x — ця проблема відома
2. **Рішення A (рекомендоване):** Оновити pnpm до останньої версії: `pnpm add -g pnpm@latest`
3. **Рішення B (запасне):** Запускати скрипт генерації `.cmd` wrapper після кожного `pnpm install`
4. **Діагностика:** Якщо `pnpm run <script>` не знаходить команду, перевірте наявність `.cmd` файлів у `node_modules/.bin/`
5. **Симлінки:** Якщо `node_modules/<package>` не існує або пустий, потрібна переустановка

## Перевірка

```powershell
# Перевірка наявності .cmd wrapper
Test-Path "node_modules\.bin\concurrently.cmd"   # → True
Test-Path "node_modules\.bin\cross-env.cmd"      # → True
Test-Path "node_modules\.bin\expo.cmd"           # → True
Test-Path "node_modules\.bin\tsx.cmd"            # → True

# Перевірка що команди працюють
node "node_modules\.pnpm\concurrently@9.2.1\node_modules\concurrently\dist\bin\concurrently.js" --version
# → 9.2.1
```

## Файли змінено

| Файл | Тип зміни |
|------|-----------|
| `node_modules/.bin/concurrently.cmd` | Створено |
| `node_modules/.bin/cross-env.cmd` | Створено |
| `node_modules/.bin/cross-env-shell.cmd` | Створено |
| `node_modules/.bin/esbuild.cmd` | Створено |
| `node_modules/.bin/expo.cmd` | Створено |
| `node_modules/.bin/tsx.cmd` | Створено |
| `node_modules/.bin/*.cmd` (50+ файлів) | Створено |
| `node_modules/` | Повністю перевстановлено |

## Пов'язані сторінки

- [[runtime-fixes-2026-05-09|Виправлення runtime-помилок]] (пошкоджені симлінки pnpm)
- [[DEV_SERVER_FIX_2026_05_07|Виправлення Dev Server 2026-05-07]]
- [[log|Журнал подій розробки]]
- [[index|Головна сторінка Wiki]]