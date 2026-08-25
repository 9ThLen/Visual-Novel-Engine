# План: Медіатека історії

**Статус:** план узгоджено після архітектурного рев'ю. Оновлено 2026-08-24 — нумерація релізів приведена до графа залежностей (див. «Порядок релізів»).

**Обсяг:** повноекранна медіатека історії з вкладками «Зображення» / «Відео», фільтрами-персонажами, сіткою й інспектором медіафайлу. Заміна поточного екрана `/story-gallery`.

**Поза цим релізом:** аудіо у медіатеці, повторне використання сітки в пікерах фону/спрайта/відео, тегування, мультивибір і пакетні дії.

---

## 1. Правки до вихідної концепції

Композиція, візуальний характер і головна теза («натиснув на персонажа — побачив усі його образи») зберігаються. Правки стосуються місць, де концепція описувала модель даних, якої в проєкті немає.

### 1.1 Фільтри зображень: `Усі / Використані / Невикористані / <персонажі>`

У сховищі немає ознаки «фон»: кожне не-спрайтове зображення історії — це `LibraryAsset` у `imageAssetIdsByStory`. «Фони» і «Без персонажа» повертали б перетинні набори. Єдиний критерій, що реально обчислюється, — використання у таймлайні ([asset-usage.ts:94](lib/asset-usage.ts:94)). Це та сама тріада, яку концепція вже обрала для відео.

### 1.2 Одна плитка = одне зображення; персонаж — це бейдж

`CharacterSprite` не лежить у `mediaLibrary` і не має `assetId` ([character-types.ts:9](lib/character-types.ts:9)). Дедуплікація за канонічною медіа-ідентичністю (див. 2.2); власники показуються бейджами.

### 1.3 Власність адитивна — «Змінити персонажа» не існує

Ідентичність спрайта у сцені композитна: `${characterId}:${spriteId}` ([asset-usage.ts:44](lib/asset-usage.ts:44)), і обидва поля лежать у блоці ([engine/types.ts:178](lib/engine/types.ts:178)). Тому перенесення спрайта між персонажами розриває посилання **за будь-якої** стратегії збереження id. Замість «Змінити персонажа»:

- **«Додати персонажу…»** — новий `CharacterSprite` з новим id і тим самим URI;
- **«Прибрати з ‹персонаж›»** — лише коли `usage.enabled + usage.disabled === 0`;
- **«Використовується у N сценах»** — коли прибрати не можна;
- **«Зробити основним спрайтом»** — окремо для кожного власника.

### 1.4 «Прибрати з історії» доступне лише для невикористаного

Membership не зберігається — він перевиводиться при кожній гідратації: `migrateStoryImageAssetIds(..., includeReferencedImages = true)` ([story-image-library.ts:116](lib/story-image-library.ts:116)) і `migrateStoryMediaAssetIds`, що об'єднує timeline-, sprite-, аудіо- й cover-посилання ([story-media-library.ts:73](lib/story-media-library.ts:73)). Тому видалення використаного активу не просто лишає плитку на екрані — воно **відкочується після перезапуску**. Це вже наявний баг поточного екрана.

У R1 дія доступна за `assetId != null`, `owners.length === 0`, `usage.enabled + usage.disabled === 0`. У заблокованому стані показуємо перелік сцен із «Відкрити сцену», щоб автор міг зняти використання сам — обіцянка концепції зберігається, повний набір source-aware дій приходить у R2.

### 1.5 «Осиротілі спрайти» — окремий реліз

Переведення спрайтів видаленого персонажа в «без персонажа» вимагає матеріалізувати `sprite.uri` як `LibraryAsset` — зміна persisted state, плюс правки в inline-скрипті iframe ([embedded-script.ts:5406](lib/vn-plate-editor/embedded-script.ts:5406)). Винесено в R3.

---

## 2. Модель відображення

Новий шар у `lib/story-gallery.ts`. Persisted state не змінюється.

### 2.1 Типи

