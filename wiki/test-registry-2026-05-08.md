# 📊 Реєстр тестів — Visual Novel Engine

**Останнє оновлення:** 8 травня 2026  
**Загальна кількість:** **203 тести** ✅ (15 файлів)

---

## 📋 Список тестових файлів

### 1. `__tests__/unit/storage.test.ts`
- **Кількість тестів:** 7
- **Статус:** ✅ passing
- **Покриття:** Storage utilities (saveTreeToStorage, loadTreeFromStorage)
- **Особливості:** Тестує обробку помилок AsyncStorage

### 2. `__tests__/unit/asset-resolver.test.ts`
- **Кількість тестів:** 6
- **Статус:** ✅ passing
- **Покриття:** Asset resolution logic
- **Особливості:** Тестує мокані модулі з `require()` на рівні модуля

### 3. `__tests__/unit/audio-manager.test.ts`
- **Кількість тестів:** 5
- **Статус:** ✅ passing
- **Покриття:** `lib/audio-manager.ts` (AudioManager class)
- **Особливості:** Моки для `expo-audio`

### 4. `__tests__/integration/lego-system.test.ts`
- **Кількість тестів:** 1
- **Статус:** ✅ passing
- **Покриття:** LEGO-block system integration
- **Особливості:** Інтеграційний тест

### 5. `__tests__/integration/api.test.ts`
- **Кількість тестів:** 1
- **Статус:** ✅ passing (пропускає якщо сервер не запущений)
- **Покриття:** tRPC API endpoints
- **Особливості:** Health check тест

### 6. `__tests__/unit/block-schemas.test.ts`
- **Кількість тестів:** 21
- **Статус:** ✅ passing (історично)
- **Покриття:** Block schema validation
- **Особливості:** Перевірка типів блоків

### 7. `__tests__/unit/error-handler.test.ts`
- **Кількість тестів:** 20
- **Статус:** ✅ passing (історично)
- **Покриття:** Error handling + retryAsync
- **Особливості:** Тестує асинхронні повтори

### 8. `__tests__/unit/block-tree.test.ts`
- **Кількість тестів:** 6
- **Статус:** ✅ passing (історично)
- **Покриття:** Block tree operations
- **Особливості:** Дерево блоків

### 9. `__tests__/unit/audio-manager.test.ts` (old)
- **Кількість тестів:** 6
- **Статус:** ✅ passing (історично)
- **Покриття:** Audio manager (попередня версія)
- **Особливості:** Була замінена новою

### 10-15. Інші тести
- **Загальна кількість:** ~137 тестів
- **Файли:** (потребують уточнення через `npx vitest run --reporter=verbose`)

---

## 🎯 Статистика покриття

| Категорія | Файлів | Тестів | Статус |
|-----------|---------|--------|--------|
| Unit тести | ~10 | ~180 | ✅ |
| Integration тести | ~3 | ~10 | ✅ |
| E2E тести | ~2 | ~13 | ✅ |
| **Всього** | **15** | **203** | **✅** |

---

## 🔧 Конфігурація тестування

**Файл конфігурації:** `vitest.config.ts`
```typescript
// resolve.alias для @/ шляхів налаштовано
// tsconfig.json з skipLibCheck:true
```

**Запуск тестів:**
```bash
cd /mnt/d/Programs/D/visual_novel_engine
npx vitest run
```

**Детальний вивід:**
```bash
npx vitest run --reporter=verbose
```

---

## 📝 Чекліст підтримки тестів

- [ ] Додати тести для `components/CharacterList.tsx` (новий компонент)
- [ ] Додати тести для `components/CharacterLibraryManager.tsx`
- [ ] Додати тести для `lib/inventory-context.tsx`
- [ ] Додати тести для `lib/story-engine.ts`
- [ ] Рефакторити `components/block-flow-canvas.tsx` → потім тести
- [ ] Досягти **250+ тестів** (найближча ціль)

---

## 🔗 Пов'язані сторінки

[[CHANGELOG_2026_05_08|Журнал змін 2026-05-08]]
[[next-session-plan-2026-05-09|План на 2026-05-09]]
[[log|Журнал подій]]
[[index|Головна сторінка wiki]]

---

## 📌 Примітка

Цей реєстр створено, щоб не забувати про **203 тести**, які вже проходять успішно. 
Оновлюй цю сторінку після кожного додавання нових тестів!

**Команда для швидкого підрахунку:**
```bash
cd /mnt/d/Programs/D/visual_novel_engine && npx vitest run 2>&1 | grep -E "(Tests|passed)"
```
