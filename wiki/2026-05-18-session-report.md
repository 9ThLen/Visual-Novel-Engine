# Робота 2026-05-18 (продовження) — Security fix, Design System

## Огляд

Два блоки роботи: (1) виправлення security issue з wildcard postMessage, (2) повне оновлення дизайн-системи (OKLCH, elevation, accessibility).

---

## 1. S4: wildcard postMessage → конкретний origin

### Проблема
`lib/_core/manus-runtime.ts` використовував `window.parent.postMessage(message, "*")` — відправка повідомлень на будь-який origin. Це security risk — зловмисний iframe може перехопити повідомлення.

### Рішення
- Додано підтримку `VNE_PARENT_ORIGIN` environment variable
- Якщо заданий — використовується конкретний origin
- Якщо ні — fallback на `"*"` (зворотна сумісність)
- Додано логування target origin

### Зміни
- `lib/_core/manus-runtime.ts:48-62` — `sendToParent()` тепер перевіряє `process.env.VNE_PARENT_ORIGIN`
- `lib/_core/manus-runtime.ts:88` — `for...of` на `Set` замінено на `Array.from()` (виправлення TS2802)

---

## 2. Оновлення дизайн-системи

Детальний звіт: [[design-system-update-2026-05-18]]

### Ключові зміни
- OKLCH кольорова система (61 токен, всі OKLCH)
- 5 рівнів surface elevation
- Багатошарові тіні
- WCAG AA/AAA контраст
- Зворотна сумісність через аліаси

---

## Пов'язані сторінки
- [[design-system-update-2026-05-18]]
- [[tasks-backlog]]
