# План: повна файлова резервна копія новели

## Статус

Версія плану: 3. Оновлено 2026-08-11 після повторної перевірки залежностей медіа, формату preview, ID-remapping, hashing та platform I/O проти актуального коду.

Стан реалізації: основний функціонал фаз 0–5 і автоматизоване hardening фази 6 реалізовано 2026-08-11. TypeScript, цільовий ESLint, профільні тести, web production export та Android/Hermes production bundle проходять. Hostile-матриця покриває пошкоджений manifest, hash mismatch, missing object, traversal, oversized entry, compression bomb, дублікати й неправильний порядок ZIP entries; rollback при помилці persistence також перевірено. До повного закриття фази 6 залишаються ручний наскрізний export/import на реальних web/Android пристроях, офлайн-прохід reader/editor та розширена матриця великих файлів і форматів.

## Ціль

Дати користувачеві можливість зі сторінки конкретної новели створити один переносний файл `.vnebackup`, який містить усі авторські дані цієї новели та всі пов'язані з нею локальні медіафайли незалежно від їхнього формату, а потім імпортувати цей файл як нову новелу на іншому пристрої або після втрати локальних даних. Після імпорту редактор і reader мають працювати з відновленою новелою офлайн, а інші новели та хмарні бекапи користувача не повинні змінюватися.

## Критерій успіху верхнього рівня

Сценарій `створити новелу з різними медіа -> експортувати .vnebackup -> видалити або перенести локальні дані -> імпортувати .vnebackup -> відкрити редактор і пройти новелу офлайн` завершується без втрати сцен, метаданих, персонажів, оформлення або файлів.

## Продуктові рішення

1. Бекап має scope однієї новели, а не всього застосунку.
2. Точка створення бекапу — наявна картка «Резервна копія» на `app/story-home.tsx`.
3. Імпорт `.vnebackup` — наявний потік імпорту на `app/editor.tsx`, тому що до імпорту сторінки новели ще не існує.
4. Імпорт v1 створює нову новелу. Він не замінює весь workspace і не змінює інші новели.
5. Поточний JSON-експорт залишається доступним як другорядна сумісна дія.
6. `.vnebackup` має окрему схему від глобального cloud backup. Наявний `BACKUP_SCHEMA_VERSION` та cloud manifests не змінюються лише заради цієї функції.
7. Формат архіву не має allowlist розширень на кшталт `.mp3` або `.png`. Він зберігає довільні бінарні файли разом із MIME, категорією й оригінальним ім'ям.

## У межах роботи

- Метадані поточної новели: назва, автор, опис, теги, обкладинка, тема та reader layout.
- Усі канонічні `SceneRecord + TimelineStep` поточної новели, включно з не завантаженими у пам'ять сценами.
- Бібліотека персонажів новели та всі її спрайти.
- Аудіобібліотека новели.
- Усі медіа, явно закріплені за новелою, навіть якщо вони тимчасово не використовуються у timeline.
- Усі медіа, знайдені через залежності новели: обкладинка, background/music/sound/object asset IDs, URI спрайтів і legacy URI.
- Створення, preview, перевірка, staging та імпорт архіву на web і native.
- Міграція наявних зв'язків зображень і аудіо до універсальної приналежності медіа новелі.
- Захист від пошкоджених або ворожих архівів.

## Поза межами першої версії

- Бекап усіх новел одним файлом.
- Заміна наявної новели архівом.
- Merge двох версій однієї новели.
- Налаштування застосунку, мова інтерфейсу та тема UI.
- AI-токени, Supabase-сесія або інші секрети.
- AI chat transcript, кеші та тимчасові файли.
- Save slots і прогрес reader. Їх можна додати пізніше як явну опцію для конкретної новели.
- Пароль або шифрування архіву.
- Реалізація відтворення відео чи нових анімацій. Перша версія лише не повинна блокувати їхнє майбутнє збереження у бекапі.

## Вихідні обмеження кодової бази