```ts
export type MediaKind = 'image' | 'video';

/** Персонаж, якому належить цей URI. Порожній список = «без персонажа». */
export interface MediaOwner {
  characterId: string;
  characterName: string;
  color?: string;
  spriteId: string;
  spriteName: string;
  isDefaultSprite: boolean;
  /** Композитний ключ посилання: `${characterId}:${spriteId}`. */
  usageAssetId: string;
}

export interface MediaReference {
  sceneId: string;
  sceneName: string;
  stepId: string;
  kind: AssetUsageKind;
  enabled: boolean;
}

export interface StoryMediaItem {
  /** `asset:<id>` коли URI є в mediaLibrary, інакше `sprite-uri:<canonicalUri>`. */
  key: string;
  kind: MediaKind;
  /** Канонічний URI для збереження й дій: `assetUri ?? uri`. Показ — через resolveAssetUri. */
  uri: string;
  name: string;
  /** asset.addedAt, або sprite.createdAt для спрайта поза бібліотекою. */
  addedAt: number;
  assetId?: string;
  owners: MediaOwner[];
  usage: GalleryUsage;          // { enabled, disabled } по всіх ролях цього URI
  references: MediaReference[];
  sizeBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
}

export interface StoryMediaGallery {
  images: StoryMediaItem[];   // за addedAt спадно
  videos: StoryMediaItem[];
  characterFilters: { characterId: string; name: string; color?: string; avatarUri?: string; count: number }[];
  counts: { images: number; videos: number; used: number; unused: number };
}
```

### 2.2 Канонічна медіа-ідентичність

`CharacterSprite` має два поля: `uri` (у редакторі web може тимчасово нести `blob:`) і `assetUri` (постійне). Канонічна форма в сторі — `uri` = постійний, `assetUri` відсутній: `restorePersistentCharacterUris` викидає `assetUri` на виході з iframe ([PlateWebViewEditor.web.tsx:33](components/vn-plate-editor/PlateWebViewEditor.web.tsx:33), застосовується на 568 і 588), а нативний редактор його не встановлює взагалі. У персистованому стані `assetUri` з'являється переважно з імпорту бекапу ([story-backup/import.ts:179](lib/story-backup/import.ts:179)) — тож alias-шлях є **шляхом сумісності**, не основним.

Порядок резолву ідентичності (детермінований, перший збіг виграє):

1. `sprite.assetUri` → `LibraryAsset.id`
2. `sprite.assetUri` → `LibraryAsset.uri`
3. `sprite.uri` → `LibraryAsset.id` (`sprite.uri` може містити саме id — див. [image-placement.ts:45](lib/ai/image-placement.ts:45))
4. `sprite.uri` → `LibraryAsset.uri`

Знайшли asset → додаємо власника до `asset:${id}`. Не знайшли → ключ `sprite-uri:${assetUri ?? uri}`.

**Правило для R2:** спрайти, створені галереєю, ставлять тільки `uri` (постійний) і ніколи `assetUri`.

### 2.3 Правила зведення

- Джерела: story-зображення (`getStoryGalleryImageAssets`), спрайти всіх персонажів, відео (`mediaLibrary.type === 'video'` ∩ `mediaAssetIdsByStory[storyId]`, як у [document-editor.tsx:134](app/document-editor.tsx:134)).
- Коли URI трапляється і як asset, і як спрайт — перемагає asset-запис (він має `assetId`, `size`, `mimeType`), спрайт додає власника.
- `usage` — сума посилань на `asset.id`, `asset.uri` і на `usageAssetId` кожного власника. Зображення-постер відео рахується використаним ([asset-usage.ts:107](lib/asset-usage.ts:107)).
- Аватар фільтра: `defaultSpriteId` → перший спрайт → ініціали на `character.color`.
- Персонаж без спрайтів присутній у `characterFilters` з `count: 0`.

### 2.4 Фільтри й пошук

```ts
export type ImageFilter =
  | { kind: 'all' } | { kind: 'used' } | { kind: 'unused' }
  | { kind: 'character'; characterId: string };
export type VideoFilter = 'all' | 'used' | 'unused';
```

- `used` ⇔ `usage.enabled + usage.disabled > 0`.
- Пошук — по `name`, іменах власників і `spriteName`, регістронезалежно.
- `groupMediaByDate(items, now)` приймає `now` аргументом (детермінізм тестів) і застосовується лише до `{kind:'all'}`.

