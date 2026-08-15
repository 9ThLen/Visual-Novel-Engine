# План інтеграції відео та анімацій

**Статус:** запропоновано, перевірено проти коду 2026-08-15

**Обсяг MVP:** локальні MP4, фонове відео, блокуюча катсцена, текстовий `/video`-блок у Plate, пресети наявних анімацій

**Поза цим релізом:** транскодування, ffmpeg, Lottie/Rive, монтаж, субтитри, кілька одночасних відеошарів, повна reduced-motion політика

## Результат для користувача

Автор додає `/video` в документі сцени, вибирає раніше імпортований ролик або файл з пристрою та обирає один із двох режимів:

- **Фон:** muted, loop, `cover` або `contain`; відео грає під персонажами й текстом та не зупиняє timeline.
- **Катсцена:** відео перекриває сцену, блокує звичайний tap-to-continue до завершення та може показати окрему кнопку Skip після заданої затримки.

У v1 `/video` відображається в Plate так само, як `/background`: назва asset, короткий summary і кнопки Pick/Edit. Thumbnail усередині iframe не входить у MVP. Це не змушує передавати великий Blob або blob URL через межу iframe/WebView.

Анімації не отримують нового канонічного блока. Редактори `character`, `effect` і `camera` отримують зрозумілі пресети поверх уже наявних типів.

## Ключові рішення

1. **Не додавати ffmpeg.** Відтворення виконує `expo-video`. Автор імпортує готовий MP4; транскодування, якщо стане потрібним, виконується на бекенді в окремому проєкті.
2. **Зробити два вертикальні зрізи.** Спочатку повністю завершити фонове відео, потім окремо додати блокуючу катсцену.
3. **Один видимий `VideoView` у MVP.** Новий background `play` замінює попередній відеофон, а background `stop` прибирає його та відкриває поточний статичний `backgroundAssetId`. Катсцена тимчасово призупиняє активний відеофон і автоматично відновлює його після complete/Skip/recoverable error. Одночасно декодується лише один ролик.
4. **Не зберігати playback-об'єкти.** У `TimelineStep.data` і `SceneState` дозволені лише серіалізовані ID та параметри. URI, Blob, `VideoPlayer`, currentTime, callbacks і timestamps там заборонені.
5. **Не хешувати великий ролик під час імпорту.** Для video не читати весь файл у base64 і не рахувати поточний строковий hash. Збіг `name + size` є лише попередженням про можливий дублікат, а не доказом ідентичності.
6. **Ліміт MVP:** повторно використати `STORY_BACKUP_LIMITS.maxObjectBytes` (зараз 64 MiB). Це продуктове обмеження, яке editor показує до відкриття picker та повторює біля вибраного файла. Більший файл відхиляється до читання bytes. Це зберігає сумісність із `.vnebackup`.
7. **Гарантований формат:** MP4 (`video/mp4`, H.264 + AAC). Інші контейнери не обіцяються до окремої platform matrix.
8. **Збереження під час катсцени:** Quick Save, manual save і autosave блокуються, доки активна блокуюча катсцена. SaveSlot зараз не зберігає step index, тому часткове відновлення ролика не додається в MVP.
9. **Rollback не переграє катсцену.** Video halt не потрапляє до rollback stack. Після завершення/Skip rollback повертає до попереднього текстового yield-point.
10. **Preload не використовує executor lookahead.** Якщо preload буде потрібен після вимірювань, renderer окремо сканує timeline. Поточний `lookaheadActionForStep()` призначений для blocking effects.

## Поточні архітектурні обмеження

- Канонічна сцена: `SceneRecord + TimelineStep` у `lib/engine/types.ts`.
- `useSceneExecutor` має yield-point лише для `text`, `dialogue`, `choice`, `transition`; `advance()` і `selectChoice()` є чинними шляхами продовження.
- `SceneState` входить у persisted `ProjectScene`, копіюється під час duplicate і бере участь у AI revision hash.
- Reader отримує timeline через `toReaderScene()`, але не переносить persisted `sceneState`.
- Plate editor працює у srcdoc iframe/WebView; чинні image/audio upload повідомлення передають data URI, що неприйнятно для відео.
- `media-library-service` має base64 hash і native base64 fallback. Обидва шляхи можуть спричинити OOM на великому файлі.
- `asset-usage` не має kind `video`; невідомий asset зараз класифікується як background/sound і дає неправильну Story Doctor помилку.
- Backup capture розрізняє MIME `image/` і `audio/`, але не `video/`.
- Reader audio централізовано в `useReaderAudio`; відео не повинно створювати незалежну політику BGM/session.
- У перекладах є `settings.reduceMotion`, а parallax примусово використовує `ReduceMotion.Never`, але завершеної reduced-motion функції та setting contract немає.