- Канонічні сцени зберігаються як `SceneRecord + TimelineStep` і можуть бути гідратовані частково.
- `app/story-home.tsx` уже містить картку резервної копії, але зараз вона експортує тільки JSON.
- `app/editor.tsx` уже містить імпорт JSON.
- Глобальний `BackupService` захоплює весь workspace, а `activateBackup()` замінює глобальні дані. Його не можна напряму використовувати для story-scoped import.
- `mediaLibrary` зараз розрізняє лише `image | audio`, а приналежність до новели явно існує лише для зображень через `imageAssetIdsByStory`.
- Поточне визначення MIME та розширення у `stores/backup-local-repository.ts` має обмежений hardcoded список і не може бути контрактом нового архіву.

## Цільова модель медіа

Для v1 не потрібна широка заміна всіх runtime media kinds. Достатньо зберегти поточну модель, додати безпечний fallback `other` і формат-незалежні optional metadata:

```ts
type AssetType = 'image' | 'audio' | 'other';

interface LibraryAsset {
  id: string;
  type: AssetType;
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  contentHash?: string;
  addedAt: number;
}

type MediaAssetIdsByStory = Record<string, string[]>;
```

Вимоги до міграції:

- Наявні `LibraryAsset` без `mimeType`, `size` або `contentHash` залишаються валідними. Гідратація не повинна читати всі файли лише заради міграції.
- Відсутні metadata визначаються ліниво під час першого читання bytes або створення бекапу й можуть бути записані назад після успішного визначення.
- `imageAssetIdsByStory` у v1 не видаляється: паралельно додається `mediaAssetIdsByStory`, щоб не робити ризикований широкий refactor галереї.
- Під час міграції наявні image memberships копіюються в `mediaAssetIdsByStory` і доповнюються фактичними references.
- До membership додаються assets, знайдені у timeline, character sprites, story audio library та cover.
- Поки міграція не завершена, читання старих persisted даних залишається сумісним.
- Додавання нового asset з editor має одразу закріплювати його за поточною новелою.
- `setAudioLibrary()` може додати до membership лише ті items, які однозначно зіставлені з `mediaLibrary` за ID або URI; generic setter не повинен вигадувати файловий asset для metadata-only item.
- Невідомий MIME зберігається як `application/octet-stream`, а не маскується під MP3 або PNG.
- `contentHash` є оптимізацією та доказом ідентичності bytes. Не можна хешувати всю глобальну бібліотеку при кожному import; assets без hash хешуються ліниво лише за потреби.

Archive schema окремо використовує довільний string `kind`, тому майбутні `video` й `animation` не потребуватимуть зміни container layout. Поточний runtime може зберегти та перенести їх як `other`, навіть якщо ще не вміє відтворювати.

## Формат `.vnebackup`

`.vnebackup` є ZIP-контейнером із власним розширенням та сигнатурою формату в manifest.

```text
manifest.json
story.json
objects/<sha256>
objects/<sha256>
...
```

Об'єкти в архіві не залежать від розширення. Оригінальне ім'я, розширення та MIME зберігаються тільки як метадані.

```ts
interface StoryBackupAsset {
  assetId: string;
  sourceReferences: string[];
  sha256: string;
  size: number;
  kind: string;
  mimeType: string;
  originalName: string;
  originalExtension?: string;
  archivePath: `objects/${string}`;
}

interface StoryArchiveManifestV1 {
  format: 'vne-story-backup';
  containerVersion: 1;
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  story: StoryMetadata;
  counts: {
    scenes: number;
    characters: number;
    audioItems: number;
    embeddedAssets: number;
    totalAssetBytes: number;
  };
  payload: {
    archivePath: 'story.json';
    sha256: string;
    size: number;
  };
  assets: StoryBackupAsset[];
}

interface StoryArchivePayloadV1 {
  scenes: Record<string, SceneRecord>;
  characters: Character[];
  audioLibrary: AudioLibraryItem[];
  mediaMembershipIds: string[];
}
```

Правила:

