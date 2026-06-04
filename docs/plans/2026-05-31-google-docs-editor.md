# План: Google Docs-подібний документний редактор

> **Для виконавця:** Рефакторинг `DocumentSceneEditor.tsx` — 1394 рядки, потребує зміни логіки скролінгу та рендерингу сторінок.

**Goal:** Змінити поведінку документного редактора так, щоб він працював як Google Docs / Word — без фіксованих сторінок, без небажаного автоскролу, з плавним follow-курсором тільки коли потрібно.

**Architecture:**
- Прибрати `minHeight` на сторінках — контент визначає висоту
- Прибрати `marginBottom: 24` між сторінками — замінити тонким divider
- Замінити `followWriting` на `smartFollow` — скролить тільки коли курсор виходить за viewport
- Прибрати автоскрол при фокусі на TextInput (крім першого входу)
- `scrollToWritingPosition` — скролить до позиції курсора, а не до низу сторінки

---

## Проблема 1: автоскрол при фокусі → сторінка зміщується вниз

**Причина:** `followWriting()` викликається при кожному `onFocus` на TextInput (рядки 981, 1036, 1124, 1128, 1167, 1171). `followWriting` скролить `pageOffset + pageHeight - viewportHeight + keyboardInset + bottomGap` — тобто до нижньоє краївки сторінки.

**Рішення:**
- Прибрати `followWriting()` з усіх `onFocus` handler'ів
- Додати `smartFollow(cursorY)` який викликається тільки коли курсор виходить за видиму область

---

## Проблема 2: текст стрибає вгору при кожному новому рядку

**Причина:** `onContentSizeChange` (рядок 1339-1343) викликає `scrollToWritingPosition()` при кожній зміні розміру контенту. Новий рядок → contentSize змінився → скрол до низу → текст "стрибає".

**Рішення:**
- Замінити `scrollToWritingPosition` на `smartFollow(cursorPosition)`
- `smartFollow` перевіряє: чи курсор видимо? Якщо так — не скролити. Якщо ні — плавний скрол до курсора

---

## Проблема 3: пусте місце внизу сторінки

**Причина:** `minHeight: pageMinHeight` (рядок 923) — на phone `Math.max(520, screenHeight - insets - 74)`. Пусте місце створює враження "сторінки" замість безперервного документа.

**Рішення:**
- Прибрати `minHeight` повністю
- Додати `paddingBottom: 120` як мінімальний відступ знизу (щоб останній рядок не притискався до краю)
- Замінити `marginBottom: 24` на `marginBottom: 0` та додати тонкий divider (`height: 1, backgroundColor: colors.border`)

---

## Проблема 4: cursor position tracking

**Поточний код** не відстежує позицію курсора. Потрібно додати `cursorPositionRef` та оновлювати його при кожному зміні тексту.

---

## Детальний план задач

### Task 1: Прибрати followWriting з onFocus handler'ів

**Objective:** Зупинити автоскрол при фокусі на TextInput.

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

**Step 1:** Знайти всі `onFocus` handler'и з `followWriting`:
- Рядок 981: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1036: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1040: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1043: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1124: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1128: `if (isLastBlock) followWriting(documentScene.sceneId);` — прибрати
- Рядок 1167: `followWriting(documentScene.sceneId);` — прибрати
- Рядок 1171: `followWriting(documentScene.sceneId);` — прибрати

**Step 2:** Замінити на порожній `onFocus` або прибрати повністю.

**Expected результат:** Клік на TextInput не викликає скрол.

---

### Task 2: Додати cursor position tracking

**Objective:** Відстежувати позицію курсора в документі для smart-follow.

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

**Step 1:** Додати ref для зберігання позиції курсора:
```typescript
const cursorPositionRef = useRef(0);
const cursorViewportOffsetRef = useRef(0);
```

**Step 2:** Додати функцію `updateCursorPosition`:
```typescript
const updateCursorPosition = useCallback((sceneId: string, text: string, selectionStart: number) => {
  // Обчислити Y-позицію курсора відносно початку сторінки
  const pageOffset = pageOffsetsRef.current[sceneId] ?? 0;
  // Базова висота header (scene name + counter) ~80px на desktop, ~0 на phone
  const headerHeight = isPhone ? 0 : 80;
  // Висота рядка ~27px (lineHeight)
  const lineHeight = 27;
  const linesBefore = text.substring(0, selectionStart).split('\n').length - 1;
  cursorPositionRef.current = pageOffset + headerHeight + 42 + linesBefore * lineHeight;
  cursorViewportOffsetRef.current = cursorPositionRef.current - (scrollViewRef.current?.contentOffset?.y ?? 0);
}, [isPhone]);
```

**Step 3:** Додати `onSelectionChange` до кожного TextInput:
```typescript
onSelectionChange={(event) => {
  const { start } = event.nativeEvent.selection;
  updateCursorPosition(sceneId, block.content ?? block.speakerName ?? '', start);
}}
```

**Expected результат:** `cursorPositionRef` завжди міститиме Y-позицію курсора.