---

## 3. Порядок релізів

```
R0    save-barrier + тристороннє злиття персонажів
R0.5  lease-aware asset resolver
R0.75 повнота usage
R1    модель, сітка, інспектор, стабільне безпечне видалення
R2    адитивна власність персонажів + інтеграція зі студією
R0.9  ремонт vitest-харнесу (розблокував відкладені acceptance-тести)
R3    осиротілі спрайти (окремо: embedded-script + persisted state)
```

Нумерація відповідає графу залежностей: усе до R1 — prerequisite, бо R1 виносить `usage` і `Використані/Невикористані` в користувацький контракт.

### R0 — Save-barrier + тристороннє злиття персонажів · **ВИКОНАНО**

Реалізовано 2026-08-24: `lib/character-merge.ts`, merge-ефект і save-barrier у `DocumentSceneEditor`, обов'язковий prop через `DocumentRightRail` до `AiChatPanel`, ключ `aiChat.saveBarrierFailed`. Тести: `__tests__/unit/lib/character-merge.test.ts` (13), `__tests__/unit/components/AiChatPanel.save-barrier.test.tsx` (6).

**Проблема.** `DocumentSceneEditor` тримає `localCharacters` у локальному стані ([DocumentSceneEditor.tsx:170](components/document-editor/DocumentSceneEditor.tsx:170)) і пере-сідить його лише при зміні `documentsResetKey` ([DocumentSceneEditor.tsx:240](components/document-editor/DocumentSceneEditor.tsx:240)), який будується зі сцен ([PlateSceneEditor.shared.tsx:91](components/editor/plate/PlateSceneEditor.shared.tsx:91)). `handleSave` пише `localCharactersRef.current` як істину ([DocumentSceneEditor.tsx:417](components/document-editor/DocumentSceneEditor.tsx:417)). Це живий баг: `AiChatPanel` живе всередині редактора ([DocumentRightRail.tsx:111](components/document-editor/DocumentRightRail.tsx:111)), а AI-відкат пише персонажів повз нього ([applied-change-journal.ts:106](lib/ai/applied-change-journal.ts:106)).

**A. Тристороннє злиття.** Новий чистий модуль `lib/character-merge.ts`:

```ts
export function mergeExternalCharacters(
  base: Character[],      // останнє зовнішнє значення, яке редактор бачив
  local: Character[],     // поточний (можливо незбережений) стан редактора
  incoming: Character[],  // нове зовнішнє значення
): Character[];
```

Правила по полю: `local === base` → беремо `incoming`; `incoming === base` → лишаємо `local`; обидва розійшлися → `local` виграє. Спрайти й персонажі: є в `base`, немає в `incoming` → зовнішнє видалення, застосовуємо, якщо локально не редагували; немає в `base`, є в `local` → локально створений, зберігаємо. Різниця, що зводиться лише до `assetUri`/`uri` тієї самої цілі, **не** вважається редагуванням.

**B. Save-barrier.** Обов'язковий (не опціональний) prop через два хопи — рейка рендериться безпосередньо редактором ([DocumentSceneEditor.tsx:870](components/document-editor/DocumentSceneEditor.tsx:870)):

```
DocumentSceneEditor.handleSave → DocumentRightRail.beforeStoryMutation → AiChatPanel
```

Контракт:
- `handleSave` повертає `Promise<boolean>` замість `Promise<void>`, щоб відмову можна було спостерігати;
- guard на повторний вхід (зараз його немає);
- barrier спрацьовує на **всіх** шляхах: scene patch, change set, перший rollback і force-повтор після підтвердження.

Це не додає нової гарантії — це робить правдивими наявні: `hasNewerEdits` ([applied-change-journal.ts:45](lib/ai/applied-change-journal.ts:45)), `requiresConfirmation`/`forceDiscardNewerEdits` ([applied-change-journal.ts:69](lib/ai/applied-change-journal.ts:69)), `STALE_REVISION` ([scene-patch.ts:52](lib/ai/scene-patch.ts:52), [change-set.ts:166](lib/ai/change-set.ts:166)). Поки правки лежать у драфті, стор їх не бачить і всі ці guard'и хибно-негативні. Прецедент у файлі вже є: `handleSelectChoiceOption` робить `await handleSave()` перед перемиканням гілки ([DocumentSceneEditor.tsx:451](components/document-editor/DocumentSceneEditor.tsx:451)).

