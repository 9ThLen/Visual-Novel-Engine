# Consumer Showcase — Single Codex Prompt

Редизайн споживчого шару: головна-вітрина → презентаційна сторінка новели → reader.
Затверджена концепція (2026-07-12): кінематографічна вітрина з живим банером
(паралакс + погода), полиці за настроєм, тизер-гачки замість описів, сторінка
новели в стилі Steam/App Store з рецензіями читачів, збір рецензії на емоційному
піку одразу після фіналу. Авторський світ ховається за кнопкою «Студія».

**Скоуп — Етап 1, повністю локальний (без бекенда).** Рецензії — тільки цього
пристрою; формат зберігання версіонований під майбутній синк. Етап 2 (сервер:
чужі рецензії, глобальні агрегати, «% дочитують») — окремий план після приймання.

Промпт нижче — один, самодостатній, для агента з доступом до репозиторію
(ChatGPT Codex). Вставляється цілком.

---

```text
Ти — senior TypeScript/React Native розробник у цьому репозиторії (Expo +
React Native Web, expo-router, zustand, TypeScript strict). Завдання — редизайн
споживчого шару рушія візуальних новел: головна сторінка перестає бути списком
проєктів автора і стає вітриною для читача; у кожної новели з'являється
презентаційна сторінка з рецензіями; після фіналу читача просять оцінити історію.
Авторські інструменти ховаються за кнопкою «Студія».

Працюй кроками 1→7 нижче, один крок = один коміт. Кожен крок закінчується
зеленими `pnpm test` і `pnpm check` (тести — vitest; НІКОЛИ не запускай npx jest).

════════ КРОК 0 — РОЗВІДКА (нічого не міняй) ════════
Прочитай і зафіксуй для себе:
- app/tabs/index.tsx — теперішня головна: bootstrap-логіка (hydration стора,
  migrateFromLegacyKeys, сідінг демо-історій з assets/demo-story*.json, сідінг
  медіатеки, migrateStoryImageAssetIds) + список карток. Bootstrap ти будеш
  ПЕРЕНОСИТИ, не переписувати.
- stores/use-app-store.ts, stores/app-store-types.ts, stores/app-store-slices/* —
  форма стора: storiesMetadata (StoryMetadata з lib/story-domain.ts), записи сцен
  по історіях (SceneRecord з lib/engine/types.ts), saveSlots (SaveSlot: storyId,
  sceneId, timestamp, sceneName; quick-слоти мають префікс id 'quick-'), персист
  (partialize/whitelist).
- lib/engine/types.ts — SceneRecord (connections: SceneConnection[], isStart,
  timeline: TimelineStep[]), TimelineStep { blockType, data, enabled },
  DialogueBlockData { entries: [{ text, speakerName? }] }, TextBlockData { content },
  ChoiceBlockData { options: [{ text }] }, EffectBlockData { effectType },
  BackgroundBlockData { assetId }.
- components/reader/useParallaxLayer.ts — useParallaxLayer(enabled, config) →
  reanimated-стиль; пресет PARALLAX_LAYERS.background. НЕ змінювати.
- components/reader/WeatherEffectsLayer.web.tsx — WeatherEffectsLayer({ effects,
  target }); подивись точний тип effects і як його конструює reader; перевір,
  чи є нативна версія (якщо погода web-only — на нативі не рендерити).
- stores/media-library-actions (getLibraryAssets → LibraryAsset { id, uri, name,
  type }) і lib/story-image-library.ts + imageAssetIdsByStory у сторі — так
  assetId перетворюється на uri і так знаходяться зображення історії.
- app/reader.tsx — параметри роута (storyId, resume); app/story-home.tsx — як
  читається storyId; lib/navigation-transition.ts — navigateWithViewTransition.
- lib/translations.ts — формат i18n (словники EN і UK), хук useI18n.
- Де reader розуміє «історія закінчилась» (термінальна сцена без connections
  дограла до кінця): шукай у app/reader.tsx, components/reader/*, хуках
  виконання сцен. Опиши знахідку в підсумковому звіті.

НАСКРІЗНІ ПРАВИЛА (діють у кожному кроці):
- Жодних нових npm-залежностей.
- Усі видимі рядки — через lib/translations.ts, ОБИДВІ мови (EN і UK).
- Вітринні екрани мають власну фіксовану темну палітру, незалежну від
  світлої/темної теми застосунку: lib/showcase/showcase-colors.ts,
  SHOWCASE_COLORS = { bg: '#131320', card: '#1c1c2e', text: '#f2f1fb',
  secondary: '#b9b6d9', muted: '#8a87ad' } (+ додай, що знадобиться).
  НЕ useColors() на вітринних екранах.
- Живий банер НЕ монтує reader — тільки зображення + паралакс + погодний шар.
  Головна має відкриватись миттєво.
- Reader-логіку чіпати ТІЛЬКИ в кроці 6, мінімальним диффом.
- Reader, editor, story-home, Plate — поза кроком 6 не змінювати.

════════ КРОК 1 — showcase-домен (чиста логіка) ════════
lib/showcase/story-showcase.ts — чисті функції БЕЗ імпортів zustand/react
(доменні типи з lib/engine/types.ts і lib/story-domain.ts використовувати можна).

Вхід прогресу:
  export interface ShowcaseProgressInput {
    latestSave: { sceneId: string; timestamp: number } | null;
    endingsReached: string[];   // id термінальних сцен, які читач бачив
  }

Функції (не довіряй формі data: перевіряй структурно, невалідне пропускай):
1. extractTeaser(scenes: SceneRecord[], startSceneId: string): string | null —
   по timeline стартової сцени по порядку: перший enabled dialogue-крок → текст
   першого entry з непорожнім text; немає dialogue → перший enabled text-крок →
   content. Обрізати до 140 символів по межі слова + «…». Немає нічого → null.
2. estimateReadMinutes(scenes: SceneRecord[]): number — слова в усіх enabled
   dialogue-entries + text.content + choice.options.text, / 180 слів/хв,
   Math.ceil, мінімум 1.
3. countEndings(scenes): number — сцени без жодного connection; нуль таких → 1.
4. countBranches(scenes): number — сцени з >= 2 connections АБО enabled
   choice-кроком з >= 2 options.
5. pickBannerEffect(scenes, startSceneId): 'rain' | 'snow' | 'fog' | null —
   перший enabled effect-крок стартової сцени з таким effectType.
6. firstBackgroundAssetId(scenes, startSceneId): string | null.
7. buildShowcaseStory(metadata: StoryMetadata, scenes: SceneRecord[],
   progress: ShowcaseProgressInput): ShowcaseStory:

   export interface ShowcaseStory {
     id: string; title: string; author: string | null;
     coverUri: string | null;            // thumbnailUri
     teaser: string | null;
     tags: string[];
     readMinutes: number;
     endingsTotal: number;
     endingsSeen: number;                // перетин endingsReached з реальними термінальними сценами
     branchCount: number;
     bannerEffect: 'rain' | 'snow' | 'fog' | null;
     bannerBackgroundAssetId: string | null;
     hasStarted: boolean;                // latestSave !== null
     isFinished: boolean;                // endingsSeen > 0
     lastSaveTimestamp: number | null;
     lastSceneId: string | null;
     createdAt: number; updatedAt: number;
   }

8. buildShelves(stories: ShowcaseStory[], now: number): ShowcaseShelves:

   export interface ShowcaseShelves {
     hero: ShowcaseStory | null;
     continueReading: ShowcaseStory[];   // hasStarted && !isFinished, за lastSaveTimestamp desc
     quickReads: ShowcaseStory[];        // readMinutes <= 15, не початі
     fresh: ShowcaseStory[];             // createdAt за останні 14 діб від now
     unexplored: ShowcaseStory[];        // isFinished && endingsSeen < endingsTotal
     all: ShowcaseStory[];               // усі, за updatedAt desc
   }

   hero = перший з continueReading, інакше найновіший за createdAt, інакше null.
   Історія потрапляє максимум в ОДНУ полицю крім all (пріоритет: continueReading >
   unexplored > quickReads > fresh). hero з полиць НЕ виключається.

9. fallbackColorForSeed(seed: string): string — хеш (djb2) → один із 6
   захардкоджених глибоких відтінків (індиго, смарагд, бордо, графіт, глибокий
   синій, фіолет). Використають банер і постери.

Тести __tests__/unit/lib/story-showcase.test.ts: тизер (dialogue перед text,
пропуск disabled, обрізання по слову, null); хвилини (мінімум 1, disabled не
рахуються); кінцівки (2 термінальні → 2, цикл → 1); розвилки; ефект ('glitch'
ігнорується); endingsSeen не рахує неіснуючі id; полиці (пріоритет, hero,
сортування, межа 14 діб); fallback-колір детермінований.

════════ КРОК 2 — reviews-домен + локальне сховище ════════
lib/reviews/reviews-domain.ts:

  export type ReviewRating = 1 | 2 | 3 | 4 | 5;
  export interface StoryReview {
    id: string; storyId: string;
    rating: ReviewRating;
    text?: string;                 // <= 2000 символів, обрізай
    authorName: string;            // дефолт 'Читач'
    deviceId: string;
    createdAt: number; updatedAt: number;
    endingsSeenAtReview: number;
    finishedAtReview: boolean;
    helpfulVotes: number;
    votedHelpfulByMe: boolean;
  }
  export type ReviewVerdict = 'overwhelminglyPositive' | 'veryPositive'
    | 'positive' | 'mixed' | 'negative';
  export interface ReviewAggregate {
    count: number;
    average: number;                          // 1 знак після коми
    distribution: Record<ReviewRating, number>;
    verdict: ReviewVerdict | null;            // null якщо count < 3
  }

  computeAggregate(reviews): ReviewAggregate — вердикт за часткою оцінок >= 4:
  >= 0.95 і count >= 10 → overwhelminglyPositive; >= 0.85 → veryPositive;
  >= 0.70 → positive; >= 0.40 → mixed; інакше negative.
  sortReviews(reviews, 'helpful' | 'recent') — helpful: votes desc, потім
  updatedAt desc; recent: updatedAt desc. Без мутації входу.

lib/reviews/reviews-store.ts — персистенція через ін'єктований інтерфейс:
  export interface KVStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  }
Ключі: 'vn.device-id' (uuid, ліниво) і 'vn.reviews.v1.<storyId>' — конверт
{ version: 1, reviews: StoryReview[] }.
createReviewsStore(storage: KVStorage) → { ensureDeviceId, getReviews(storyId),
getMyReview(storyId), upsertMyReview(storyId, { rating, text?, authorName?,
endingsSeen, finished }), toggleHelpful(storyId, reviewId) }.
Одна рецензія на deviceId на історію (upsert зберігає createdAt і helpfulVotes).
toggleHelpful: ±1, не нижче 0, no-op на власній рецензії. Зіпсований JSON чи
чужа version → порожній список, жодних винятків назовні. crypto.randomUUID з
фолбеком. Адаптер до реального сховища застосунку — lib/reviews/reviews-storage.ts:
подивись, чим проєкт користується для key-value персисту (AsyncStorage чи
обгортка), і загорни в KVStorage.

lib/reviews/review-prompt.ts:
  shouldPromptForReview(endingsBefore: number, endingsAfter: number,
    hasMyReview: boolean): boolean
  true якщо: endingsAfter > endingsBefore І (endingsBefore === 0 АБО !hasMyReview).

Тести __tests__/unit/lib/reviews.test.ts (мок KVStorage на Map): усі пороги
вердиктів на граничних значеннях; count < 3 → null; сортування без мутації;
upsert створення→оновлення (createdAt зберігся); обрізання text; toggleHelpful
туди-назад і no-op на своїй; зіпсований JSON; стабільний deviceId; таблиця
випадків shouldPromptForReview.

════════ КРОК 3 — LiveSceneBackdrop ════════
components/showcase/LiveSceneBackdrop.tsx — «дурний» компонент живого фону
(жодних сторів/роутера/i18n; React.memo):

  export interface LiveSceneBackdropProps {
    backgroundUri: string | null;
    effect: 'rain' | 'snow' | 'fog' | null;
    fallbackSeed: string;
    height: number;
    scrimOpacity?: number;       // дефолт 0.55
    parallaxEnabled?: boolean;   // дефолт true
    children?: React.ReactNode;
  }

1. backgroundUri є → <Image resizeMode="cover"> в Animated.View зі стилем
   useParallaxLayer(parallaxEnabled, PARALLAX_LAYERS.background); обгортка
   overflow:'hidden' (overscan не вилазить).
2. backgroundUri немає → заливка fallbackColorForSeed(fallbackSeed) + велика
   напівпрозора перша літера seed по центру.
3. effect → WeatherEffectsLayer поверх зображення, під скрімом (сконструюй
   мінімальний валідний елемент effects з помірною інтенсивністю; web-only,
   якщо нативної версії немає).
4. Скрім — суцільний напівпрозорий чорний блок унизу (~45% висоти, БЕЗ
   градієнта), у ньому children.

Тести __tests__/unit/components/LiveSceneBackdrop.test.tsx (дивись сусідні
компонент-тести і __mocks__/react-native-reanimated.ts): детермінований
fallback-колір; children рендеряться; Image є лише за наявності backgroundUri.

════════ КРОК 4 — головна-вітрина ════════
1. Винеси bootstrap-логіку з app/tabs/index.tsx у hooks/useLibraryBootstrap.ts
   ЯК Є (перенос коду, поведінка ідентична, повертає { isInitialized }).
   Існуючі тести мають лишитись зеленими.
2. lib/showcase/showcase-adapter.ts — стор → домен: збери StoryMetadata +
   SceneRecord[] кожної історії; ShowcaseProgressInput зі saveSlots (latestSave =
   найсвіжіший слот історії за timestamp, включно з quick/autosave) і
   endingsReached з endingsReachedByStory?.[storyId] ?? [] (поле з'явиться в
   кроці 6 — пиши опційно); resolveAssetUri(assetId) через getLibraryAssets.
   Логіку тримай чистими функціями від переданих даних.
3. Новий app/tabs/index.tsx:
   - Хедер: назва застосунку; праворуч «Студія» (іконка+текст → '/editor') і
     налаштування (іконка → '/settings').
   - Банер: shelves.hero через LiveSceneBackdrop (висота ~55% екрана, на web
     max 480px). У скрімі: чіпи (теги, readMinutes, 'кінцівок: N · відкрито M'
     якщо hasStarted), назва, тизер курсивом у лапках, кнопки: primary
     «Читати»/«Продовжити» (hasStarted → params resume:'1') і secondary
     «Докладніше» → '/story-page' з params { storyId }.
   - Полиці: continueReading («Ти зупинився тут»), fresh («Нове»), quickReads
     («Коротке на вечір»), unexplored («Не всі кінцівки відкриті»), all («Всі
     історії»). Порожні не рендеряться. Полиця = заголовок + горизонтальний
     FlatList постерів 2:3 (ширина ~150; cover або fallbackColorForSeed),
     назва + підпис (readMinutes або прогрес). Тап по постеру → '/story-page'.
     Мемоізовані картки.
   - Переходи — через navigateWithViewTransition, як у теперішньому коді.
   - Захисний стан «немає історій» (мінімальний, з кнопкою «Студія»).
   - i18n-ключі 'showcase.*' обома мовами. Палітра — SHOWCASE_COLORS.
4. Тести: __tests__/unit/lib/showcase-adapter.test.ts (latestSave за timestamp;
   resolveAssetUri id→uri; endingsReached відсутнє поле → []).

════════ КРОК 5 — презентаційна сторінка новели ════════
app/story-page.tsx (роут expo-router, storyId з useLocalSearchParams — як у
app/story-home.tsx; немає історії → м'який fallback з кнопкою назад):
1. Банер: LiveSceneBackdrop (~40% екрана); поверх — «Бібліотека» (назад) зліва
   вгорі, «Студія» справа вгорі. У скрімі: назва, рядок мети (автор · теги ·
   readMinutes · 'кінцівок: N'), рейтинг (зірки + 'X.X · N рецензій · вердикт'
   з computeAggregate; count 0 чи verdict null → 'ще немає рецензій'),
   CTA «Читати»/«Продовжити» (під кнопкою дрібно 'зі сцени: <sceneName
   останнього слота>', якщо є).
2. Галерея кадрів: горизонтальний ряд до 6 зображень історії
   (imageAssetIdsByStory + медіатека, ~16:9, заокруглені); немає → не рендерити.
3. Опис: description; порожній → teaser.
4. Метрики: три картки — branchCount («розвилки»), 'endingsTotal · відкрито
   endingsSeen', readMinutes. Тільки реально пораховані числа.
5. Рецензії: перемикач сортування helpful/recent; агрегат (велика цифра +
   розподіл смужками 5→1); картки рецензій (коло-ініціали authorName, ім'я,
   бейдж 'дочитав · N кінцівок', зірки, текст, 'Корисно · N' → toggleHelpful).
   Порожньо → «Стань першим рецензентом» + кнопка «Оцінити» (переиспользуй
   форму RatingForm з кроку 6 — тому реалізуй її як окремий компонент
   components/reviews/RatingForm.tsx: 5 зірок + опційний textarea + Зберегти).
   Власна рецензія — зверху, з позначкою «Твоя рецензія» і кнопкою «Змінити».
6. Кнопка «Редагувати цю історію» (для всіх історій — пристрій авторський):
   веди туди, куди зараз відкривається історія для редагування (подивись, як
   це роблять editor/story-home, і повтори точний виклик).
7. i18n 'storyPage.*'; палітра SHOWCASE_COLORS; мемоізація списків.
Тести: __tests__/unit/components/story-page-reviews.test.tsx — агрегат і картки
з фейковими рецензіями; toggleHelpful викликається; порожній стан.

════════ КРОК 6 — фінал: трекінг кінцівок + оцінка (ЄДИНИЙ дотик до reader) ════════
1. Персист: додай у стор endingsReachedByStory: Record<string, string[]>
   (storyId → id термінальних сцен) — за зразком існуючих слайсів; поле МАЄ
   потрапити в persist (перевір partialize/whitelist). Екшен
   recordEndingReached(storyId, sceneId) — ідемпотентний.
2. У точці «історія закінчилась» (знайдена в кроці 0) виклич
   recordEndingReached. Мінімальний дифф.
3. components/reader/PostFinaleRating.tsx — компактний оверлей поверх
   фінального екрана, НЕ блокує наявні кнопки (закривається хрестиком/тапом повз):
   заголовок «Кінцівку відкрито» (+ назва сцени, якщо доступна), RatingForm
   (з кроку 5), кнопки «Зберегти» і «Пізніше». Зберегти → upsertMyReview(storyId,
   { rating, text, endingsSeen: endingsReachedByStory[storyId].length,
   finished: true }). Показ — за shouldPromptForReview (endingsBefore =
   кількість до recordEndingReached, endingsAfter = після, hasMyReview з
   getMyReview). Поява — м'який fade+slide (reanimated). Стилі — консистентні
   з reader (подивись ReaderMenu), i18n 'finale.*'.
4. Тести: recordEndingReached (ідемпотентність, персист — за зразком
   __tests__/unit/stores/*).
ЗАБОРОНЕНО: міняти логіку виконання сцен, збереження/завантаження, будь-що
в reader поза точкою фіналу.

════════ КРОК 7 — наскрізна перевірка ════════
pnpm dev:web і пройди руками весь сценарій приймання:
1. Застосунок відкривається на вітрині одразу (bootstrap живий, демо-історії є).
2. Банер: живий фон (паралакс від курсора; погода, якщо у демо є ефект),
   тизер, «Читати» веде в першу сцену.
3. Тап по постеру → сторінка новели; «Бібліотека» повертає назад.
4. Пройди демо до фіналу → оверлей оцінки → постав оцінку з текстом.
5. Сторінка цієї новели показує рейтинг, вердикт-рядок і твою рецензію;
   «Змінити» працює; повторний прохід тієї ж кінцівки оверлей не показує.
6. «Студія» відкриває редактор; редактор, story-home і reader працюють як до змін.
7. Перезавантаж сторінку — рецензія і відкриті кінцівки збереглись.
`pnpm test` і `pnpm check` зелені. Зроби скриншоти: головна (банер + полиці),
сторінка новели (шапка + рецензії), оверлей після фіналу.

У підсумковому звіті: де знайдена точка «кінець історії» (крок 0), список
нових файлів, відхилення від цього ТЗ з обґрунтуванням.
```

---

## Що свідомо відкладено на Етап 2 (бекенд)

- Чужі рецензії, глобальні агрегати, «% дочитують», «N% обрали...».
- Синк конвертів `vn.reviews.v1.*` на сервер (формат уже версіонований під це).
- Акаунти не плануються і в Етапі 2 — anonymous deviceId + ім'я.
