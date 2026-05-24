# Вирішення: Два редактори — scene-editor vs node-editor

## Поточний стан

### Scene Editor (`app/scene-editor.tsx`)
- **Режим перегляду:** Сторінка редагування однієї сцени
- **Вкладки:** Blocks (блокова редакція) → Edit (детальна редакція) → LEGO (canvas + timeline)
- **Менеджмент стану:** `useStory()` (Context) + локальний `useState` для полів сцени
- **Функціонал:** Повний набір — текст, вибори, фонові зображення, аудіо, splash, інтерактивні об'єкти, блоки, LEGO canvas, таймлайн
- **Розмір:** ~544 рядки (після рефакторингу)

### Node Editor (`app/node-editor.tsx`)
- **Режим перегляду:** Split-panel (граф зліва + панель деталей справа)
- **Компоненти:** `NodeCanvas` (SVG граф сцен) + `SceneEditorPanel` (спрощена панель редагування)
- **Менеджмент стану:** `useStory()` (Context) + `useSceneStore()` (Zustand) для canvas-елементів
- **Функціонал:** Візуалізація графа, створення/видалення вузлів, швидке редагування тексту/виборів, створення зв'язків (choices) між сценами
- **Розмір:** NodeCanvas ~516 рядків, SceneEditorPanel ~526 рядків

## Аналіз перетинів

| Аспект | Scene Editor | Node Editor |
|--------|-------------|-------------|
| Редагування тексту | ✅ EditTab (deprecated → SceneEditorForm) | ✅ SceneEditorPanel (через SceneEditorForm) |
| Вибори (choices) | ✅ Повний (ChoiceEditor) | ✅ Повний (ChoiceEditor) |
| Фонове зображення | ✅ | ✅ |
| Аудіо (voice/music) | ✅ | ❌ |
| Splash screen | ✅ | ❌ |
| Інтерактивні об'єкти | ✅ | ❌ |
| Blocks редакція | ✅ | ❌ |
| LEGO canvas | ✅ | ❌ (NodeCanvas — інший тип) |
| Таймлайн | ✅ (через LEGO) | ❌ (через SceneEditorPanel) |
| Граф сцен | ❌ | ✅ NodeCanvas |
| Зв'язки між сценами | Через choice.sceneId | Візуально через SVG edges |

## Рекомендація: **Залишити окремими, але витягти спільні компоненти**

### Чому не об'єднувати зараз

1. **Різна мета** — Scene Editor для детального редагування однієї сцени, Node Editor для макро-управління потоком історії
2. **Різна складність** — NodeCanvas — це ~500 рядків кастомного SVG canvas з zoom/pan/drag, що не має сенсу вбудовувати у Scene Editor
3. **Різні контексти використання** — автор може використовувати обидва редактори паралельно
4. **Ризик регресії** — об'єднання може зламати обидва робочі процеси

### Що можна зробити

1. **Витягти `EditTab` як спільний компонент** — використовується і в Scene Editor, і може бути вбудований в Node Editor `SceneEditorPanel`
2. **Створити навігацію між редакторами** — кнопка "Open in Node Editor" в Scene Editor та "Open in Scene Editor" в Node Editor
3. **Уніфікувати меню навігації** — `handleGraphNavigate` в EditTab зараз порожній (`() => {}`), він повинен працювати і в Node Editor

### План реалізації (майбутній)

```
Поетапно:
1. Витягти EditTab → окремий пакетований компонент
2. SceneEditorPanel (node-editor) → використовує EditTab замість власної копії
3. Додати кнопку "Open Graph View" в Scene Editor header
4. Додати кнопку "Open Detail Editor" в NodeCanvas sidebar
```

## Активні проблеми

1. **Дублювання коду** — SceneEditorPanel має власну версію UI для редагування тексту/виборів, що дублює EditTab
2. **`handleGraphNavigate` не реалізований** — у EditTab передається `() => {}`, але в Node Editor він працює
3. **Node Editor не має всіх полів** — відсутні voice, music, splash, interactive objects
4. **Зберігання** — обидва редактори зберігають через `storyContextEnhanced`, але Node Editor ще викликає `loadStories()` після кожної операції — це може призвести до race conditions