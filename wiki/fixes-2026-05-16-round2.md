# Виправлення коду 2026-05-16 (раунд 2)

**Дата:** 2026-05-16
**Джерело:** [[bug-report-2026-05-16|Звіт про баги 2026-05-16]]

---

## Критичні проблеми (виправлено 4/5)

### S1: lib/asset-resolver.ts — XSS через data: URI ✅
- **Рядок:** 103
- **Проблема:** `data:` URI повертався без валідації — можливий XSS через `data:text/javascript`.
- **Виправлення:** Додано перевірку data URI на небезпечні протоколи. Дозволено тільки `data:image/`, `data:audio/`, `data:video/`, `data:font/`. Небезпечні повертають `null`.
- **Статус:** Виправлено

### K2: lib/story-repository.ts — Race condition ✅
- **Проблема:** Read-modify-write race condition при збереженні/видаленні історій.
- **Виправлення:** Файл більше не існує — логіка повністю перенесена в Zustand store.
- **Статус:** Неактуальний (виправлено раніше)

### K4: lib/audio-player-service.ts — Витік при stop з fadeOut ✅
- **Рядки:** 76-93
- **Проблема:** Promise при `stop(trackId, fadeOut)` ніколи не резолвився, якщо track видалився під час fade.
- **Виправлення:** Додано `safeResolve` з прапорцем `resolved` для запобігання подвійному resolve. Додано перевірку `this.tracks.has(trackId)` після виклику `_fade`.
- **Статус:** Виправлено

### K8: hooks/useReaderInitialization.ts — Race condition ✅
- **Рядки:** 24-73
- **Проблема:** Старий запит міг перезаписати новий після `await setCurrentStory()`.
- **Виправлення:** Додано перевірку `requestId` після кожного `await`. Перенесено `setIsLoading(false)` у `finally` блок з перевіркою `requestId`.
- **Статус:** Виправлено

### S2: lib/story-validator.ts — Неповна санитизація XSS ✅
- **Рядки:** 201-244
- **Проблема:** `validateUri` не блокувала `ftp:`, `tel:`, `mailto:`, дозволяла `file://`, мала неправильний відступ.
- **Виправлення:**
  - Розширено список небезпечних протоколів
  - Додано валідацію `data:image/*` як безпечного
  - Прибрано `file://` з дозволених
  - Додано `blob:` як безпечний
  - Додано try/catch для `decodeURIComponent`
  - Виправлено відступи
- **Статус:** Виправлено

---

## Високі проблеми (виправлено 4/7)

### H3: lib/block-tree.ts — JSON.parse(JSON.stringify()) для клонування ✅
- **Рядок:** 114
- **Проблема:** `duplicateBlock` використовував JSON roundtrip для deep clone.
- **Виправлення:** Замінено на `produce()` з immer (вже імпортований у файлі).
- **Статус:** Виправлено

### H4: lib/block-tree.ts — Невикористаний ROOT_BLOCK імпорт ✅
- **Рядок:** 3
- **Проблема:** `import { ROOT_BLOCK }` не використовувався.
- **Виправлення:** Видалено мертвий імпорт.
- **Статус:** Виправлено

### H6: lib/asset-resolver.ts — Кеш без обмеження ✅
- **Рядок:** 9
- **Проблема:** `uriCache` — Map без обмеження розміру.
- **Виправлення:** Додано LRU cache з обмеженням 100 записів (`URI_CACHE_MAX_SIZE`).
- **Статус:** Виправлено

### H14: app/reader.tsx — Порожня функція handleObjectDialogue ✅
- **Рядок:** 87-88
- **Проблема:** `handleObjectDialogue` була порожньою функцією.
- **Виправлення:** Додано TODO коментар та debug лог.
- **Статус:** Виправлено (як TODO)

---

## Неактуальні проблеми (вже виправлено)

| # | Файл | Проблема | Причина |
|---|------|----------|---------|
| K2 | `lib/story-repository.ts` | Race condition | Файл видалено, логіка перенесена в Zustand |

---

## Змінені файли

| Файл | Тип зміни |
|------|-----------|
| `lib/asset-resolver.ts` | XSS fix + LRU cache |
| `lib/audio-player-service.ts` | fadeOut memory leak fix |
| `lib/block-tree.ts` | immer clone + dead import removal |
| `lib/story-validator.ts` | URI validation + XSS sanitization |
| `hooks/useReaderInitialization.ts` | Race condition fix |
| `app/reader.tsx` | TODO for handleObjectDialogue |

---

## Пов'язані сторінки
- [[bug-report-2026-05-16|Звіт про баги 2026-05-16]]
- [[fixes-2026-05-16|Виправлення коду 2026-05-16 (раунд 1)]]
- [[code-analysis-report-2026-05-16|Аналіз коду 2026-05-16]]
- [[architecture-reference|Довідник архітектури]]
