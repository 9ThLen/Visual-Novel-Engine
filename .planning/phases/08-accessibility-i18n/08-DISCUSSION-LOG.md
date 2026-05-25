# Phase 8: Accessibility & i18n — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 08-accessibility-i18n
**Areas discussed:** Color replacement scope, accessibilityLabel strategy, Contrast & color system, Interface improvement ideas

---

## Обсяг заміни кольорів

| Option | Description | Selected |
|--------|-------------|----------|
| Editor + Reader + UI (Recommended) | Lego legacy, фокус на SceneComposer, reader, app, ui компоненти | ✓ |
| Весь код | Всі ~140 hardcoded кольорів | |
| Тільки high-impact | Тільки кнопки, текст, помилки | |

**User's choice:** Editor + Reader + UI

| Option | Description | Selected |
|--------|-------------|----------|
| Static fallback hex | Найпростіше, без динамічних токенів | |
| Rewrite to FC + useColors() (Recommended) | Переписати ErrorBoundary | ✓ |
| Colors via props | Передавати кольори від батька | |

**User's choice:** Rewrite to FC + useColors()

| Option | Description | Selected |
|--------|-------------|----------|
| Не чіпати Lego (Recommended) | Lego deprecated | |
| Мінімальні правки | Тільки найочевидніші #fff/#000 | ✓ |

**User's choice:** Мінімальні правки

| Option | Description | Selected |
|--------|-------------|----------|
| Use parent colors (Recommended) | Dialog кольори від useColors() | ✓ |
| New dialog tokens | Окремі токени для модалок | |

**User's choice:** Use parent colors

| Option | Description | Selected |
|--------|-------------|----------|
| No fallback needed (Recommended) | oklchToRgb() вже конвертує | ✓ |
| Add explicit hex fallback | Для старих браузерів | |

**User's choice:** No fallback needed

---

## Стратегія accessibilityLabel

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per component (Recommended) | Додавати вручну per component | ✓ |
| Wrapper component | Створити обгортку Pressable | |
| Dedicated a11y phase | Окрема фаза | |

**User's choice:** Inline per component

| Option | Description | Selected |
|--------|-------------|----------|
| Use existing Button (Recommended) | Button вже має a11y props | ✓ |
| Direct Pressable labels | Додавати напряму | |

**User's choice:** Use existing Button

---

## Контраст і кольорова система

| Option | Description | Selected |
|--------|-------------|----------|
| Check theme tokens only | Тільки токени | |
| Tokens + spot check | Токени + вибіркові компоненти | |
| Full component audit | Повна перевірка | ✓ |

**User's choice:** Full component audit

| Option | Description | Selected |
|--------|-------------|----------|
| Both light and dark (Recommended) | Обидві схеми | |
| Light only | Тільки світла | ✓ |

**User's choice:** Тільки світла (одна тема)

---

## Покращення інтерфейсу (freeform)

**User's request:** Придумати, як покращити інтерфейс

**Proposals made:**
1. Заміна hardcoded кольорів на RuntimePalette токени
2. a11y labels через t() в кожен компонент
3. Contrast audit всіх компонентів
4. i18n ключі для editor toolbar, block labels, confirmation messages
5. LanguageSelector a11y labels

User proceeded directly to planning without selecting from these proposals.

---

## the agent's Discretion

- Порядок заміни кольорів у компонентах
- Які саме accessibilityLabel значення використовувати
- Деталі перепису ErrorBoundary

## Deferred Ideas

- Повний рефакторинг Lego editor кольорів
- RTL підтримка
- Locale-aware date/number formatting
- Нові переклади для всіх мов
- Automated a11y testing setup
