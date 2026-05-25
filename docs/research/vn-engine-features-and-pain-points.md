# Дослідження: Функції та складноші в інструментах для створення візуальних новел

**Дата:** 25 травня 2026
**Джерела:** r/vndevs, r/visualnovels, r/gamedev (Reddit) + аналіз конкурентів

---

## 1. Які фічі хотіли б бачити користувачі

### 1.1. Візуальне програмування діалогів

**Запит:** node-based / visual scripting для діалогових дерев

- Пост "Thinking of Making My VN on Unity Instead of Ren'Py" — розробник шукає NaniNovel саме через візуальну структуру
- Пост "Tools to Create on VNs" — розробник шукає інструменти для "organizing the logical structure" в Unity
- Пост "Cloudnovel is soooo much improved" — позитивно прийнятий online VN maker з візуальним інтерфейсом

**Висновок:** Користувачі хочуть **бачити** логіку діалогів візуально, а не писати код. Особливо для складних розгалужень.

### 1.2. Вбудована підтримка анімацій та рухомих спрайтів

- Пост "Hey I am need preset for renpy" — 300K слів написано, 30% артів готово, **застряг на коді анімацій**. Хочеш готовий пресет, не хочеш вчити ATL
- Phone interface (Steins;Gate-style) — запитують готовий код для телефону в грі
- Live2D інтеграція згадується як must-have фіча

**Висновок:** Готові шеми анімацій (fade, slide, bounce, shake, Live2D) — критичний запит. Не хочуть писати ATL/GDscript/JavaScript.

### 1.3. Інтегровані системи: календар, час, розклад NPC

- Пост "How important are calendar system and the passage of time" — розробник створює інструмент для worldbuilding через scheduling. NPС behavior через scheduling — інноваційна фіча, якої ніде немає

**Висновок:** Календар і система часу — неочевидна, але потужна фіча для імерсивних VN.

### 1.4. Готові UI-компоненти без коду

- Phone coding (Steins;Gate-style) — "anyone have already done it? if you did can you share your code?"
- "I found some Ren'py code for a scrolling choice screen" — хочуть готовий UI, не хочуть розбиратися з кодом

**Висновок:** Готові компоненти: phone UI, inventory, choice screen, notification system — все це користувачі намагаються знайти готовим.

### 1.5. Інструменти планування та roadmap

- Пост "Any tips of roadmapping" — письменник/художник не знає як планувати VN проект. Він знає story, characters, worldbuilding — але **не знає як структурувати розробку**
- "I underestimated the importance of planning ahead" — найбільший сюрприз після релізу

**Висновок:** Вбудовані інструменти планування (story outline, route planning, asset tracking) — запит.

### 1.6. Multi-platform export

- "As a Unity Dev, should I commit to NaniNovel or switch to Ren'py?" — обирають Unity через консольний реліз
- Пости про портування з Unity до Ren'Py — switching costs високі

**Висновок:** Експорт на консоли, мобільні, web — критично для професійних розробників.

---

## 2. Складнощі, через які користувачі НЕ роблять свою VN

### 2.1. 🛑 Кодування / Програмування (ГОЛОВНА ПРОБЛЕМА)

- "I'm stuck at the coding part" — 300K слів готово, арт на 30% — застряг на коді
- "huge issues when it comes to programming, especially understanding" — Ren'Py vs Visual Novel Maker
- "I've been wanting to do this for one year or so but I never really got the motivation or patience" — типовий патерн

**Суть проблеми:** Ren'Py потребує Python. Godot потребує GDscript. Unity потребує C#. Навіть "легкі" двигуни вимагають базового програмування. Це відсікає **письменників і художників** — основну аудиторію для VN.

### 2.2. 🛑 Мультидисциплінарність (складність повного стеку)

- "It took us 1 year to make a ten minute visual novel" — 3 людини, 12 місяців, 10 хв гри
- "No budget" + solo dev = story + art + code + music + marketing — одна людина
- "I'm doing all of this by myself..not of age yet, cant make money to hire anyone"

**Суть проблеми:** Один повний цикл — від ідеї до релізу — потребує: сценарій, арт (спрайти, BG, CG, GUI), музика, SFX, код, тестування, маркетинг. Це **проект на 1000+ годин** для новачка.

### 2.3. 🛑 Обсяг контенту (scope)

- "I had have this idea of making my own AVN for a while and It's going to be released as parts" — навіть плануючи "частини", scope занадто великий
- 19 років розробки (Four Lights) — extreme case, але показує тенденцію
- "Tenfold Tales" — розробник хоче максимальну інтерактивність, що збільжує scope

**Суть проблеми:** Юнаки-розробники уявляють досвідчений продукт спочатку. Не розуміють що 1 година якісної VN потребує ~100-200 робочих годин.

### 2.4. 🛑 Анонімність / відсутність зворотного зв'язку

- "Any developers looking for a buddy?" — 18 місяців сольної розробки, "pushing through the project blind"
- "It almost feels as if I am pushing through the project blind" — немає feedback

**Суть проблеми:** Розробка VN — самотня справа. Немає код-рев'ю, немає playtesting, немає чіткого розуміння "це працює чи ні".

### 2.5. 🛑 Мотивація та тайм-менеджмент

- "never really got the motivation or patience for it"
- "still havent been able to make any progress.. it is a bit embarassing as its been months" — мотивація зникає
- Пivot from ambitious to simple project — частина процесу

**Суть проблеми:** VN розробка — це марафон. Без чіткого плану та milestone'ів — люди кидають.

### 2.6. 🛑 Арт (якість та кількість)