- `format` ідентифікує продукт, `containerVersion` — правила ZIP/container layout, `schemaVersion` — структуру manifest data.
- `archivePath` будується лише кодом застосунку і валідується як `objects/<64 hex chars>`.
- `manifest.json` містить лише дані для швидкого preview, descriptor `story.json` та список вкладених об'єктів. Повні сцени, персонажі й audio library зберігаються у `story.json`.
- `story.json` перевіряється за заявленими `size` і SHA-256 до десеріалізації та має окремий ліміт розміру.
- `mediaMembershipIds` є story ownership-списком і може містити гарантовано portable bundled IDs без окремого object entry; `assets[]` описує лише реально вкладені binary objects.
- `sourceReferences` містить початковий asset ID, URI та persistent URI/aliases, які вказували на ці bytes. Імпорт будує з нього remap для raw URI полів; список не використовується як шлях усередині ZIP.
- Один SHA-256 зберігається в архіві один раз, навіть якщо файл має кілька логічних посилань.
- Manifest може мати кілька `assetId`, що вказують на один content object.
- Валідатор не відхиляє файл лише через незнайомий MIME або media kind.
- Майбутні schema versions читаються тільки через явні міграції, а не через нестрогу десеріалізацію.
- Parser має повертати нормалізований manifest. Міграції не реалізуються через `asserts`-функцію, яка не може повернути перетворене значення.

## Capture: визначення повного набору залежностей

1. Якщо `sceneRecordHydration[storyId] === 'full'`, безпечно використати повну актуальну map зі store; інакше прочитати повний набір сцен через `loadSceneRecordsForStory()`. Capture не повинен гідратувати чи мутувати runtime store.
2. Почати зі всіх IDs у `mediaAssetIdsByStory[storyId]`.
3. Побудувати timeline closure поверх наявного `collectAssetReferences()` з `lib/asset-usage.ts`, а не створювати другий обхід background/character/music/sound/interactive-object blocks.
4. Додати assets, зіставлені з URI/assetUri усіх character sprites.
5. Додати assets з story audio library за ID або URI.
6. Додати asset обкладинки за ID або URI.
7. Окремо пройти raw URI, які не покриває `collectAssetReferences()`: `SceneRecord.voiceAudioUri`, `InteractiveObject.imageUri`, `PlayAudioAction.audioUri` та `ShowImageAction.imageUri`.
8. Перевірити `SceneRecord.audioTriggers[].audioId` проти story audio library, щоб trigger-залежності також потрапили до closure.
9. Для legacy URI спробувати знайти відповідний `LibraryAsset` за ID, URI або persistent URI.
10. Якщо URI не зареєстрований у `mediaLibrary`, але bytes доступні через `file:`, IDB, data URI або дозволений remote URL, створити archive-only synthetic asset entry. Не потрібно спочатку мутувати глобальну бібліотеку.
11. Remote asset має бути завантажений і вкладений у бекап; якщо CORS/network не дозволяє прочитати bytes, capture завершується явною помилкою, а не залишає мережеву залежність.
12. Якщо посилання потрібне новелі, але його байти неможливо прочитати, не створювати «успішний» неповний архів. Показати перелік відсутніх файлів.
13. Bundled assets можна не дублювати лише тоді, коли вони гарантовано існують у всіх сумісних збірках. В іншому разі вони також мають потрапити в архів.

## Створення архіву

Потік:

```text
storyId
  -> capture metadata and complete scenes
  -> resolve media dependency closure
  -> read bytes and preserve MIME/name
  -> calculate SHA-256 and sizes
  -> validate manifest
  -> write ZIP
  -> save/share file
```

Використати наявні primitives з `backup-binary.ts`, `backup-crypto.ts`, persistent storage та platform file helpers. Не створювати stub `BackupTransport` з порожніми методами. Story-scoped orchestration має бути окремим `StoryArchiveService` або чистим набором функцій із реальним writer/reader transport.

ZIP-бібліотека:

