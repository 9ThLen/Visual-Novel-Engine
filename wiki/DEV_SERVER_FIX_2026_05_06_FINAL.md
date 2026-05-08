# DEV_SERVER_FIX_2026_05_06_FINAL

## Підсумок дня: Metro так і не запустився

### Всі спроби виправити проблему:

1. **app.config.ts** — видалено імпорт `scripts/load-env.js`
   - Спроба з `require('fs')` — не спрацювало (проект ESM)
   - Спроба з `dotenv` — додано `import { config as dotenvConfig } from 'dotenv'`
   - Додано `// @ts-nocheck`

2. **app.config.js** (CommonJS) — створено тестову версію
   - Перейменовано `app.config.ts` → `app.config.ts.bak`
   - Спрощено до мінімальної конфігурації

3. **metro.config.cjs** — помилка завантаження
   - Створено `metro.config.js` (ESM) з `import` синтаксисом
   - Перейменовано старий `.cjs` → `.cjs.bak`
   - Спроба мінімального конфігу — `export default {}`

4. **Інше:**
   - Встановлено `@babel/parser` та `@babel/types`
   - Перевірка портів 3000, 8081 — вільні
   - Перевірка `expo --help` — працює

### Остання помилка (з логу):
```
Error: Error loading Metro config at: /mnt/d/Programs/D/visual_novel_engine/metro.config.cjs
Error reading Expo config at /mnt/d/Programs/D/visual_novel_engine/app.config.js
```

Навіть з мінімальними конфігами (.js файли) — Metro не запускається, немає виводу.

### Гіпотези на завтра:
1. Конфлікт Expo 54 + React Native 0.81.5 + TypeScript 5.9.3
2. Проблема з `node_modules/.pnpm` довгим шляхом (Windows WSL)
3. Можливо, треба оновити Expo CLI або понизити TypeScript
4. Спробувати видалити `node_modules` та переінсталювати

### Тимчасові файли станом на кінець дня:
- `app.config.ts.bak` — оригінал
- `app.config.js` — CommonJS тестова версія
- `metro.config.cjs.bak` — оригінал
- `metro.config.js` — ESM версія (можливо некоректна)

---
*Оновлено: 2026-05-06 23:59*