## Цільова модель даних

Використати плоский `VideoBlockData`, сумісний з іншими `BlockData` та текстовою граматикою. Parser приймає частково заповнений або некоректний авторський запис, а `normalizeVideoData()` приводить його до безпечного runtime contract. Це повторює патерн `normalizeTransitionData()` з `lib/engine/transition-utils.ts`.

```ts
export interface VideoBlockData {
  mode: 'play' | 'stop';
  layer: 'background' | 'cutscene';
  assetId?: string | null;
  posterAssetId?: string | null;
  fit?: 'cover' | 'contain';
  playbackRate?: number;
  startAt?: number | null;
  endAt?: number | null;
  muted?: boolean;
  volume?: number;
  loop?: boolean;
  skippableAfterMs?: number | null;
}

export interface NormalizedVideoBlockData {
  mode: 'play' | 'stop';
  layer: 'background' | 'cutscene';
  assetId: string | null;
  posterAssetId: string | null;
  fit: 'cover' | 'contain';
  playbackRate: number;
  startAt: number;
  endAt: number | null;
  muted: boolean;
  volume: number;
  loop: boolean;
  skippableAfterMs: number | null;
}
```

`normalizeVideoData(raw)`:

- приймає `unknown`, як `normalizeTransitionData()`;
- нормалізує enum, числа, nullable поля та defaults;
- для background примусово ставить `muted: true`, `volume: 0`, `loop: true`, `skippableAfterMs: null`;
- для cutscene примусово ставить `loop: false`;
- для `stop` очищає `assetId`/`posterAssetId` і нейтралізує playback-поля;
- не приховує авторські помилки: Story Doctor перевіряє початковий `step.data` і повідомляє, що саме було виправлено або відкинуто.

Нормалізатор викликається щонайменше в `executeStep()` і `SceneVideoLayer`; event factory, parser/adapters та editor normalizer також використовують його для стабільних defaults. Serializer пише нормалізований плоский формат, тому некоректний вручну написаний рядок має безпечний parse path і після наступного save стає канонічним.

Runtime-проєкція має залишатися мінімальною:

```ts
export interface RuntimeVideoState {
  stepId: string;
  assetId: string;
  posterAssetId?: string | null;
  layer: 'background' | 'cutscene';
  fit: 'cover' | 'contain';
  playbackRate: number;
  startAt?: number;
  endAt?: number;
  muted: boolean;
  volume: number;
  loop: boolean;
  skippableAfterMs: number | null;
}
```

`SceneState.activeVideo?: RuntimeVideoState | null` робиться optional. `createEmptySceneState()` не повинен записувати зайвий runtime payload у кожну persisted сцену. Executor створює новий state, не мутує `SceneRecord.sceneState` і не додає playback fields у `step.data`.

Внутрішній `ExecutorState` для катсцени отримує `pendingVideoStepId: string | null` і `previousBackgroundVideo: RuntimeVideoState | null`. Друге поле зберігає лише призупинений фон поточної сцени на час катсцени. Обидва поля ephemeral і не виходять у canonical data або save slot.

### Семантика часу

- `startAt` та `endAt` вимірюються в секундах від початку медіафайла; `endAt` є абсолютною позицією, а не тривалістю після `startAt`.
- `skippableAfterMs` відлічується від накопиченого активного програвання після успішного старту на `startAt`. Очікування autoplay gesture, pause та перебування app у background до таймера не входять.
- Player progress і момент старту залишаються ephemeral та ніколи не серіалізуються.

### Валідація

- `assetId` має існувати й мати `AssetType === 'video'`.
- `posterAssetId`, якщо заданий, має бути image asset.
- `0.5 <= playbackRate <= 2`.
- `0 <= volume <= 1`.
- `startAt >= 0`.
- `endAt > startAt` і не більше відомої duration, якщо metadata доступна.
- Background завжди `muted: true`, `loop: true`.
- Cutscene завжди `loop: false`.
- `skippableAfterMs === null` означає, що Skip заборонений; рекомендований default для skippable cutscene: 1500 ms.
- `stop` ігнорує playback-поля та очищає відео лише відповідного layer.

