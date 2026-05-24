# Аудит мобільної версії VNE — 2026-06-09

## Резюме

Повний аналіз Visual Novel Engine виявив **17 проблем** мобільної версії, з яких:
- **5 критичних** (блокують роботу)
- **7 важливих** (погіршують UX)
- **5 невеликих** (оптимізація)

Lego-логіка працює коректно на веб-версії, але мобільна версія має серйозні проблеми з рендерингом, жестами, safe area та платформ-специфічним поведінкою.

## Критичні проблеми

### 1. Portrait lock блокує адаптацію рідера
- **Файл:** `app.config.js`
- **Проблема:** `orientation: "portrait"` примусово закріплює портретний режим. Ландшафтна логіка в `getReaderLayout()` ніколи не спрацює.
- **Рішення:** Змінити на `"default"` або дати користувачу контроль.

### 2. Відсутній bottom safe area на HomeScreen
- **Файл:** `app/tabs/index.tsx`
- **Проблема:** `ScreenContainer` викликається без `edges`, тому контент перекривається Home Indicator (iPhone) / навігаційною панеллю (Android).
- **Рішення:** Додати `edges={["top","left","right","bottom"]}`.

### 3. Pressable зона не доступна для TalkBack
- **Файл:** `components/story-reader-responsive.tsx`
- **Проблема:** Основна зона натискання (`<Pressable style={{ flex: 1 }}>`) не має `accessible={true}`.
- **Рішення:** Додати accessibility-пропи.

### 4. Конфлікт жестів LegoCanvas на Android
- **Файл:** `components/lego-editor/LegoCanvas.tsx`
- **Проблема:** `Gesture.Pan()` конфліктує з `ScrollView` батька. Перетягування атомів не працює.
- **Рішення:** Використати `Gesture.Native()` або `simultaneousHandlers`.

### 5. Alert.alert() блокує reanimated анімації
- **Файл:** `components/InteractiveObjectsLayer.tsx`
- **Проблема:** Нативний Alert блокує JS-потік, "заморожуючи" анімації.
- **Рішення:** Замінити на кастомний Toast/Modal.

## Важливі проблеми

### 6. boxShadow не працює на Android
- **Файл:** `components/ReaderMenu.tsx` (рядок 80)
- **Проблема:** `boxShadow: '0px 4px 12px rgba(0,0,0,0.3)'` — CSS-властивість без підтримки в RN Android.
- **Рішення:** Замінити на `elevation: 8` + `borderWidth: 1`.

### 7. 100vh хак в DesktopLayout
- **Файл:** `components/DesktopLayout.tsx` (рядок 66)
- **Проблема:** `height: '100vh' as unknown as number` — працює тільки на вебі.
- **Рішення:** Додати `Platform.OS === 'web'` перевірку.

### 8. CharacterDisplay не прив'язаний до діалогу
- **Файл:** `components/CharacterDisplay.tsx`
- **Проблема:** `position: 'absolute', bottom: 0` без урахування висоти діалогового блоку.
- **Рішення:** Прив'язати до `layout.dialogueHeight` з `getReaderLayout()`.

### 9. Хардкодкольори в LegoFlowWorkspace
- **Файл:** `components/lego-editor/LegoFlowWorkspace.tsx`
- **Проблема:** Всі кольори захардкожені замість `useColors()`.
- **Рішення:** Використати тему дизайн-системи.

### 10. LegoBlockLibrary обрізає контент на телефоні
- **Файл:** `components/lego-editor/LegoBlockLibrary.tsx`
- **Проблема:** `containerPhone: { maxHeight: 200 }` — 5 блоків не вміщаються.
- **Рішення:** Збільшити до 300 або прибрати обмеження.

### 11. Appearance.setColorScheme без null-check
- **Файл:** `stores/theme-store.ts` (рядок 20)
- **Проблема:** `Appearance.setColorScheme?.(scheme)` — опціональний виклик, але без повної перевірки.
- **Рішення:** Додати повну перевірку на null.

### 12. useVideoPlayer(null) для зображень
- **Файл:** `components/SplashScreen.tsx` (рядок 27)
- **Проблема:** Плеєр створюється навіть для статичних зображень.
- **Рішення:** Умовний рендеринг через `splash.type`.

## Невеликі проблеми

### 13. Відсутній overflow: hidden в рідері
- **Файл:** `components/story-reader-responsive.tsx` (рядок 297)

### 14. Modal анімація на Android
- **Файл:** `components/InventoryUI.tsx`

### 15. Анімація DialogueHistory в пікселях
- **Файл:** `components/dialogue-history.tsx`

### 16. Мерехтіння Button на слабких пристроях
- **Файл:** `components/ui/Button.tsx`

### 17. Відсутні .android.tsx файли
- **Весь проект** — немає платформ-специфічних оверрайдів.

## План виправлення

### Фаза 1 — Критичні блокери
1. `app.config.js` — orientation
2. `app/tabs/index.tsx` — safe area
3. `components/story-reader-responsive.tsx` — accessibility
4. `components/lego-editor/LegoCanvas.tsx` — жести
5. `components/InteractiveObjectsLayer.tsx` — Alert → Toast

### Фаза 2 — Важливі проблеми
6. `components/ReaderMenu.tsx` — elevation
7. `components/DesktopLayout.tsx` — Platform.OS
8. `components/CharacterDisplay.tsx` — позиціонування
9. `components/lego-editor/LegoFlowWorkspace.tsx` — тема
10. `components/lego-editor/LegoBlockLibrary.tsx` — maxHeight
11. `stores/theme-store.ts` — null check
12. `components/SplashScreen.tsx` — умовний рендеринг

### Фаза 3 — Оптимізація
13-17. Решта дрібних виправлень

## Пов'язані сторінки

[[audit-report-2026-05-07|Попередній аудит]]
[[code-analysis-report-2026-05-16|Аналіз коду]]
[[architecture-reference|Архітектурна довідка]]