Мовчазне збереження драфту прийнятне, бо `restoreStorySnapshot` бере автоматичний знімок «Before restore» ([snapshots-slice.ts:15](stores/app-store-slices/snapshots-slice.ts:15)).

**Тести:** новий спрайт вливається; локальний незбережений спрайт виживає; AI-видалений спрайт **не** воскресає; відновлення `name`/`color`/`defaultSpriteId` застосовується; same-field конфлікт → local wins; різниця лише в `assetUri`/`uri` не блокує зовнішню зміну; barrier викликається до apply, до rollback і до force-повтору; відмова save зупиняє мутацію.

### R0.5 — Lease-aware asset resolver · **ВИКОНАНО**

Реалізовано 2026-08-24 у `lib/asset-resolver.ts`: `acquireResolvedAssetUri`, зворотний індекс `mediaAliasKeys`/`storageKeyByAlias`, `evictUnleasedMediaObjectUrl`, `clearUriCache` → `resetAssetResolverForTests`, dev-warning. Тести — 5 нових кейсів у `__tests__/unit/lib/asset-resolver.test.ts` (це єдиний файл, звільнений від мока в `vitest.setup.ts`).

**Проблема.** `resolveIndexedDbMediaUri` кешує object URL-и в `mediaObjectUrlCache` з лімітом `URI_CACHE_MAX_SIZE = 100` і **відкликає** найстаріший при переповненні. Медіатека — перший екран, що резолвить 100+ медіа за сесію, тож прокрутка сітки може вбити джерело відкритого програвача. Наївний retry не рятує: `resolveAssetUri` перевіряє `uriCache` (TTL 5 хв) **до** `resolveUri` і повертає той самий мертвий URL.

**Зміни в `lib/asset-resolver.ts`:**

```ts
const lease = await acquireResolvedAssetUri(assetRef);
// lease.source: string | number
// lease.release(): void
```

- лічильник активних lease для IDB object URL; eviction пропускає pinned;
- якщо всі кандидати pinned — кеш тимчасово перевищує ліміт замість відкликання живого URL;
- `release()` знімає лише pin;
- **зворотний індекс** `storageKey → Set<uriKey>`, що поповнюється в момент резолву; при відкликанні точково чистяться відповідні записи `uriCache`. Тотальний clear неприйнятний: `uriCache` спільний для всіх медіа, і його очищення при кожному eviction дало б постійний cache-thrash саме під час прокрутки сітки. Alias-и реальні — один blob резолвиться через `asset.id`, `asset.uri` і `idb-media://…`, бо `resolveUri` рекурсивно проходить `resolveLibraryAssetUri`;
- для `http`/`file`/`data`/bundled `number` lease — дешева обгортка без ref-count;
- `clearUriCache` → `resetAssetResolverForTests`, явно test-only (зараз 4 входження в репозиторії: визначення + [asset-resolver.test.ts](__tests__/unit/lib/asset-resolver.test.ts));
- dev-warning у момент, коли eviction неможливий через pinned entries і кеш перевищує ліміт.

**Тести:** pinned URL не відкликається після 100+ інших IDB-резолвів; після `release` витісняється; eviction не лишає мертвий promise у `uriCache`; **інвалідація за всіма alias-ами** (id, uri, idb-uri) одночасно; витіснення в `uriCache` за розміром не відкликає object URL; подвійний `release` безпечний; запізнілий acquire після скасування одразу звільняється; попередження про неможливий eviction — рівно одне.

### R0.75 — Повнота usage · **ВИКОНАНО**