## Етап 0. Platform spike

**Мета:** перевірити, що вже встановлений `expo-video` реально працює з URI, які повертає цей проєкт.

### Перевірки

- Виконати повний native rebuild/dev-client link для `expo-video`: `expo run:android` та `expo run:ios` на macOS або відповідному CI/remote build. Поточна збірка ще жодного разу не імпортувала модуль, тому web-only smoke не є достатнім доказом.
- Web: `idb://` -> `resolveAssetUri()` -> blob URL -> `VideoView`.
- Android та iOS: persisted `file://` або `content://`, скопійований у media-library.
- `useVideoPlayer` lifecycle, `play()`, `pause()`, seek через `currentTime`, completion event і cleanup.
- `startAt`/`endAt` без фізичного trimming файла.
- Web autoplay: muted background стартує автоматично; cutscene зі звуком показує tap-to-play fallback, якщо `play()` відхилено.
- Poster до першого кадру й fallback при playback error.
- Один `VideoView` за раз; не тестувати multi-layer у MVP.

### Gate

Не починати schema/editor зміни, поки один і той самий тестовий MP4 не програється на web, Android та iOS. Закласти на native rebuild і виправлення link/config проблем до двох робочих днів, а не оцінювати spike як 0.5 дня. Якщо rebuild заблокований інфраструктурою, не імітувати native gate: зафіксувати blocker і перейти до незалежних анімаційних пресетів з етапу 4. Spike-код або перетворюється на `SceneVideoLayer`, або видаляється; окремий dead debug screen не мерджиться.

### Статус виконання — 2026-08-15

- Dev-only spike реалізований у `app/video-spike.tsx`; typecheck і production web export проходять, web bundle включає `expo-video`. Runtime перевірено в Codex Chromium на CC0 MP4 від MDN: URL і `idb://media/video-spike-current` резолвляться відповідно у мережевий та session `blob:` URI, `readyToPlay`, muted autoplay і `first frame rendered` спрацьовують. Probe `startAt=2s` / `endAt=5s` зупиняє player на `5.05s`. Poster overlay реалізований до першого кадру та для error state; природний rejected-autoplay/tap-to-play сценарій у цьому браузері не відтворився, бо muted autoplay дозволений.
- Локальний Android autolinking знаходить `expo-video@3.0.16`, але повний rebuild двічі зупинився до створення APK у native C++ залежностях `expo-modules-core`, `react-native-screens` і `react-native-worklets`: pnpm-шляхи перевищують безпечний `CMAKE_OBJECT_PATH_MAX`, після чого Ninja завершується з `manifest 'build.ninja' still dirty after 100 tries`. `subst` не допомагає, бо autolinking повертає фізичні `D:\\...\\node_modules\\.pnpm` шляхи.
- Порядок unblock: EAS development builds для Android та iOS Simulator; якщо локальний Android build усе ж потрібен — `node-linker=hoisted` з повним reinstall; одноразово можна перенаправити native `buildDir`, але постійне рішення потребує config plugin. Короткий фізичний checkout сам по собі не вважається достатнім.
- Для наявного `developmentClient: true` додано відсутній `expo-dev-client@~6.0.21`. Android EAS development build `03a49dd1-1790-465f-bb97-a3149ec194a0` успішно створив APK. Перша iOS Simulator build `098c799b-1e02-425b-b2a1-2e04210f0b10` виявила несумісність `expo-file-system@55` з Expo SDK 54; залежність вирівняно до `~19.0.23`, після чого retry `1eb4910c-ad55-4b8d-a436-5e7b4945162a` успішно створив Simulator archive. Отже native compile/link gate закритий для Android та iOS.
- Native playback gate лишається відкритим: Android APK не встановлюється поверх наявного emulator package з іншим підписом (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), а iOS Simulator artifact потребує macOS для запуску. Видаляти дані наявного Android-застосунку без окремого дозволу не можна; physical-device iOS profile окремо потребує одноразового interactive credentials/device provisioning.
- Platform playback gate загалом лишається відкритим, бо той самий MP4 ще не програно на Android та iOS. Після окремого підтвердження початку реалізації розпочато безпечну неблокуючу частину schema/runtime зрізу A; native playback досі є обов'язковою перевіркою перед завершенням зрізу. Незалежні анімаційні пресети з етапу 4 можна виконувати паралельно.
- Реалізовано канонічний `video`-step, нормалізацію, синхронну проєкцію background play/stop у `SceneState.activeVideo`, спільний `SceneVideoLayer` для Preview/Reader, `/video` у slash menu та SceneDocument round-trip. Окремий spike route видалено після перенесення потрібної логіки у production-компонент.
- Поточна перевірка production-коду: TypeScript проходить; 99 цільових unit/integration тестів проходять; web export успішно збирає 1821 модуль. Медіа-імпорт, `AssetType: 'video'`, backup/restore, Pick/Edit modal і blocking cutscene ще не реалізовані, тому acceptance gate зрізу A не закритий.

