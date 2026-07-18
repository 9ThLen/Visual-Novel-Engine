# План v1.2: налаштування AI та вкладення у чат

Статус: другий cross-review завершено; готовий до реалізації пакетами
Дата: 2026-07-18
Базовий стан: AI-міст після пакетів R0–R3 (`wiki/ai-openai-provider-corrective-plan.md`)

## 1. Обсяг

1. Користувач може додати до повідомлення зображення, PDF або UTF-8 text/Markdown.
2. Вкладення передається Claude Code або OpenAI як контекст моделі.
3. Зображення з повідомлення можна окремою явною кнопкою імпортувати до бібліотеки
   поточної історії.
4. Наявні AI-налаштування консолідуються в одній поверхні; модель і токен-бюджет
   можна змінювати лише в межах політики, яку оголосив локальний міст.

Codex лишається fail-closed і прихованим. Вкладення для demo/Codex недоступні.
У цьому раунді вкладення є **web-only**, як і локальний bridge-сценарій; LAN/TLS і
мобільне підключення не додаються.

## 2. Перевірений базовий стан

- `⚙` уже існує в `components/ai-chat/AiChatPanel.tsx` і відкриває лише
  `AiPermissionSettings`. Підключення, дозволи й disconnect/reset розкидані по
  трьох поверхнях.
- `AgentProvider.send(text: string)` змушує змінити контракт усіх провайдерів,
  сервера і тестових `FakeProvider`.
- Встановлений `@anthropic-ai/claude-agent-sdk@0.3.207` приймає
  `prompt: string | AsyncIterable<SDKUserMessage>`. Його `MessageParam` підтримує
  base64 JPEG/PNG/GIF/WebP, base64 PDF і plain-text document blocks.