Реалізовано 2026-08-24 у `lib/asset-usage.ts`: гілка `dialogue` в `collectAssetReferences` (одне посилання на спрайт на крок, не на репліку) і `sprite.assetUri` в aliases. Тести — 5 кейсів у `asset-usage.test.ts` + 1 в `asset-usage-available.test.ts`. Регресія шести споживачів перевірена повним прогоном; story-doctor тепер звітує про висячий `spriteId` у репліці як broken reference — це навмисно, є окремий тест.

- `collectAssetReferences` враховує `DialogueEntry.spriteId` ([engine/types.ts:212](lib/engine/types.ts:212)) — зараз sprite-посилання емітяться лише з блоків `character`;
- `sprite.assetUri` додається до aliases у `buildAvailableAssets` ([asset-usage.ts:72](lib/asset-usage.ts:72)), інакше membership і usage мають різні правила ідентичності ([story-media-library.ts:95](lib/story-media-library.ts:95));
- регресійний огляд шести споживачів: [story-doctor.ts:536](lib/story-doctor.ts:536), [story-backup/capture.ts:134](lib/story-backup/capture.ts:134), [story-media-library.ts:83](lib/story-media-library.ts:83), [ai/asset-tools.ts:72](lib/ai/asset-tools.ts:72), [AssetUsageCard.tsx:120](components/story-home/AssetUsageCard.tsx:120), `story-gallery.ts`.

Побічний наслідок, який треба зафіксувати: міграції законно почнуть утримувати ще й активи, пришпилені репліками. Для бекапу це строго безпечніше; story-doctor може показати нові broken references у наявних історіях.

**Тест, який ловить регресію**, будує `SceneRecord` напряму: репліка з `spriteId` і **без** відповідного `character`-кроку. Через редактор такий стан майже не виникає — конвертація документа сама генерує `character`-кроки при зміні спрайта ([document-scene.ts:745](lib/document-editor/document-scene.ts:745)); розходження дають AI change set, імпорт бекапу й ручне редагування записів.

### R1 — Модель, сітка, інспектор · **ВИКОНАНО**

Реалізовано 2026-08-24; відкладена acceptance-перевірка закрита в R0.9.

Модель — `lib/story-media-gallery.ts` (23 тести). UI — `components/media-library/` (`MediaGrid`, `MediaFilters`, `MediaInspector` + `MediaInspectorVideo`), переписаний `app/story-gallery.tsx`, 20 тестів у `__tests__/unit/components/MediaLibrary.test.tsx`. Стійкість видалення — 5 тестів у `__tests__/unit/lib/media-removal-durability.test.ts`. Видалено `StoryGalleryCard`, `lib/story-gallery.ts` і його тест. Ключі `mediaLibrary.*` в EN+UK.

Знайдено й виправлено під час перевірки в прев'ю: `ResolvedAssetImage` резолвив лише `idb-media://`, тож bundled-шляхи (`assets/...`) і asset-id давали 404 і порожні плитки — тепер резолвиться все, що не є прямо завантажуваним URL; порожній стан під фільтром «Використані/Невикористані» стверджував, що в історії немає зображень.

**Покриття маршруту:** `MediaLibraryRoute.test.tsx` монтує `app/story-gallery.tsx` і засіває стан через мок стору, який харнес підставляє глобально ([vitest.config.ts](vitest.config.ts)) — 6 тестів. Це smoke-покриття зв'язки «маршрут ↔ стор», не перевірка самого Zustand-стору. Розблоковано в R0.9.

**Відкрито на майбутнє:** демо-зображення важать ~7 МБ кожне й рендеряться в плитку 200×200 — сітці потрібні мініатюри.

**Передумова, закрита в R1:** ланцюг імпортів редактора не проходив у харнесі — `react-native-safe-area-context` без мока; `resolveWithTs` у `vitest.setup.ts` повертав теку для package-style імпорту (`@/components/ui`) і падав з EISDIR; у моці `expo` бракувало `requireOptionalNativeModule`; `@expo/vector-icons/MaterialIcons` не резолвився в CJS-шляху. Усе це закрито в R1 разом з автоматичним JSX-рантаймом у CJS-лоадері та `FlatList`, що справді рендерить рядки. Сам тест на зупинку операцій редактора з'явився в R0.9 — `DocumentSceneEditorSaveGuard.test.tsx`.

