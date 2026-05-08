# Аналіз помилок TypeScript у VS Code (2026-05-08)

## Контекст

VS Code на Windows показував ~30 помилок TypeScript у двох файлах:
- `components/block-editor/BlockPalette.tsx`
- `components/InteractiveObjectsLayer.tsx`
- `tsconfig.json`

Аналіз показав, що більшість помилок -- не справжні баги коду, а проблема конфігурації VS Code при роботі з проєктом у WSL.

## Категорії помилок

### Категорія 1: VS Code не бачить типи (17 помилок) -- виправлення коду НЕ потрібне

| Код помилки | Опис | Кількість |
|---|---|---|
| TS2307 | Cannot find module 'react' / 'react-native' | 4 |
| TS2875 | react/jsx-runtime not found | 2 |
| TS2583 | Cannot find name 'Set' | 3 |
| TS2705 | async requires Promise constructor | 2 |
| TS2550 | Object.values / Array.find does not exist | 3 |
| TS2304 | Cannot find name '__DEV__' | 1 |
| tsconfig | Cannot find type definition for 'nativewind/types' | 1 |
| tsconfig | File 'expo/tsconfig.base' not found | 1 |

**Причина:** VS Code на Windows не може резолвити шляхи до `node_modules` через WSL-межу. Всі файли реально існують:
- `expo/tsconfig.base.json` -- встановлює `lib: ["DOM", "ESNext"]`, `target: "ESNext"`, `module: "preserve"`
- `@types/react` -- присутній у node_modules
- `nativewind/types.d.ts` -- присутній

**Рішення:** Запускати VS Code через WSL (Remote - WSL extension) або `code .` з WSL-терміналу.

### Категорія 2: tsconfig.json конфлікт (1 помилка) -- ВИПРАВЛЕНО

| Код помилки | Опис |
|---|---|
| TS error | Option 'bundler' can only be used when 'module' is set to 'preserve' or to 'es2015' or later. |

**Причина:** `expo/tsconfig.base` встановлює `"module": "preserve"`, але коли VS Code не може прочитати цей файл (через WSL), падає на дефолтний `module`, який несумісний з `moduleResolution: "bundler"`.

**Виправлення:** Додано `"module": "preserve"` у локальний `tsconfig.json` явно:

```json
"compilerOptions": {
    "module": "preserve",
    ...
}
```

Це робить явним те, що вже успадковується від `expo/tsconfig.base`, і усуває помилку навіть коли VS Code не може резолвити батьківський конфіг.

### Категорія 3: Implicit 'any' типи (10 помилок) -- виправлення коду НЕ потрібне

| Код помилки | Опис | Кількість |
|---|---|---|
| TS7031 / TS7006 | Binding element / parameter implicitly has 'any' type | 10 |

**Причина:** Виникають ТОЛЬКИ тому, що VS Code не бачить `@types/react`. Без них TypeScript не знає тип `React.FC<Props>`, тому всі деструктуровані пропси падають у `any`. Коли типи доступні -- помилки зникають автоматично.

### Категорія 4: JSX key prop (1 помилка) -- виправлення коду НЕ потрібне

| Код помилки | Опис |
|---|---|
| TS2322 | Property 'key' does not exist on type 'ObjectViewProps' |

**Причина:** `key` -- стандартний React prop, але TypeScript не визнає його коли недоступні типи JSX (`react/jsx-runtime`).

## Підсумок

| Категорія | Кількість | Виправлення коду потрібне? |
|---|---|---|
| VS Code не бачить типи (WSL) | 17 | Ні |
| tsconfig module | 1 | Так -- виправлено |
| Implicit any (відсутні типи) | 10 | Ні |
| JSX key prop | 1 | Ні |

## Рекомендація

Для повного усунення всіх помилок у VS Code -- відкривати проєкт через **Remote - WSL** extension, або запускати `code .` з WSL-терміналу. Це дозволить VS Code коректно резолвити `node_modules` та `expo/tsconfig.base`.

## Пов'язані сторінки

- [[audit-report-2026-05-07|Аудит-звіт 2026-05-07]]
- [[DEV_SERVER_FIX_2026_05_07|Виправлення dev-сервера 2026-05-07]]
- [[code-analysis-report-2026-05-07|Звіт аналізу коду 2026-05-07]]