- `fflate` зараз не є прямою dependency, тому перед імпортом її треба додати в `package.json` і перевірити на web та Hermes.
- Не використовувати `zipSync` для великих архівів у production flow.
- Writer має підтримувати асинхронну/потокову обробку, щоб не тримати всі декодовані медіа одночасно у кількох копіях пам'яті.
- Поточні `BackupBinary.bytes()` і `sha256Binary()` є one-shot API. Фаза 0 має або підтвердити інкрементальний SHA-256 на Hermes/web із виміряним memory budget, або зафіксувати значно менший per-object limit для v1. Ліміт 512 MiB не допускається без потокового hash primitive.
- Не вважати callback API `unzip()` bounded-memory reader: він повертає повну мапу розпакованих файлів.
- Для selective extraction використовувати streaming `Unzip`: на кожному entry перевіряти path і заявлені sizes до `file.start()`, запускати лише потрібний entry та додатково рахувати фактично отримані bytes, бо ZIP може не містити достовірного `originalSize`.
- Preview не читає «перші 4 KiB»: ZIP central directory розташований наприкінці файла. Для малих архівів допустимий `unzip(..., { filter })`, що розпаковує лише `manifest.json`, але все одно тримає весь compressed input у пам'яті. Production flow великих архівів використовує streaming `Unzip`, який запускає лише `manifest.json`.
- Native spike перевіряє конкретний ланцюг Expo File API: `File.readableStream() -> Unzip -> per-entry sink -> File.writableStream()`, а random access для preview — через `File.slice()`.
- Бінарний picker/writer створюються як нові platform helpers. Текстові `pickStoryFile()` і `saveStoryExport()` не розширюються бінарними обов'язками; native export не використовує legacy base64-запис.
- Якщо spike покаже, що `fflate` не забезпечує безпечний bounded-memory flow на native, вибрати інше мінімальне рішення до реалізації UI, а не додавати fallback dependency про всяк випадок.

## Preview та імпорт

Потік:

```text
pick file
  -> verify ZIP signature and manifest
  -> build preview without mutating app state
  -> user confirms
  -> validate all entries and hashes into staging
  -> calculate story-local and asset ID remapping
  -> prepare imported story state and deterministic final URIs
  -> promote staged assets with rollback journal
  -> persist scenes and app state
  -> navigate to imported story-home
```

Правила імпорту:

- `.json` продовжує йти через наявний `importStory()`.
- `.vnebackup` визначається за manifest/signature; розширення є лише UX-підказкою.
- На Android перевіряється `DocumentPicker` asset name, а не `content://` URI suffix.
- Імпортована новела отримує новий `storyId`.
- Scene IDs можна зберегти, але `scene.storyId` та всі story-scoped maps переписуються на новий ID.
- Кожен distinct archive `assetId` отримує новий логічний `assetId`. Імпорт не перевикористовує ID asset з іншої новели й не хешує всю локальну бібліотеку для пошуку такого ID.
- Дедуплікація виконується лише на рівні content-addressed storage за SHA-256. Кілька логічних IDs можуть мати один persistent URI/об'єкт bytes без крос-сторі-зв'язності на рівні IDs.
- Remapping охоплює timeline asset IDs, media membership, character sprite URI/assetUri, audio library URI, cover URI, `voiceAudioUri`, `InteractiveObject.imageUri`, `PlayAudioAction.audioUri` і `ShowImageAction.imageUri`.
- Якщо story-local IDs audio library змінюються, `audioTriggers[].audioId` переписуються тим самим mapping. Інакше вони зберігаються та обов'язково валідуються проти імпортованої audio library.
- `CharacterBlockData.spriteId` є ID спрайта, а не файловим URI; його не треба переписувати без конфлікту відповідного sprite ID.
- Імпортовані media assets одразу отримують стабільні `idb://media/...` на web або `file://` на native. `blob:` і неперенесені `data:` URI не можуть потрапити до persisted media library.
- Для нової новели `sceneRecordHydration[newStoryId]` явно встановлюється в `'full'`, щоб подальша window hydration не обрізала імпортовані сцени.
- `saveSlots` та `endingsReachedByStory` не імпортуються й не створюються для нового `storyId`.
- До успішної повної валідації live state не змінюється.
- Promotion веде журнал лише новостворених content objects. При помилці persist store/scenes відкочуються, нові promoted objects видаляються власним rollback-кодом, reused objects не зачіпаються, staging очищується; web GC не є механізмом rollback.