Модель за розділом 2 (`buildStoryMediaGallery`, `filterMediaItems`, `groupMediaByDate`).

Компоненти в `components/media-library/`: `MediaTypeTabs`, `CharacterFilterRail`, `MediaGrid`, `MediaTile`, `MediaInspector`, `MediaInspectorVideo`.

**Сітка.** `numColumns` у `FlatList` не поєднується з секціями, а `SectionList` не має `numColumns`. Дані ріжуться на плоский список `{ type: 'header' } | { type: 'row', items }` з `getItemLayout`. Колонки — власний `getGalleryColumns(width)` (3/5/6–8); наявний `getGridColumns` ([responsive.ts:94](lib/responsive.ts:94)) не чіпаємо.

**Екран.** `app/story-gallery.tsx` переписується; маршрут і параметр `storyId` зберігаються (три точки входу). Видаляється `StoryGalleryCard` разом зі старим `buildStoryGallery`; ключі `storyHome.gallery.open/.openHint/.title` лишаються для картки на `story-home`.

**Інспектор.** Телефон — нижня панель на `AppModal` (голий `Modal` на react-native-web click-through і не розмонтовується); планшет/desktop — бічна панель. Дані з `references`. «Видалити фон» під `isBackgroundRemovalSupported()`. Розмір показуємо лише коли `sizeBytes` є.

**Відео.** Локальний `MediaInspectorVideo`, без runtime-логіки сцени: резолв `item.assetId ?? item.uri` через lease з R0.5 (`resolveAssetUri` вже приймає asset id через `resolveLibraryAssetUri`); `null` у `useVideoPlayer` до завершення; `active`-прапорець проти запізнілих промісів (як у [SceneVideoLayer.tsx:65](components/reader/SceneVideoLayer.tsx:65)); **без autoplay** — `SceneVideoLayer` викликає `player.play()` в ефекті ([SceneVideoLayer.tsx:117](components/reader/SceneVideoLayer.tsx:117)), це не копіюємо; зупинка старого player на зміну елемента й unmount. Стан помилки покриває і невдалий резолв, і `statusChange === 'error'`, а retry перезапускає резолв (відкликаний object URL не відновлюється повторним використанням того самого значення).

**Постера немає і не буде в R1.** Постер живе у кроці сцени (`VideoBlockData.posterAssetId`), а плитка — на рівні активу; per-asset постера в моделі не існує. Плитка відео показує іконку, назву й тривалість — це те, що обіцяла концепція.

Тривалість не показується, коли `durationSeconds` відсутній ([media-library-service.ts:44](lib/media-library-service.ts:44)) — замість «0:00» нічого.

**Тести моделі:** той самий URI як asset і як спрайт → одна плитка; імпортований бекап зі спрайтом, чий `assetUri` вказує на наявний asset → одна плитка; спрайт, що посилається на `asset.id` → одна плитка; два персонажі з різними runtime URI, але одним `assetUri` → одна плитка, два власники; `assetUri` і `uri` на різні активи → детермінований результат за оголошеним порядком; standalone-спрайт лишається окремим; результат стабільний після persistence round-trip; `usage` підсумовує всі ролі; постер відео рахується використаним; `used`/`unused` без перетину; фон ніколи не в фільтрі персонажа; персонаж без спрайтів має `count: 0`; пошук по трьох полях; групи дат із фіксованим `now`; порожня історія.

**Тести видалення:** використаний фон не видаляється; `disabled`-посилання теж блокує; актив зі sprite-власником не зникає частково; невикористаний asset-only видаляється **і не повертається після циклу гідратації**; той самий гейт для відео.

### R2 — Адитивна власність + інтеграція · **ВИКОНАНО**

Реалізовано 2026-08-25: `lib/character-media.ts`, `canDetachOwner` + `MediaOwner.usage` у моделі, дії інспектора, save-barrier на вході в медіатеку.