- OpenAI Responses API приймає зображення як `input_image.image_url` з data URL,
  а PDF/text як `input_file` з `filename` і `file_data`. Актуальна офіційна секція
  [PDF detail levels](https://developers.openai.com/api/docs/guides/file-inputs#pdf-detail-levels)
  прямо дозволяє `detail: 'auto' | 'low' | 'high'` на Responses `input_file`;
  `low` зменшує кількість візуальних токенів. Якщо поле пропущене, API використовує
  `auto`: для GPT-5.6+ це означає `high`, а для попередніх моделей — `low`.
  Оскільки поточний `DEFAULT_OPENAI_CHAT_MODEL` — `gpt-5.6`, явний `detail:'low'`
  є обов'язковим захистом від прихованого множника вартості й дефолтом цього плану.
  Chat Completions цього поля не підтримує, але цей міст використовує Responses API.
- Протокол зараз v3: 1 МБ для звичайного кадру і 8 МБ для бінарного. `user_message`
  ще не має власного великого type-gated ліміту.
- `BridgeClient.send()` мовчки відкидає завеликий кадр, але `sendUserMessage()`
  все одно повертає `{ok:true}`. Для вкладень це дало б нескінченний `thinking`.
- Сервер зараз вимагає непорожній `user_message.text`; вкладення без тексту він
  відхилить.
- Транскрипт персиститься з лімітом 512 КБ. Байти не можуть зберігатися в
  `AiChatMessage`.
- `pending-image-storage` уже дає потрібний патерн квот/TTL/очистки, але його
  IndexedDB store містить тільки `PendingAiImage`. Змішувати туди PDF/text не можна.
  `lib/idb-storage.ts` зараз має `DATABASE_VERSION = 2`.
- OpenAI-провайдер має `MAX_REQUEST_BYTES = 1_000_000` і
  `MAX_HISTORY_BYTES = 750_000`. Без окремої multimodal-політики валідне вкладення
  буде відхилене або зламає commit історії.
- OpenAI працює stateless (`store:false`), тому вкладення, яке має лишатися
  доступним для follow-up, доведеться повторно передавати в історії. Це впливає
  на байти, токени й вартість.
- `APP_STORE_PERSIST_VERSION = 5`; `AiBridgeSettings` зараз містить лише
  URL/token/disabled/provider/consent.
- Бібліотека проєкту підтримує лише `image | audio`, тому PDF/text не є ассетами.
- `expo-image-picker`, `expo-document-picker`, `expo-file-system` уже встановлені.

## 3. Зафіксовані рішення та інваріанти

- У транскрипті зберігаються лише `AttachmentRef`: `id`, безпечне ім'я, `kind`,
  `mimeType`, `byteSize`, опційно `width/height` та `assetId`. Base64/data URL/Blob
  у Zustand persist не потрапляють.
- Вкладення зберігаються в IndexedDB до 7 днів, переживають reload, але не входять
  у story export/backup. Сховище браузера не вважається зашифрованим.
- Після TTL/евікції transcript-chip лишається й показує локалізоване
  «вкладення більше недоступне», а не ламає рендер.
- Клієнтська перевірка — UX; сервер повторно перевіряє base64, фактичні байти,
  формат, кількість і сумарний розмір. MIME/розширенню/імені клієнта не довіряємо.
- Зображення v1: JPEG, PNG, WebP. GIF і SVG відхиляються. Перед збереженням і
  відправкою статичне зображення пере-кодується через наявний canvas/WebP-патерн:
  це прибирає EXIF/GPS і обмежує розмір/пікселі. Steganography та видимий prompt
  injection цим не усуваються.
- PDF визначається за сигнатурою; text/Markdown — строгим UTF-8 decode з
  відхиленням NUL/бінарних control bytes. Ім'я нормалізується до basename,
  обмежується за довжиною, без control/bidi-символів.
- Максимум 4 вкладення; text — до 256 КБ; кожне image/PDF — до 5 МБ; **сума
  декодованих байтів одного повідомлення — до 5 МБ**. Це залишає запас для
  base64 (4/3), JSON і metadata всередині 8-МБ WebSocket envelope.
- Загальна квота локальних AI-бінарних даних (pending generated images плюс chat
  attachments) не перевищує 100 МБ. Евікція детермінована, oldest-first.
- Немає автоматичного resend після reconnect: неоднозначну доставку не можна
  повторювати, бо модель може двічі виконати інструмент.
- Успішна передача першого кадру з вкладенням переводить conversation у
  **untrusted-attachment mode до підтвердженого `conversation_reset`**. Авторитетний
  прапорець живе у bridge-session і є єдиним джерелом стану — браузер його **не**
  дзеркалить (див. п. 4 нижче). Сервер повертає прапорець у `session_started` і
  штампує його на кожному `tool_call` envelope, тому
  reload та resume тієї самої сесії не повертають `auto`. Новий `sessionId` не
  успадковує старий прапорець; невдалий reset його не скидає.
- У untrusted-режимі діє default-deny: лише явно класифіковані read-only tools
  лишаються без додаткового confirm. Будь-яка capability та будь-який новий або
  некласифікований model-tool отримує не вище `confirm`; `blocked` лишається
  `blocked`. Забутий майбутній інструмент не може автоматично отримати доступ.
- Імпорт зображення кнопкою користувача не є AI-capability: сама кнопка — явний
  намір. Модельний `asset_import` tool у цей раунд не додається.
- До відправки UI прямо показує, що байти підуть обраному зовнішньому провайдеру.
  Не використовувати формулювання «файл нікуди не надсилається».
- API-ключ лишається тільки у bridge-процесі. Browser може вибирати лише модель і
  бюджет, які міст явно оголосив дозволеними; сервер завжди авторитетний.

## 4. Пакет A6a — консолідація наявного UI налаштувань

Залежності: немає. Йде першим і не змінює протокол.

Файли: `components/ai-chat/AiSettingsPanel.tsx` (новий), `AiChatPanel.tsx`,
`ConnectionCard.tsx`, `AiPermissionSettings.tsx`, `lib/translations.ts`, тести.

Завдання:

1. `⚙` відкриває одну поверхню з секціями: connection, permissions,
   provider status, attachments/privacy, danger zone.
2. Перевикористати `ConnectionCard` та `AiPermissionSettings`; не дублювати їх.
3. Перенести disconnect/reset із `⋯`; прибрати дубльований пункт permissions.
4. Розрізнити дії:
   - clear local transcript + attachment bytes;
   - reset provider conversation (лише connected);
   - reset connection credentials/session.
5. Clear transcript/attachments має окреме підтвердження.
6. Поки A6b не влитий, model/budget показуються read-only як «керуються мостом».
7. EN/UK, keyboard/focus handling, accessibility roles/labels.

Тести: усі секції доступні з `⚙`; немає дублювання у `⋯`; кожна danger-дія має
правильний scope; cancellation нічого не видаляє; наявні permission-тести зелені.

## 5. Пакет A0 — доменна модель, санітизація і сховище

Залежності: немає; може йти паралельно з A6a. Без UI/протоколу.

Файли: `lib/ai/attachments.ts`, `lib/ai/attachment-storage.ts`,
`lib/ai/attachment-storage.web.ts`, `lib/idb-storage.ts`, `lib/ai/image-tools.ts`,
`stores/ai-chat-store.ts`, тести.

Завдання:

1. Ввести `AttachmentRef`, `StoredChatAttachment`, `AgentAttachment` і pure helpers,
   які працюють з `Uint8Array` та не залежать від React/Node.
2. Винести/перевикористати наявне canvas-downscale кодування з `image-tools.ts`;
   не створювати другий image pipeline.
3. Додати окремий IndexedDB store `ai-attachments`, підняти DB 2→3. Store
   `pending-images` не змішувати з іншими типами.
4. `AiChatMessage.attachments?: AttachmentRef[]`; `addMessage` приймає refs, але
   `capMessages` рахує тільки metadata.
5. Репозиторій: put/get/delete/list/reconcile; TTL, per-story/per-message/global
   quota, cleanup після clear, видалення story, transcript cap і hydration.
6. Двохфазний lifecycle: байти persist до send; transcript ref додається лише після
   успішного прийняття кадру клієнтом. Orphan після crash прибирає reconcile/TTL.
7. Видалення draft-chip одразу видаляє blob, якщо на нього не посилається message.
8. Рендер не створює довгоживучих object URL; кожен URL відкликається.

Тести: upgrade IndexedDB 2→3 без втрати kv/media/pending-images; magic bytes;
strict UTF-8; SVG/GIF/control/bidi filename rejection; EXIF не лишається у
sanitized output; pixel/byte caps; quota/TTL/orphans; transcript cap видаляє
непотрібні bytes; missing blob не ламає message.

## 6. Пакет A1 — протокол v3 → v4 і capability handshake

Залежності: A0.

Файли: `lib/bridge-protocol.ts`, `lib/bridge-client.ts`,
`tools/ai-bridge/src/server.ts`, тести протоколу/сервера.

Завдання:

1. Підняти `BRIDGE_PROTOCOL_VERSION` 3→4.
2. `user_message`:
   `{ text: string, attachments?: WireAttachment[] }`, де байти — base64.
   `text` може бути порожнім тільки за наявності хоча б одного вкладення.
3. Додати type-gated 8-МБ ліміт для `user_message` з attachments; звичайне
   повідомлення лишається на 1 МБ. Перевіряти max count і 5-МБ decoded aggregate
   **до** алокації великих Buffer, потім strict-decode і magic bytes.
4. `BridgeClient.send()` повертає результат; oversized/serialization/socket-send
   дають `MESSAGE_TOO_LARGE`/`DELIVERY_FAILED`, а не `{ok:true}`.
5. `session_started` оголошує безпечний manifest: provider, accepted kinds/MIME,
   max count/decoded bytes, attachment support, provider policy для A6b та
   server-owned `untrustedAttachmentMode`. UI не хардкодить capability провайдера.
6. Tool-call envelope отримує server-computed marker untrusted conversation,
   який браузер примусово враховує; provider/model args не можуть його встановити
   або прибрати.
7. v4 client ↔ v3 bridge і навпаки дають `PROTOCOL_VERSION_MISMATCH` з дією
   «оновити міст», без reconnect-loop.

Тести: attachments-only; malformed/uncanonical base64; mismatch MIME/magic;
невідомий kind; count/decoded/envelope overflow; звичайний text-path без регресії;
silent-drop regression; version skew; manifest не містить ключів/env secrets;
`session_started` та tool-call marker не приймаються з model args.

## 7. Пакет A6b — безпечні model/budget settings

Залежності: A1. Це **не** частина низькоризикової A6a.

Файли: `lib/ai/bridge-config.ts`, `lib/bridge-protocol.ts`, `lib/bridge-client.ts`,
`lib/app-store-persistence.ts`, `components/ai-chat/AiSettingsPanel.tsx`,
`tools/ai-bridge/src/main.ts`, `server.ts`, `provider.ts`, тести.

Завдання:

1. Bridge policy:
   - `OPENAI_CHAT_MODEL` — ефективний default/fixed model;
   - `OPENAI_ALLOWED_CHAT_MODELS` — явний allowlist; без нього UI не може змінити model;
   - `OPENAI_SESSION_TOKEN_BUDGET` — default/fixed budget;
   - `OPENAI_MAX_SESSION_TOKEN_BUDGET` — hard ceiling; без нього UI не може
     підвищувати/довільно задавати budget.
2. `session_start` може надіслати requested model/budget; сервер валідовує allowlist,
   діапазон і сумісність моделі з attachments до створення provider.
3. `session_started` повертає лише effective values, allowed values/range і locked
   flags. Жодних env/key values.
4. Зміна model/budget застосовується через явне «Apply and start new conversation»:
   закриває resume session, очищає provider conversation і перепідключається.
5. Persist requested values у `AiBridgeSettings`, bump app persist 5→6. Міграція
   нормалізує лише нові поля; full-state v5 fixture доводить identity інших slices.
6. Для Claude показувати лише фактично оголошені bridge values; не вигадувати
   модельний picker, якого провайдер не підтримує.

Тести: browser не може вийти за allowlist/max; env/fixed перемагає UI; invalid
request fail-closed; apply скидає conversation; v5→v6 не змінює інші slices;
manifest/логи не містять секретів.

## 8. Пакет A2 — контракт провайдерів і multimodal history

Залежності: A1. Перед оцінкою — обов'язковий Claude resume spike.

Файли: `tools/ai-bridge/src/provider.ts`, `claude-provider.ts`,
`claude-conversation.ts`, `openai-provider.ts`, `codex-provider.ts`, `server.ts`, тести.

### Spike A2s

Живим або максимально близьким інтеграційним тестом перевірити
`AsyncIterable<SDKUserMessage>` разом із `ClaudeConversation.withResume`:
перший multimodal turn → session id → другий text turn → reset. Якщо resume не
працює, A2 зупиняється для окремого рішення; не вимикати пам'ять мовчки.

### Реалізація

1. `send(input: AgentUserInput)`, де `text` може бути порожнім за наявності
   attachments, а attachment bytes — уже валідований `Uint8Array`.
2. Claude: один `SDKUserMessage` через async iterable; text block + image blocks,
   PDF `Base64PDFSource`, Markdown/text як `PlainTextSource(media_type:'text/plain')`.
3. OpenAI:
   - image → `input_image` data URL;
   - PDF/text → `input_file` з safe filename і base64 `file_data`;
   - PDF завжди передає явний `detail:'low'`; не покладатися на omission/`auto`,
     бо для поточного GPT-5.6 `auto` означає `high`;
   - `store:false`; Files API не використовується, remote file id не створюється.
4. Додати окремі multimodal request/history byte caps. Поточні 1 МБ/750 КБ не
   підвищувати глобально. Історія зберігає максимум один найновіший
   attachment-bearing user turn; compaction видаляє тільки цілі turn-групи разом
   із reasoning/function call/output. Immediate follow-up може бачити вкладення;
   після eviction UI/модель чесно просять прикріпити його знову.
5. У stateless OpenAI tool-round вкладення може повторно входити в запит. Це
   враховується у byte caps і фактичному `sessionTokens`; тест не має припускати,
   що один attachment оплачується один раз.
6. Session token budget перевіряється до кожного round і після usage. Гарантувати
   точний preflight для image/PDF неможливо; UI прямо каже, що один multimodal
   request може перевищити залишок оцінки. Hard byte caps лишаються строгими.
7. Codex повертає структурований `ATTACHMENTS_UNSUPPORTED`; не ігнорує bytes.
8. Abort/timeout/consumer-break звільняють stream, base64 і attachment refs; bytes
   та content не потрапляють у diagnostics/logs/error messages.

Тести: native request shape обох провайдерів; resume spike regression; OpenAI
history/tool-round replay і turn-atomic compaction; current-turn oversized не
отруює prior history; provider unsupported; abort cleanup; exact PDF/text/image
mapping; no attachment content in logs.

## 9. Пакет A5 — межа недовіреного вмісту

Залежності: A2. Жорсткий gate перед UI A3.

Файли: `tools/ai-bridge/src/system-prompt.md`, provider input builders,
`tool-runtime.ts`, `server.ts`, `lib/bridge-client.ts`, `lib/ai/bridge-tools.ts`,
`lib/ai/permissions.ts`, `AiChatPanel.tsx`, тести.

Завдання:

1. System prompt: вкладення — дані, а не інструкції; не виконувати команди з
   document/image content.
2. Plain text загортається у явні untrusted delimiters. Для image/PDF неможливо
   «загорнути OCR»; їх ставимо в окремі content blocks із сусіднім untrusted label.
3. Після серверної валідації першого attachment bridge встановлює у поточній
   session `untrustedAttachmentMode=true` **до** передачі контенту провайдеру.
   Прапорець повертається у `session_started` при resume й додається сервером до
   кожного tool-call envelope. Лише успішний provider reset перед
   `conversation_reset_ack` скидає його.
4. Свідоме рішення реалізації: browser **не** дзеркалить
   `untrustedAttachmentMode` у `sessionStorage`. Авторитетом є bridge-session:
   сервер повертає marker в `session_started` при resume та сам штампує
   його на кожен `tool_call`. Це захищає reload/resume без другого
   джерела стану; локальне дзеркало не захищало б від збою
   самого bridge й додавало б ризик stale marker для нової session.
5. У registry кожен model-tool має явний effect (`read` / `mutation` / `cost`) і,
   для не-read дій, валідну capability. Поточний read-only allowlist:
   `get_story_overview`, `list_scenes`, `get_scene`, `list_story_images`,
   `get_image_details`, `find_asset_usage`. Новий/невідомий/некласифікований tool
   fail-closed не виконується автоматично.
6. Єдиний browser helper визначає ефективний рівень: `blocked` → `blocked`;
   untrusted + будь-яка `AI_CAPABILITIES` capability → `confirm`; інакше чинна
   політика. Прямі auto-гілки scene/appearance та bridge-side preflight не можуть
   обходити цей helper.
7. Provider/model args не можуть підробити marker або повернути `auto`.
8. UI показує захисний стан і пояснює, що лише успішний reset conversation його
   скидає.

Тести: injection у text/image/PDF не обходить confirm ні в поточному, ні в
наступному turn; auto→confirm, blocked→blocked; reset ack скидає flag, а reset
failure — ні; reload + resume тієї самої session зберігає захист; нова session не
успадковує старий marker; storage exception не вимикає server-owned захист;
read-only allowlist працює; новий non-read tool без явної класифікації fail-closed;
content/bytes не потрапляють у логи.

## 10. Пакет A3 — UI композера

Залежності: A2 + A5.

Файли: `components/ai-chat/AiChatPanel.tsx`, `AttachmentChip.tsx`,
`AttachmentPreview.tsx` (за потреби), `lib/translations.ts`, тести.

Завдання:

1. Attach-кнопка доступна лише web + connected + manifest supports attachments +
   status idle. Demo/Codex/unsupported model — disabled з поясненням.
2. `expo-image-picker` / `expo-document-picker`; picker cancel не є помилкою.
3. Draft chips: safe name, type, size, image thumbnail, remove, validation/read
   status. PDF не рендерити в iframe, text/Markdown не рендерити як HTML.
4. Дозволити attachment-only send. Base64 створювати just-in-time; після socket
   send не тримати його у React/Zustand state.
5. На `MESSAGE_TOO_LARGE`, read failure або delivery failure лишати draft і
   повертати status idle з локалізованою помилкою.
6. Transcript bubble показує refs після reload; missing/expired blob — стабільний
   unavailable-chip. Object URLs revoke на remove/unmount/replacement.
7. Перед send — видимий disclosure з реально connected provider. Для PDF окремо
   попередити про підвищене token usage.
8. Під час thinking/interrupting не можна змінювати draft attachments.

Тести: image/PDF/text happy paths; cancel; malformed/oversized; attachments-only;
send failure retains draft; no transcript bytes; reload/missing/expired; provider
switch; unsupported manifest; a11y; URL cleanup.

## 11. Пакет A4 — явний імпорт image attachment як ассета

Залежності: A3.

Файли: `AttachmentChip.tsx`/message card, `stores/ai-chat-store.ts`,
`stores/media-library-actions.ts`, `stores/use-app-store.ts` через наявні actions,
тести.

Завдання:

1. Тільки image attachment має кнопку «Додати до бібліотеки історії».
2. Перевикористати `addAssetToLibrary()` і store action `addImageAssetToStory()`;
   не викликати pure helper напряму і не будувати паралельний import pipeline.
3. Кнопка користувача є підтвердженням. Не додавати `asset_import` capability,
   app-persist migration чи model tool.
4. Після успіху записати `assetId` у `AttachmentRef`; повторне натискання
   idempotent. До підтвердженого persist бібліотеки attachment bytes не видаляти.
5. PDF/text не імпортуються як media assets.

Тести: успіх/retry/idempotency; store action реально зв'язує asset зі story;
помилка не втрачає attachment; reload показує imported state; PDF/text без кнопки.

## 12. Пакет A7 — інтеграція і release gates

Залежності: A3; A4/A6b — якщо входять у той самий реліз.

1. `pnpm check`, повний `pnpm test` у дефолтному parallel mode, `git diff --check`.
2. Self-contained bridge package test і `--version`.
3. Browser E2E: attach → send → stream → tool confirm → reload → clear cleanup;
   attachment-only; oversized; protocol mismatch; unsupported provider.
4. Opt-in live OpenAI smoke з мінімальними PNG/PDF/text fixtures. Він платний і
   запускається лише з явним env gate + test key.
5. Opt-in live Claude smoke: multimodal first turn, text follow-up через resume,
   reset. Без цього Claude attachments не оголошувати production-ready.
6. Перевірити, що API key/value, base64, filenames і document text відсутні у
   browser logs, bridge logs, diagnostics та test snapshots.
7. Окремий security regression: attachment injection не обходить auto permissions
   у наступному turn, після reload або після resume тієї самої bridge-session.

## 13. Порядок виконання

```text
A6a ───────────────┐
                   ├→ A1 → A6b → A2s → A2 → A5 → A3 → A4 → A7
A0  ───────────────┘
```

A6a та A0 можна робити паралельно. A2 не оцінювати до spike A2s. A5 — жорсткий
security gate. A6b не роздавати паралельно з A3: обидва торкаються settings,
`AiChatPanel`, bridge-client і translations.

## 14. Свідомо поза scope

- Codex attachments або увімкнення Codex Beta.
- LAN/TLS/mobile transport.
- Модельний `asset_import` tool.
- OCR/парсинг PDF у браузері, антивірус, sandboxed document preview.
- GIF/SVG, audio/video/archive attachments.
- OpenAI Files API, File Search або довготривале provider-side file storage.
- Шифрування IndexedDB чи включення chat attachments у story backup/export.
- Коміт/стейджинг без окремої команди користувача.