## Етап 1. Медіа-фундамент

### Asset contract

- Додати `'video'` до `AssetType` у `lib/media-library-service.ts`.
- Додати MP4 MIME/extension mappings у media service та `stores/backup-local-repository.ts`.
- Додати `AssetUsageKind: 'video'`, reference collection для video-step та окрему сумісність kind.
- `collectAssetReferences()` повертає дві незалежні references для `play`: `assetId` як video та `posterAssetId` як image-compatible background reference. Poster бере участь в unused/broken analysis, отримує story membership і потрапляє в `.vnebackup`.
- Додати Story Doctor codes:
  - `asset.missingVideo`;
  - `video.invalidPoster`;
  - `video.invalidTiming`;
  - `video.unsupportedAsset`.
- Додати EN/UK translations для asset kind, помилок та editor controls.

### Імпорт без base64

- Створити host-side `pickVideoFromDevice()`:
  - web повертає `File`;
  - native використовує `expo-document-picker` з `video/mp4` і `copyToCacheDirectory`.
- Додати до media service API, який приймає `Blob/File` на web або URI на native.
- Web записує `File` напряму в IndexedDB через наявний blob storage.
- Native робить `copyAsync` у постійний media-library path.
- Для `type === 'video'`:
  - повністю заборонити `data:` URI;
  - не виконувати `readAsStringAsync(...Base64)` fallback;
  - при помилці copy повертати чесну помилку та прибирати partial target.
- Перевіряти size до читання bytes. Файл понад 64 MiB відхиляти з локалізованим повідомленням.
- До picker показувати постійну підказку «MP4 до 64 MiB» з коротким поясненням, що це приблизно 1–2 хвилини 1080p за помірного bitrate. Після вибору одразу показувати фактичний size та статус limit check, не чекаючи помилки під час save/backup.
- Не об'єднувати assets лише за `name + size`; це лише duplicate warning.

### Backup

- Додати `video` до `AssetKind` у capture.
- MIME `video/*` класифікувати як `video`.
- Перевірити, що chunked staging і SHA-256 backup не завантажують весь ролик у JS heap.
- Restore має зберігати `type: 'video'`, MIME, name і membership.

### Тести етапу

- Web `File` зберігається без data URI.
- Native copy failure не переходить до base64.
- 100+ MiB fake file відхиляється до читання body/bytes і не викликає OOM.
- Однакові name+size з різними URI не дедуплікуються автоматично.
- Backup/restore повертає video asset з правильним kind та MIME.
- Poster reference не позначається unused, додає image asset до story membership і переживає backup/restore разом із відео.
- Image/audio regression tests залишаються зеленими.

## Етап 2. Вертикальний зріз A: фонове відео

Цей зріз змінює `executeStep()` лише як звичайну синхронну мутацію state. Він **не** змінює halt, `advance()`, rollback або save/load.

### Canonical round-trip

- Додати `video` до `BlockType`, `BLOCK_TYPE_INFO` і `BlockData`.
- Додати `createVideoStep()`.
- Провести новий тип через усі місця, де вже проходить `stop_effect`:
  - document commands/types/document-scene;
  - SceneDocument types, adapter, parser, serializer, validation;
  - manuscript/story hooks;
  - AI patch types і дозволені зміни;
  - Plate embedded commands, renderer, script і normalizer;
  - test generators, fuzz/round-trip fixtures.