- «Додати персонажу…» створює новий `CharacterSprite` з новим id; жодна сцена не змінюється. Посилання — `assetId`, якщо він є (стабільніший за URI і збігається з тим, що пише AI-шлях), інакше URI. `assetUri` не пишеться ніколи.
- Ім'я спрайта дедуплікується без урахування регістру: валідатор AI-change-set відхиляє дубль ([change-set.ts:308](lib/ai/change-set.ts:308)), тож галерея не має права такий стан створювати.
- **Гейт відчеплення — по власнику, не по файлу.** Ламається лише посилання `${characterId}:${spriteId}`; фон із того самого файлу переживає відчеплення без змін. Тому `MediaOwner` тепер несе власний `usage`, а `canDetachOwner` дивиться тільки на нього.
- Обидва вказівники (`defaultSpriteId` і `authoring.currentSpriteId`) ремонтуються синхронно.
  **Уточнення до попередньої редакції плану:** твердження «редактор уже робить це» було неточним — [embedded-script.ts:5409](lib/vn-plate-editor/embedded-script.ts:5409) ремонтує лише `authoring.currentSpriteId` і лишає `defaultSpriteId` висіти на видаленому спрайті. Наслідок косметичний (`resolveCharacterSpriteUri` пропускає неіснуючий id, але `isDefaultSprite` не збігається ні з чим), тож iframe не чіпали — це лишається розбіжністю, зафіксованою тут.
- **Гейт гідратації.** Сцени приїжджають асинхронно, і до того кожен файл виглядає невикористаним. Правило винесене в `usageIsKnowable`, щоб екран і запис не розійшлися: завантаження успішно завершилося **і** `scenes.length === story.sceneCount`. Рівності, а не «щось є»: reader-вікно лишає в пам'яті кілька сцен, а повне завантаження ставить `full` навіть коли сховище не повернуло нічого ([scene-slice.ts:63](stores/app-store-slices/scene-slice.ts:63)) — тож «одна сцена з десяти» виглядало б як повна картина. `sceneCount` придатний як незалежна перевірка, бо всі шляхи запису тримають його точним (`Object.keys(records).length`).
- Відхилений проміс — не відповідь: `.then(ok, fail)` замість `.finally`, і стан має три значення. «Ще не знаємо» і «не змогли дізнатися» — різні речі для автора, і завантаження, що завершилося без сцен історії, належить до другого.
- **Повторна перевірка на записі.** Гейт закриває широке вікно, але не вузьке — стор може змінитися між рендером кнопки і натисканням. `handleDetachFromCharacter` читає `useAppStore.getState()`, повторює `usageIsKnowable` уже на свіжих сценах і метаданих, перебудовує галерею (`findOwnerInGallery`) і ще раз питає `canDetachOwner`.
- **Усі три записи стартують зі свіжої бібліотеки.** `setCharacterLibrary` замінює масив цілком, тож attach і «зробити основним» так само читають `getState()` — інакше спрайт, доданий редактором чи асистентом після рендера, зникав би від сторонньої дії.
- **Фільтри «Використані/Невикористані» вимкнені, доки usage невідомий.** Інакше рейка стверджує «Used 0», поки сцени ще читаються, і лічильники суперечать напису в інспекторі.
- **«Зробити основним для ‹персонаж›»** — чиста `setDefaultSprite`, кнопка на рядку неосновного власника, бейдж «Основний» на поточному. `authoring.currentSpriteId` навмисно не чіпається: це вибір редактора для наступного вставленого блока. Дія недеструктивна (кожен крок таймлайну називає спрайт явно, `defaultSpriteId` — лише фолбек), тож гейтом не закрита.
- Source-aware видалення: «Прибрати імпортований файл» для файлу бібліотеки, «Прибрати з ‹персонаж›» — на рядку власника. Ключ `mediaLibrary.action.removeFromStory` замінено.
- `sceneId` тепер передається з редактора; «Відкрити поточну сцену» — це позначка на сцені, з якої прийшли (вона ж перша у списку). Фолбеку на довільну сцену більше немає ніде.
- **Вхід у медіатеку проходить save-barrier.** Медіатека читає персонажів зі стора, тож незбережений спрайт у ній просто відсутній. Кнопка редактора також перейменована на «Медіатека» — екран уже так називається.