## UI

### `app/story-home.tsx`

У наявній картці «Резервна копія»:

- Primary: «Створити повну резервну копію».
- Secondary: «Експортувати лише JSON».
- Короткий текст про те, що `.vnebackup` містить медіафайли.
- Progress modal або inline progress зі стадіями: підготовка, збір файлів, перевірка, архівування, збереження.
- Помилка відсутнього asset показує назви проблемних файлів, а не лише загальний toast.

### `app/editor.tsx`

- Одна дія «Імпортувати» приймає `.json` та `.vnebackup`.
- Після вибору `.vnebackup` показати preview: назва, автор, дата, app/schema version, сцени, персонажі, кількість і розмір assets за динамічними media kinds.
- Confirm label: «Імпортувати як нову новелу».
- Після успіху перейти на `story-home` нової новели.

Усі нові тексти додаються до активних локалізацій `en` і `uk`. Перед зміною перекладів перевірити, чи джерелом є `lib/translations.ts`, а не неактивний `lib/translations.json` з додатковою `pl`-секцією.

## Безпека і ліміти

Початкові захисні значення, винесені в один конфіг:

- максимум 10 000 ZIP entries;
- максимум 16 MiB для `manifest.json`;
- максимум 64 MiB для `story.json` у v1;
- початково максимум 512 MiB сумарного розпакованого вмісту на web і 1 GiB на native, але не більше підтвердженої storage quota/free space;
- початково максимум 64 MiB для одного object. Більший platform-specific limit дозволяється лише після успішного spike інкрементального SHA-256 і вимірювання peak memory;
- максимум 100:1 для загального compression ratio;
- заборона абсолютних шляхів, `..`, backslash traversal, duplicate paths і entries поза `manifest.json`/`story.json`/`objects/`;
- заявлений `size` і SHA-256 мають збігатися з фактичними байтами;
- дублікати story/scene/asset IDs проходять явну перевірку.

Ліміти перевіряються під час bounded/streaming extraction. Виклик `unzipSync()` з наступною перевіркою вже розпакованих даних не вважається захистом від ZIP bomb.

## План реалізації

### Фаза 0. Контракт і технічний spike

- [ ] Зафіксувати fixtures для поточного JSON export та cloud backup, щоб гарантувати відсутність регресії.
- [ ] Перевірити `fflate` async/streaming на web і Hermes з файлами різних розмірів.
- [ ] Визначити memory budget для web, Android та iOS.
- [ ] Перевірити інкрементальний SHA-256 на web/Hermes. Якщо придатного primitive немає, зафіксувати one-shot hashing і per-object limit 64 MiB для v1.
- [ ] Перевірити native pipeline `File.readableStream() -> Unzip -> File.writableStream()` і random access через `File.slice()` без legacy base64.
- [ ] Підтвердити остаточний спосіб ZIP streaming і лише після цього додати пряму dependency.

Вихід: обраний archive/hash implementation має доказово працювати в установленому memory budget на підтримуваних платформах; per-object limit узгоджений із реальною hash-стратегією.

### Фаза 1. Універсальні метадані та ownership медіа

- [ ] Додати optional MIME/size/contentHash metadata без hardcoded припущення про MP3/PNG.
- [ ] Додати паралельний `mediaAssetIdsByStory`, зберігши `imageAssetIdsByStory` для сумісності v1.
- [ ] Додати persisted-state migration без eager file I/O зі старих image/audio даних.
- [ ] Оновити import/upload flows, щоб нові assets закріплювалися за story.
- [ ] Додати URI-to-library resolution і archive-only fallback для legacy/remote assets.
- [ ] Аудит додавання `AssetType = 'other'`: оновити `getDataUriExtension`, `parseBase64DataUri`, `validateMediaBlob`, `addAssetToLibraryPure` і не показувати `other` як background у `buildAvailableAssets()`.
- [ ] Додати unit tests для міграції та невідомого MIME.

