# Оновлення дизайн-системи 2026-05-18

## Огляд

Повне оновлення дизайн-системи VNE: перехід з hex-кольорів на OKLCH, нова система елевейшну, покращена accessibility, формальна специфікація DESIGN.md.

---

## Що змінилось

### 1. Кольорова система — OKLCH

**Було:** Hex-кольори (`#7C5BF5`, `#1A1B2E`, `#E8E6F0` тощо)
**Стало:** OKLCH (`oklch(58% 0.23 280)`, `oklch(16% 0.02 280)`, `oklch(92% 0.01 280)`)

**Чому OKLCH:**
- Перцептуально рівномірна шкала — жовтий і синій при однаковому Lightness виглядають однаково яскраво
- Рівномірні кроки світлості = рівномірні сприймані переходи
- Краще для accessibility (контраст рахується від L, не від HSL)

### 2. Тришарова архітектура токенів

```
Primitive (raw OKLCH) → Semantic (intent) → Component (specific use)
```

Приклад:
- `--p-500: oklch(58% 0.23 280)` — примітив
- `--color-primary: var(--p-500)` — семантика
- `background-color: var(--color-primary)` — компонент

### 3. Surface Elevation (5 рівнів)

Замість темних тіней на темному фоні (які не видно) — кроки світлості:

| Рівень | Lightness | Використання |
|--------|-----------|-------------|
| 0 (bg) | 16% | Фон сторінки |
| 1 (surface) | 19% | Картки, панелі |
| 2 (surface-1) | 21% | Підняті картки |
| 3 (surface-2) | 23% | Випадаючі меню |
| 4 (surface-3) | 25% | Тултіпи, попапи |

### 4. Нові токени

**Додано 61 токен (було ~35):**
- `surface-1`, `surface-2`, `surface-3` — додаткові рівні елевейшну
- `foregroundSecondary`, `foregroundTertiary`, `foregroundDisabled` — ієрархія тексту
- `hover`, `pressed`, `selected` — інтерактивні стани
- `shadowXs` — `shadowXl`, `shadowGlow` — багатошарові тіні
- `choiceHover`, `editorRuler` — специфічні токени
- `successBg`, `warningBg`, `dangerBg`, `infoBg` — фон для семантичних кольорів

### 5. Зворотна сумісність

Всі старі назви працюють через аліаси:
- `colors.muted` → `colors.foregroundTertiary`
- `colors.error` → `colors.danger`
- `colors.surfaceElevated` → `colors.surface-1`
- `colors.icon` → `colors.foregroundSecondary` (краще для іконок)

### 6. Формальна специфікація DESIGN.md

Створено `DESIGN.md` за специфікацією Google design.md:
- YAML front matter з токенами
- Валідація через `npx @google/design.md lint`
- Експорт в Tailwind/DTCG JSON

### 7. Оновлені компоненти

- `Button.tsx` — ghost variant тепер використовує `colors.hover`, primary text використовує `colors.foregroundOnPrimary`
- `ReaderMenu.tsx` — pressed стан тепер використовує `colors.hover` замість `colors.background`

---

## Файли

| Файл | Зміни |
|------|-------|
| `global.css` | Повний рефакторинг, OKLCH, аліаси |
| `theme.config.js` | 61 токен, всі OKLCH |
| `lib/_core/theme.ts` | RuntimePalette з аліасами |
| `DESIGN.md` | Нова формальна специфікація |
| `design.md` | Оновлена документація |
| `design/preview.html` | Інтерактивний превью |
| `components/ui/Button.tsx` | Нові токени |
| `components/ReaderMenu.tsx` | Нові токени |

---

## Пов'язані сторінки

- [[architecture-reference]]
- [[design/lego-block-system-design]]
- [[2026-05-17-session-report]]