**Перевірено в браузері:** прикріплення й відчеплення на реальному сторі, форма записаного спрайта (`uri` = assetId, без `assetUri`, `defaultSpriteId` виставлений), тости, зміна лічильника фільтра, source-aware підпис, `sceneId` у URL.

**Мутаційно перевірено дев'ять вузлів:** ремонт `defaultSpriteId`, per-owner `usage`, save-barrier на вході, гейт гідратації, точна рівність `sceneCount`, свіже читання стора для detach, те саме для attach і makeDefault, відмова `canDetachOwner` у вузькому вікні, повторний `usageIsKnowable` на записі.

### R0.9 — Ремонт vitest-харнесу · **ВИКОНАНО**

**Теорія подвійного реєстру виявилася хибною.** Reproduction-тест `__tests__/unit/harness/module-registry.test.tsx` показав, що компонент у тест-файлі, компонент в окремому модулі та alias проти прямого шляху мока — усі отримують **один** екземпляр `useAppStore`. Тест лишається регресійним.

Справжні причини були дві, обидві прозаїчні:

1. `useLocalSearchParams` у моці `expo-router` завжди повертав `{}`, тож `storyId` був `undefined` і кожне читання стору в маршруті коротко замикалося. Додано `setLocalSearchParamsForTests`.
2. Мок Plate-редактора викликав `onChange` зі снапшот-об'єктом, тоді як справжній передає `(scene, characters)` двома аргументами. Через це сцена ставала «брудною» під ключем `undefined`, а справжній редактор монтувався й його `flush` у jsdom не завершувався — це й давало вакуумно зелені тести.

Unification резолву Vite/Node не знадобився. Alias Plate-редактора доданий у `__mocks__/components/vn-plate-editor/PlateWebViewEditor.tsx` із seam'ом `setPlateEditorFlushForTests`.

**Наслідок:** обидві відкладені прогалини закриті — `DocumentSceneEditorSaveGuard.test.tsx` (4 тести, regression-критерій R0) і `MediaLibraryRoute.test.tsx` (6 тестів). Обидва мутаційно перевірені: зняття `if (!(await handleSave())) return;` валить два тести, зняття join'у in-flight save — ще один.

**Урок для наступних тестів:** тест-хелпери імпортуються з шляху мока (`../../../__mocks__/...`), бо alias діє в рантаймі, а `tsc` резолвить справжній модуль.

### R3 — Осиротілі спрайти

Матеріалізація `sprite.uri` як `LibraryAsset` + `imageAssetIdsByStory` після видалення персонажа. Власна міграція, зачіпає `embedded-script.ts`.

---

## 4. i18n

Нові плоскі ключі `mediaLibrary.*` в `EN` і `UK` ([translations.ts](lib/translations.ts)):

```
mediaLibrary.title, .tab.images, .tab.videos
mediaLibrary.filter.all | .used | .unused
mediaLibrary.group.today | .thisWeek | .earlier
mediaLibrary.search.placeholder, .search.empty
mediaLibrary.empty.images | .videos | .character
mediaLibrary.noCharacter, .ownerBadge
mediaLibrary.inspector.addedAt | .usedIn | .notUsed | .size | .duration
mediaLibrary.action.useAsBackground | .addToCharacter | .removeFromCharacter
  | .makeDefault | .removeBackground | .openInScene | .rename | .removeFromStory
mediaLibrary.remove.usedWarning, .remove.sceneList, .remove.openScene
mediaLibrary.video.unavailable, .video.retry
```

---

## 5. Ризики

| Ризик | Пом'якшення |
|---|---|
| Затирання персонажів редактором | R0: save-barrier + тристороннє злиття |
| Розрив посилань при зміні власника | R2: власність адитивна, перенесення не існує |
| Відкликаний object URL убиває програвач | R0.5: lease + зворотний індекс |
| Неповний usage бреше у фільтрах | R0.75 перед R1 |
| Видалення відкочується після рестарту | R1: гейт `usage === 0` + тест на цикл гідратації |
| `FlatList` + секції | Плоскі рядки з `getItemLayout` |
| Дрейф із iframe-редактором | R0–R2 не торкаються `embedded-script.ts` |