- Parser/serializer grammar має зберігати всі video-поля без втрат.
- Додати `lib/engine/video-utils.ts` з `normalizeVideoData()` і тести для partial JSON, некоректних enum/numbers, `background + loop:false`, `cutscene + loop:true` та `stop` із зайвими playback-полями.
- Старі історії не потребують міграції: відсутність video-step валідна.

### Runtime

- У `executeStep()` background `play` записує plain `activeVideo` і продовжує виконання.
- Background `stop` очищає відповідне active video та продовжує виконання.
- `backgroundAssetId` не очищається. Поки відео активне, renderer приховує static image; після stop image повертається.
- Помилка playback не зупиняє timeline: renderer показує poster/static background і повідомляє diagnostic.

### Renderer

- Створити спільний `components/reader/SceneVideoLayer.tsx` на `expo-video`.
- Підключити його до PreviewScreen і ReaderDisplay/reader stage.
- URI завжди резолвити через наявний asset resolver.
- Player створювати hook-ом і звільняти на unmount/source replacement.
- Не монтувати два `VideoView` одночасно.

### Мінімальний editor UX

- Додати `/video` до slash menu.
- Рендерити текстовий блок: layer, asset name, fit, loop/muted summary, Pick/Edit.
- Pick надсилає в host лише намір відкрити picker; bytes не проходять через `postMessage`.
- Host відкриває picker, зберігає asset, додає story membership і повертає в iframe лише metadata/ID.
- Modal показує story video assets і дозволяє background settings.
- Modal до вибору файла показує формат і ліміт 64 MiB; після вибору показує size, duplicate warning та limit result.
- Thumbnail у iframe відкласти.

### Acceptance gate зрізу A

Автор імпортує MP4, додає `/video background`, бачить однакове looped muted video у preview та reader, додає `/video stop` і знову бачить попередній static background. Save/reload, JSON round-trip і `.vnebackup` не втрачають step або asset.

## Етап 3. Вертикальний зріз B: блокуюча катсцена

### Новий executor protocol

- Cutscene `play` встановлює `activeVideo`, `pendingVideoStepId`, `canAdvance: false` і halt.
- Перед заміною `activeVideo` executor зберігає поточний background video у `previousBackgroundVideo` і release-ить його player. На complete/Skip/recoverable error фон створюється заново і стартує з початку свого loop; декодувати обидва ролики одночасно не потрібно.
- Звичайний tap та `advance()` не можуть завершити cutscene.
- Додати окремі методи:
  - `completeVideo(stepId)` для natural end/endAt;
  - `skipVideo(stepId)` для явної кнопки Skip.
- Обидва методи спочатку атомарно очищають pending/halt guard, потім один раз пересувають internal index і викликають `processNext()`.
- Повторний/stale completion із неправильним stepId є no-op.
- Повторний вхід у той самий cutscene-step після backward `goto` створює нову pending-сесію. Completion зі старої player-сесії не може завершити нову; guard має включати session token/generation, а не покладатися лише на однаковий `stepId`.
- Video halt не додається до rollback stack.
- `canRollback` під час cutscene не дозволяє обійти її через загальний Back; Skip має окрему semantics.
- `timelineKey` залишається залежним лише від authoring data; player progress не потрапляє в `step.data`.

### Save/load policy

- Додати ephemeral `readerBlockingMedia` до Zustand app state. `AppStorePersistenceState` і `buildPersistedAppState()` уже є явним allowlist: не додавати поле до них, покрити це persistence test і не збільшувати `APP_STORE_PERSIST_VERSION` без іншої зміни persisted envelope.
- Reader встановлює його на старті blocking cutscene і гарантовано очищає на complete, skip, error, scene transition, load replacement та unmount.
- `StoryAutoSave` не планує/скасовує timer, коли blocking media активне.
- ReaderMenu вимикає Quick Save/Save під час катсцени й показує зрозуміле повідомлення.
- Load залишається дозволеним і спершу очищає video player/session.
- SaveSlot schema та step index у цьому релізі не змінюються.
- Для thumbnail save slot передавати стабільне asset reference постера активного background video (`assetId` або `idb://`), яке резолвиться лише під час показу слота. `SaveSlotScenePreviewInput`/`createSaveSlot()` використовує його перед static `backgroundImageUri`, а за відсутності poster повертається до статичного фону.

### Audio та autoplay