- "Seeking Writer-Illustrators for Commissioned Interactive Stories" — поширений запит
- "I'm an artist with no dev experience, can I make a short dating sim solo?" — один з самих популярних постів
- "Best options for a VN Dev with no Art Skills?" — #1 pain point для програмістів

**Суть проблеми:** Аніме-арт — дорогий. Один спрайт: $200-500. Один BG: $100-300. Повний набір: $5,000-20,000. Для хобі-проекту — непідйомно.

### 2.7. 🛑 Маркетинг та дистрибуція

- "marketing may well be the toughest part" — навіть після релізу
- "How do I market to Japanese audiences?" — навіть дистрибуція складна
- "Visual Novel Development: Asset flips vs Using pre made assets" — як конкурувати на ринку

**Суть проблеми:** Сама розробка — це 50% роботи. Другі 50% — маркетинг, який новачки не вміють.

---

## 3. Що кажуть розробники про наявні інструменти

### Ren'Py
**Плюси:** безкоштовний, зрілість, велика спільнота, документація
**Мінуси:**
- Python coding barrier — найбільша перешкода для нетехнічних
- ATL (Animation Transformation Language) — потрібен для анімацій, але складний
- GUI кастомізація потребує знання Screen Language
- Десктопний фокус — мобільний експорт може мати проблеми
- Немає візуального editor'а діалогів (текстовий скрипт)

### NaniNovel (Unity)
**Плюси:** візуальна структура, Unity ecosystem, консольний експорт
**Мінуси:** Unity subscription контроерсія, менша спільнота, не безкоштовний

### Visual Novel Maker (TyranoBuilder)
**Плюси:** GUI-based, drag & drop, без коду
**Мінуси:** обмежена гнучкість, проблеми з мобільним експортом, менша спільнота

### Godot + Dialogic
**Плюси:** безкоштовний, open source, гнучкий
**Мінуси:** потребує GDscript, спільнота менша за Ren'Py, менше готових рішень

### Cloudnovel (онлайн)
**Плюси:** легкий старт, простий GUI, collaborative
**Мінуси:** обмежена функціональність, онлайн-only

---

## 4. Необхідні фічі ідеального інструменту (synthesis)

На основі аналізу запитів та скарг:

### Must-have:
1. **Node-based / Visual scripting** для діалогів — без коду
2. **Ready animation presets** — fade, slide, bounce, shake, Live2D
3. **Built-in phone/UI components** — Steins;Gate-style phone, notifications
4. **Character sprite system** — шари для частин тіла, авто-позиціювання
5. **Asset management** — вбудований менеджер спрайтів/BG/CG
6. **Branching visualizer** — граф діалогових шляхів
7. **Game variables + conditions** — візуальна логіка без коду

### Nice-to-have:
1. **Calendar/time system** — для імерсивних VN
2. **Multi-route management** — візуальний менеджер маршрутів
3. **Built-in analytics** — playtesting, choice tracking
4. **Collaborative tools** — як Google Docs для VN
5. **Marketplace/templates** — готові теми, шейри проектів
6. **One-click export** — PC, web, mobile, consoles
7. **AI-assisted art placeholder** — генерація тимчасових спрайтів
8. **Sound/music integration** — вбудований аудіоменеджер

### "Killer features" (чого ніде немає):
1. **AI-assisted writing** — dialogue generation, branch suggestions
2. **Automatic sprite composition** — з окремих шарів (hair, eyes, mouth, body)
3. **Smart template system** — "dating sim template", "mystery template", "horror template"
4. **Integrated project planning** — story outline + asset tracking + schedule
5. **Built-in playtesting** — з feedback від тестерів без збираняня

---

## 5. Портрет користувача, який НЕ може зробити VN

### "Письменник-новачок":
- ✅ Має ідею, персонажів, історію
- ✅ Може написати сценарій
- ❌ Не знає програмування
- ❌ Не малює
- ❌ Не знає дизайн GUI
- ❌ Не знає маркетинг
- **Потрібен:** no-code tool + template system + asset marketplace

### "Художник-соло":
- ✅ Може малювати спрайти та BG
- ✅ Має візуальний стиль
- ❌ Не знає програмування
- ❌ Не пише сценарії
- ❌ Не знає музику/SFX
- **Потрібен:** no-code tool + writing assistants + music library

### "Програміст-початківець":
- ✅ Знає основи коду
- ❌ Не малює
- ❌ Не пише сценарії
- ❌ Не знає game design
- **Потрібен:** visual scripting + art marketplace + story templates

### "Команда без  budget":
- ✅ Має розподіл ролей (письменник + художник + музик)
- ❌ Немає грошей на інструменти та асети
- ❌ Не знає project management
- **Потрібен:** безкоштовний інструмент + collaborative tools + free assets

---

## 6. Висновки для Visual Novel Studio

### на що зосередитися:

1. **Візуальне редагування діалогів (Lego-подібна система)** — замість коду → blocks/nodes
2. **Zero-code animation presets** — вибір з панелі, не ATL
3. **Template-based workflow** — "створи за 30 хвилин" з готового шаблону
4. **Вбудовані UI-компоненти** — phone, inventory, menu як готові blocks
5. **Real-time collaboration** — Google Docs підхід до VN розробки

### конкурентні переваги:
- Ren'Py: має coding barrier → **знищити цей barrier**
- NaniNovel: платний, Unity-dependent → **безкоштовний або дешевший**
- VNMaker: обмежений → **більша гнучкість без коду**
- Godot+Dialogic: потребує GDscript → **без скриптів**

---

*Дослідження зібране на основі Reddit-постів з r/vndevs, r/visualnovels, r/gamedev (зима-весна 2026)*