Вихід: застосунок може точно визначити повну медіабібліотеку конкретної новели.

### Фаза 2. Manifest, capture і validation

- [ ] Додати типи `StoryArchiveManifestV1`, `StoryArchivePayloadV1` і `StoryBackupAsset`.
- [ ] Реалізувати strict parser, який повертає нормалізований manifest.
- [ ] Реалізувати capture повних сцен через `loadSceneRecordsForStory()` без мутації runtime hydration.
- [ ] Реалізувати dependency closure поверх `collectAssetReferences()` і додати raw URI, cover, sprite, audio library та audio trigger dependencies.
- [ ] Розділити легкий preview manifest і hash-verified `story.json` payload.
- [ ] Відхиляти capture з відсутніми обов'язковими файлами.
- [ ] Додати unit tests для unused associated assets, voice-over, interactive action URI, audio triggers, legacy URI та missing bytes.

Вихід: у пам'яті формується повний валідний story backup без ZIP.

### Фаза 3. Archive writer/reader і platform I/O

- [ ] Реалізувати content-addressed `objects/<sha256>` writer.
- [ ] Реалізувати streaming selective reader; non-streaming `unzip()` не приймається як bounded reader.
- [ ] Реалізувати preview, який витягує тільки `manifest.json` і коректно працює з ZIP central directory.
- [ ] Реалізувати SHA/size validation.
- [ ] Web: File System Access API за наявності, Blob download як fallback.
  Відоме обмеження web v1: fallback у браузерах без File System Access API буферизує весь стиснений архів у пам'яті, а IndexedDB staging буферизує один object (до 64 MiB). Повністю потоковий шлях гарантований на native і в web-браузерах із `showSaveFilePicker`.
- [ ] Native: новий Expo `File` API + Sharing для export, DocumentPicker для import; не використовувати legacy base64 path.
- [ ] Додати окремі binary picker/writer helpers, не змінюючи текстовий контракт JSON helpers.
- [ ] Додати roundtrip і hostile-archive tests.

Вихід: `.vnebackup` створюється, читається та безпечно перевіряється на web/native.

### Фаза 4. Story-scoped import

- [ ] Реалізувати staging assets.
- [ ] Створити новий `storyId` і новий logical `assetId` для кожного distinct archive asset; дедуплікувати лише content storage за SHA-256.
- [ ] Переписати всі залежні asset/URI references, включно з voice-over, interactive actions і audio triggers.
- [ ] Імпортувати як нову новелу без зміни інших stories.
- [ ] Одразу записати persistent `idb://`/`file://` URI та встановити `sceneRecordHydration[newStoryId] = 'full'`.
- [ ] Не створювати `saveSlots` або `endingsReachedByStory` для імпортованої новели.
- [ ] Забезпечити promote/persist transaction journal і rollback без видалення reused assets.
- [ ] Додати import integration tests.

Вихід: валідний архів імпортується як самодостатня новела.

### Фаза 5. UI і локалізація

- [ ] Оновити backup card на `story-home`.
- [ ] Залишити JSON export як secondary action.
- [ ] Розширити editor import picker двома форматами.
- [ ] Додати preview, confirm та progress states.
- [ ] Додати українські й англійські переклади та accessibility labels.

Вихід: повний потік доступний користувачеві без налаштувань або прихованих команд.

### Фаза 6. Наскрізна перевірка і hardening