- `SceneVideoLayer` не імпортує `AudioPlayerService` і не створює другу BGM session.
- Розширити `useReaderAudio`/його coordinator так, щоб cutscene могла duck BGM і відновити гучність після complete/skip/error.
- Video player отримує volume/muted, але життєвий цикл reader audio session залишається централізованим.
- Preview координує власний preview BGM окремо, без імпорту reader-only manager.
- На web при rejected autoplay зі звуком показувати overlay «Натисніть, щоб відтворити». Executor залишається halted, поки користувач не запустить ролик або не натисне дозволений Skip.

### Player lifecycle

- App background/focus loss: pause; повернення: resume лише якщо та сама cutscene ще pending.
- Source replacement і scene transition: release старого player до створення нового; при поверненні фон створюється заново з початку loop.
- `endAt` обробляється як natural completion без фізичного trimming.
- Skip eligibility рахується за накопиченим active playback time; pause/background/autoplay wait не наближають появу кнопки.
- Playback error: показати poster/error; якщо skippable, запропонувати Skip, інакше показати recovery action, який завершує блок із diagnostic, щоб історія не зависла назавжди.

### Acceptance gate зрізу B

Cutscene зі звуком стартує після дозволеного gesture, блокує tap-to-continue, завершується рівно один раз, коректно duck-ить BGM, підтримує delayed Skip, відновлює попередній відеофон і не переграється rollback-ом. Save/autosave не створюють неоднозначний слот під час halt.

## Етап 4. Анімаційні пресети

Це незалежна робота; її можна виконувати після стабілізації моделі або паралельно з cutscene runtime, якщо файли не перетинаються.

- Не додавати `AnimationBlockData`.
- У character editor згрупувати наявні show/hide/move/shake/scale та entrance transitions у пресети Fade, Slide, Zoom, Shake, Pulse.
- У effect editor додати пресети атмосфери Rain, Snow, Fog, Glitch з поточними intensity/duration options.
- У camera editor додати Pan, Zoom, Focus presets з наявним easing.
- Preset лише заповнює вже наявний canonical data; після save/read round-trip він не залежить від назви preset.
- Перевірити Preview/Reader parity для кожного preset.

Reduced motion не включати сюди приховано. Для нього потрібен окремий план: реальний `UserSettings` contract, system preference через `AccessibilityInfo`, пріоритет user override та таблиця поведінки для кожного effect/camera/character transition. Поточні translation keys і `ReduceMotion.Never` не вважаються завершеною функцією.

## Етап 5. Hardening і реліз

### Автоматизовані перевірки

- Event factory defaults та validation.
- Canonical `SceneRecord -> DocumentScene -> SceneRecord` round-trip.
- SceneDocument serializer/parser/adapter round-trip.
- Plate HTML render/collect, slash insertion, Pick/Edit message flow.
- Asset usage, Story Doctor codes і EN/UK messages.
- Background play/replace/stop і static background restoration.
- Cutscene natural end, absolute endAt, delayed Skip за active playback time, stale/double completion, tap guard і відновлення попереднього відеофону.
- Backward `goto` через той самий cutscene-step: старий completion відкидається, нова pending-сесія не зависає.
- Rollback до/після cutscene не переграє video.
- Save/auto-save блокуються під час cutscene; load очищає pending video.
- Web autoplay rejection не завершує executor.
- Audio ducking завжди відновлюється на complete/skip/error/unmount.
- Backup/restore і missing video/poster.
- Poster збирається як image reference, не стає unused і використовується як thumbnail save slot для активного відеофону.
- Image ↔ video asset replacement не ламає scene та не маскує kind mismatch.
- Старі persisted stories проходять hydration без migration rewrite.

### Ручна platform matrix

| Сценарій | Web | Android | iOS |
|---|---:|---:|---:|
| MP4 з локального picker | ✓ | ✓ | ✓ |
| Background muted autoplay | ✓ | ✓ | ✓ |
| Cutscene зі звуком | gesture fallback | ✓ | ✓ |
| startAt/endAt | ✓ | ✓ | ✓ |
| app background/resume | ✓ | ✓ | ✓ |
| missing/corrupt file recovery | ✓ | ✓ | ✓ |
| backup/export/import offline | ✓ | ✓ | ✓ |

### Команди перед завершенням

```bash
pnpm check
pnpm test
pnpm check:editor-boundaries
pnpm check:reader-audio-boundaries
pnpm lint
graphify update .
```