---

### Task 3: Реалізувати smartFollow

**Objective:** Скролить тільки коли курсор виходить за видиму область.

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

**Step 1:** Замінити `followWriting` на `smartFollow`:
```typescript
const smartFollow = useCallback((cursorY?: number) => {
  const scrollY = lastScrollYRef.current ?? 0;
  const viewportHeight = scrollViewportHeightRef.current ?? layout.screenHeight;
  const keyboardInset = isPhone ? keyboardHeight : 0;
  const visibleBottom = scrollY + viewportHeight - keyboardInset - 40; // 40px відступ знизу
  const visibleTop = scrollY + 20; // 20px відступ зверху
  const cursorPos = cursorY ?? cursorPositionRef.current;
  
  // Курсор вище видимої області — скролити вгору
  if (cursorPos < visibleTop) {
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, cursorPos - 60),
      animated: true,
    });
    return;
  }
  
  // Курсор нижче видимої області — скролити вниз
  if (cursorPos > visibleBottom) {
    scrollViewRef.current?.scrollTo({
      y: cursorPos - viewportHeight + keyboardInset + 80,
      animated: true,
    });
    return;
  }
  
  // Курсор видимо — не скролити
}, [isPhone, keyboardHeight, layout.screenHeight]);
```

**Step 2:** Оновити `onContentSizeChange` — викликати `smartFollow` замість `scrollToWritingPosition`:
```typescript
onContentSizeChange={() => {
  smartFollow();
}}
```

**Step 3:** Прибрати `scrollToWritingPosition` та `followWriting` — вони більше не потрібні.
- Прибрати `const scrollToWritingPosition = useCallback(...)`
- Прибрати `const followWriting = useCallback(...)`
- Прибрати `useEffect(() => { if (shouldFollowWritingRef.current) scrollToWritingPosition(); }, ...)`

**Step 4:** Прибрати непотрібні ref'и:
- `followSceneIdRef` — більше не потрібен
- `shouldFollowWritingRef` — більше не потрібен

**Expected результат:** Скрол відбувається тільки коли курсор виходить за viewport.

---

### Task 4: Прибрати minHeight зі сторінок

**Objective:** Сторінка не повинна мати фіксовану висоту — контент визначає розмір.

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

**Step 1:** Знайти `pageMinHeight` у `renderPage`:
```typescript
const pageMinHeight = isPhone ? Math.max(520, layout.screenHeight - insets.top - insets.bottom - 74) : 860;
```

**Step 2:** Замінити `minHeight: pageMinHeight` на `paddingBottom: 120`:
```typescript
style={{
  width: '100%',
  maxWidth: PAGE_MAX_WIDTH,
  alignSelf: 'center',
  backgroundColor: colors['surface-1'],
  borderWidth: isPhone ? 0 : 1,
  borderColor: colors.border,
  borderRadius: isPhone ? 0 : 8,
  paddingHorizontal: isPhone ? 24 : 48,
  paddingVertical: isPhone ? 28 : 42,
  paddingBottom: 120,  // мінімальний відступ знизу замість minHeight
  marginBottom: 0,     // було isPhone ? 0 : 24
  // ... borderColor тощо
}}
```

**Step 3:** Додати divider між сторінками. Після `</View>` сторінки (перед наступною):
```typescript
{index < documentScenes.length - 1 && (
  <View style={{
    width: '100%',
    maxWidth: PAGE_MAX_WIDTH,
    alignSelf: 'center',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: isPhone ? 0 : 12,
  }} />
)}
```

**Expected результат:** Немає пусторого місця внизу сторінок.

---

### Task 5: Додати lastScrollY tracking

**Objective:** Відстежувати поточну позицію скролу для smartFollow.

**Files:** `components/document-editor/DocumentSceneEditor.tsx`

**Step 1:** Додати ref:
```typescript
const lastScrollYRef = useRef(0);
```

**Step 2:** Оновити `onScroll` handler:
```typescript
onScroll={(event) => {
  lastScrollYRef.current = event.nativeEvent.contentOffset.y;
  // ... існуючий код для visibleSceneId
}}
```

---

### Task 6: Коміт

```bash
git add components/document-editor/DocumentSceneEditor.tsx
git commit -m "refactor(editor): Google Docs-like scroll behavior

- Remove followWriting() from all onFocus handlers
- Add cursor position tracking via cursorPositionRef
- Implement smartFollow: scroll only when cursor exits viewport
- Remove minHeight from pages — content defines height
- Add page dividers instead of margins
- Add lastScrollYRef for scroll position tracking"
```

---

## Очікуваний результат

| Було | Стало |
|---|---|
| Клік → сторінка скролиться вниз | Клік → нічого не відбувається |
| Новий рядок → текст стрибає вгору | Новий рядок → плавний follow тільки якщо курсор за краєм |
| Пусте місце внизу сторінки | Сторінка = контент + мінімальний paddingBottom |
| Сторінки з margin 24px між ними | Тонкий divider 1px |