- [ ] Export/import на web.
- [ ] Export/import на Android/Hermes.
- [ ] Різні audio formats: щонайменше MP3, WAV, OGG та M4A/AAC fixture.
- [ ] Різні image formats: щонайменше PNG, JPEG, WebP та GIF fixture.
- [ ] Unknown/future MIME fixture з побайтовим roundtrip.
- [ ] Новела з unused, duplicated-by-content і remote assets.
- [ ] Новела з voice-over, interactive object image/actions та `audioTriggers`.
- [ ] Offline editor/reader verification після імпорту.
- [x] Corrupt manifest, hash mismatch, missing object, traversal, oversized entry, compression bomb, duplicate/order archive tests і persistence rollback test.
- [x] Вузькі unit/integration тести, typecheck та цільовий lint.
- [x] Після code changes виконати `graphify update .`.

Вихід: усі критерії готовності нижче мають підтвердження тестами або ручною platform verification.

## Ймовірні файли реалізації

Наявні:

- `app/story-home.tsx`
- `app/editor.tsx`
- `lib/story-hooks.ts`
- `lib/asset-usage.ts`
- `lib/scene-record-storage.ts`
- `lib/media-library-service.ts`
- `lib/story-image-library.ts`
- `lib/app-store-persistence.ts`
- `stores/app-store-types.ts`
- `stores/media-library-actions.ts`
- `stores/backup-local-repository.ts` — лише спільні primitives або усунення hardcoded MIME; не змінювати global restore semantics.
- `lib/translations.ts`
- `package.json`

Нові, назви можуть бути скориговані за наявними conventions:

```text
lib/story-backup/types.ts
lib/story-backup/manifest.ts
lib/story-backup/capture.ts
lib/story-backup/archive.ts
lib/story-backup/import.ts
lib/story-backup/platform-file.ts
components/story-backup/StoryBackupPreview.tsx
components/story-backup/StoryBackupProgress.tsx
```

Перед створенням кожного нового файла треба ще раз перевірити, чи відповідна функція вже не існує в `backup-service.ts`, `backup-binary.ts`, `backup-crypto.ts`, `export-story-file.ts`, `pick-story-file.ts` або `web-file-input.ts`.

## Критерії готовності

- [ ] Повний backup запускається зі сторінки потрібної новели, а не з Settings.
- [ ] Архів містить лише одну новелу та всі пов'язані з нею assets, включно з unused membership assets.
- [ ] Жодне місце archive format не вимагає конкретного списку MP3/PNG-подібних розширень.
- [ ] Unknown MIME зберігається побайтово без втрати.
- [ ] Імпорт не змінює і не видаляє інші новели.
- [ ] Імпортована новела отримує нові logical asset IDs, повну hydration-позначку та працює офлайн.
- [ ] Voice-over, interactive object images/actions і audio triggers працюють після імпорту без початкових URI.
- [ ] Preview читає лише легкий `manifest.json`, не розпаковуючи `story.json` або media objects.
- [ ] Пошкоджений архів відхиляється до зміни live state.
- [ ] JSON export/import продовжує працювати.
- [ ] Cloud backup v1 і його manifests продовжують працювати без зміни схеми.
- [ ] Великі архіви не обробляються через необмежені sync ZIP APIs.
- [ ] Web і native мають перевірені save/pick flows.
- [ ] Усі нові користувацькі тексти локалізовані й доступні для screen readers.

## Умови зупинки та перегляду плану

Реалізацію треба зупинити й оновити цей документ, якщо виявиться хоча б одна умова:

- наявна модель не дозволяє однозначно визначити ownership аудіо без зміни користувацької поведінки;
- вибраний ZIP implementation не може забезпечити bounded memory на підтримуваній native платформі;
- hash implementation не вкладається у memory budget для заявленого per-object limit;
- bundled або remote assets неможливо зробити переносними без мережевої залежності;
- story import потребує глобального `activateBackup()` або заміни всього workspace;
- підтримка майбутнього media kind вимагає несумісної зміни manifest v1;
- реалізація починає змінювати cloud backup schema або захоплювати secrets.

У такому разі спочатку фіксується нове архітектурне рішення в `plan.md`, і лише потім продовжується код.