Також виконати `git diff --check` і production web/native bundle smoke, оскільки `expo-video` ще не імпортувався поточним кодом.

## Орієнтовний список файлів

Список уточнюється grep-ом по `stop_effect`, але мінімально охоплює:

### Модель і round-trip

- `lib/engine/types.ts`
- `lib/engine/event-factory.ts`
- `lib/engine/runtime-types.ts`
- новий `lib/engine/video-utils.ts`
- `lib/engine/useSceneExecutor.ts`
- `lib/engine/conditionUtils.ts`
- `lib/document-editor/types.ts`
- `lib/document-editor/commands.ts`
- `lib/document-editor/document-scene.ts`
- `lib/scene-document/sceneTypes.ts`
- `lib/scene-document/sceneRecordAdapter.ts`
- `lib/scene-document/sceneParser.ts`
- `lib/scene-document/sceneSerializer.ts`
- `lib/scene-document/sceneValidation.ts`
- `lib/editor/story-manuscript.ts`
- `lib/story-hooks.ts`
- `lib/ai/scene-patch-types.ts`

### Plate/editor

- `lib/vn-plate-editor/types.ts`
- `lib/vn-plate-editor/embedded-commands.ts`
- `lib/vn-plate-editor/embedded-renderers.ts`
- `lib/vn-plate-editor/embedded-script.ts`
- `lib/vn-plate-editor/scene-normalizer.ts`
- `components/vn-plate-editor/PlateWebViewEditor.web.tsx`
- `components/editor/plate/PlateSceneEditor.shared.tsx`
- `components/document-editor/DocumentSceneEditor.tsx`
- `app/document-editor.tsx`

### Assets, backup і діагностика

- `lib/media-library-service.ts`
- новий `lib/pick-video.ts`
- `lib/asset-usage.ts`
- `lib/story-doctor.ts`
- `lib/story-backup/capture.ts`
- `stores/backup-local-repository.ts`
- `lib/translations.ts`
- `lib/translations.json`
- `stores/app-store-types.ts`
- `stores/app-store-persistence.ts`
- `stores/app-store-slices/libraries-slice.ts`

### Runtime UI та save/audio

- новий `components/reader/SceneVideoLayer.tsx`
- `components/reader/ReaderDisplay.tsx`
- `components/story-reader-responsive.tsx`
- `components/editor/PreviewScreen.tsx`
- `hooks/useReaderAudio.ts`
- `components/ReaderMenu.tsx`
- `components/StoryAutoSave.tsx`
- `lib/story-domain.ts`
- `stores/app-store-slices/saves-slice.ts`

## Definition of Done

- Автор може імпортувати та повторно використати MP4 без base64 і без ffmpeg.
- `/video background` і `/video stop` працюють однаково в preview та reader.
- Катсцена має окремий executor completion protocol і не пропускається звичайним tap.
- Double completion, rollback, load, unmount і web autoplay не залишають executor у завислому стані.
- Backward `goto` через cutscene не дозволяє stale player completion завершити нову pending-сесію.
- Після complete/Skip/recoverable error катсцени попередній відеофон автоматично повертається.
- Video audio не порушує reader audio boundary та BGM повертає попередню гучність.
- Save/autosave не створюються посеред blocking cutscene.
- Plate save/load, text serialization, JSON і `.vnebackup` зберігають video step та asset.
- Poster має image reference, story membership, backup coverage і використовується для save-slot thumbnail активного відеофону.
- 100+ MiB файл відхиляється до читання bytes; допустимий файл не копіюється через base64.
- Автор бачить ліміт 64 MiB до picker і фактичний size одразу після вибору.
- Story Doctor розрізняє missing video, background, audio, poster і неправильні timing options.
- Старі історії та всі image/audio сценарії залишаються сумісними.
- Усі автоматизовані команди й ручна platform matrix пройдені.

## Порядок виконання

1. Spike, повний native rebuild і platform gate.
2. Media foundation та backup.
3. Повний фоновий video slice, включно з мінімальним `/video` UX.
4. Окремий cutscene slice з executor/save/audio hardening.
5. Анімаційні пресети; якщо native rebuild блокує етап 0, виконати їх раніше як незалежний видимий результат.
6. Загальна regression matrix і реліз.

Після етапу 3 можна випустити корисну фонову video-функцію, не чекаючи складнішого cutscene protocol.
