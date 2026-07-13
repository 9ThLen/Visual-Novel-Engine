# AI Chat Integration — Delegation Prompts

Companion to `wiki/ai-chat-integration-plan.md` (plan v2). Work is split into five
packages by complexity and assigned to different models. Prompts are self-contained
and ready to paste.

## Complexity split

| # | Package | Complexity | Model | Why |
|---|---|---|---|---|
| A | Bridge protocol + WS client (reconnect, heartbeat) | Medium, **isolated** | **ChatGPT** | Pure TS module, no repo knowledge, no Anthropic SDK; contract fully specified in the prompt |
| B | ScenePatch core: validate/apply/describe + revision hash + tests | **High**, domain-critical | **Opus** | Heart of the system: domain invariants, pure functions, highest cost of error |
| C | Store adapter: snapshot→apply→rollback + read DTOs | Medium | **Sonnet** | Mechanical work against existing store actions with clear requirements |
| D | UI: right rail `Inspector\|AI`, chat panel, diff preview, fake agent | Medium | **Sonnet** | RN/Expo UI against contracts fixed in B and C |
| E | AI Bridge server (Claude Agent SDK, auth, streaming, cancel) | **High** | **Opus** | Anthropic-specific SDK (ChatGPT tends to hallucinate its API) + security requirements |

**Dependencies:** A and B run in parallel (independent). C after B. D after B+C. E after A.
Claude prompts assume Claude Code running inside this repo; the ChatGPT prompt is
fully standalone (no repo access needed).

---

## Prompt A — ChatGPT (protocol + WS client)

```text
Ти — senior TypeScript-розробник. Напиши ізольований модуль без зовнішніх залежностей
(тільки стандартні Web API): протокол зв'язку і браузерний WebSocket-клієнт для
локального AI-моста. Модуль буде вставлений у Expo/React Native Web проєкт
(TypeScript strict, ES2020), але НЕ повинен імпортувати нічого з React чи React Native.

СТВОРИ ДВА ФАЙЛИ:

=== Файл 1: bridge-protocol.ts ===
Версійований, транспорт-незалежний протокол. Точний контракт:

export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export type ClientMessageType =
  | 'session_start'   // payload: { token: string; resumeSessionId?: string }
  | 'user_message'    // payload: { text: string; context?: unknown }
  | 'interrupt'       // payload: {} — скасувати поточну генерацію
  | 'tool_result'     // payload: { toolCallId: string; ok: boolean; result?: unknown; errorCode?: BridgeErrorCode; errorMessage?: string }
  | 'ping';           // payload: {}

export type ServerMessageType =
  | 'session_started' // payload: { sessionId: string; resumed: boolean }
  | 'assistant_delta' // payload: { text: string } — стрімінговий шматок відповіді
  | 'assistant_done'  // payload: { stopReason: 'end' | 'interrupted' | 'error' }
  | 'tool_call'       // payload: { toolCallId: string; toolName: string; input: unknown } — міст просить БРАУЗЕР виконати тул
  | 'status'          // payload: { state: 'idle' | 'thinking' | 'awaiting_tool' }
  | 'error'           // payload: BridgeError
  | 'pong';           // payload: {}

export type BridgeErrorCode =
  | 'VALIDATION_FAILED' | 'STALE_REVISION' | 'PERMISSION_DENIED'
  | 'PROVIDER_UNAVAILABLE' | 'CANCELLED' | 'UNAUTHORIZED' | 'PROTOCOL_ERROR';

export interface BridgeError { code: BridgeErrorCode; message: string; details?: unknown; }

export interface BridgeEnvelope<T = unknown> {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;   // унікальний id повідомлення (crypto.randomUUID)
  sessionId: string;   // '' до session_started
  type: ClientMessageType | ServerMessageType;
  payload: T;
}

Додай: type guards (isBridgeEnvelope, isServerMessage), фабрику makeEnvelope,
безпечний парсер parseEnvelope(raw: string): BridgeEnvelope | { parseError: string }
(без винятків), константу MAX_MESSAGE_BYTES = 1_000_000 і перевірку розміру в парсері.

=== Файл 2: bridge-client.ts ===
Клас BridgeClient поверх нативного WebSocket:

new BridgeClient(options: {
  url: string;               // ws://127.0.0.1:PORT
  token: string;
  onEvent: (msg: BridgeEnvelope) => void;      // усі server-повідомлення крім pong
  onToolCall: (toolCallId: string, toolName: string, input: unknown) => Promise<
    { ok: true; result: unknown } | { ok: false; errorCode: BridgeErrorCode; errorMessage: string }>;
  onConnectionChange: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
})

Вимоги до поведінки:
1. connect(): відкриває WS, першим повідомленням шле session_start з token
   (і resumeSessionId, якщо був попередній sessionId — session resume).
2. Heartbeat: ping кожні 15 с; якщо pong не прийшов за 10 с — вважати з'єднання
   мертвим, закрити і перейти в reconnect.
3. Auto-reconnect: експоненційний backoff 0.5s → 1s → 2s → 4s → max 15s,
   з jitter; після відновлення — session_start з resumeSessionId.
4. Черга вихідних повідомлень: sendUserMessage(text, context) під час
   reconnecting буферизується (ліміт 20) і відправляється після відновлення.
5. Обробка tool_call: викликати onToolCall, результат відправити назад як
   tool_result з тим самим toolCallId. Помилки onToolCall не мають валити клієнт —
   загорнути в { ok: false, errorCode: 'VALIDATION_FAILED', ... }.
6. interrupt() — надіслати interrupt; close() — свідоме закриття без reconnect.
7. Ігнорувати повідомлення з чужим protocolVersion, повідомивши onEvent
   синтетичною помилкою PROTOCOL_ERROR.
8. Жодних таймерів, що течуть: усі setTimeout/setInterval очищаються в close()
   і при переходах станів.

=== Тести (файл 3: bridge-client.test.ts, vitest) ===
Мок WebSocket класом (не бібліотекою). Покрий мінімум:
- handshake: перший фрейм = session_start з токеном;
- heartbeat-timeout запускає reconnect зі зростаючим backoff;
- resume: після reconnect шле resumeSessionId;
- буферизація user_message під час reconnect і відправка після відновлення;
- tool_call → onToolCall → tool_result з тим самим toolCallId;
- close() зупиняє reconnect і всі таймери (перевір через vi.useFakeTimers).

ОБМЕЖЕННЯ: без залежностей; TypeScript strict (без any, крім unknown у payload);
без console.log (прийми опційний logger у options); код і коментарі англійською.
Віддай три файли повністю, без скорочень.
```

---

## Prompt B — Opus (ScenePatch core, in-repo via Claude Code)

```text
Прочитай wiki/ai-chat-integration-plan.md — це затверджений план AI-інтеграції.
Твоє завдання — Phase 0, ядро: чистий модуль ScenePatch БЕЗ жодного зв'язку із Zustand.

КОНТЕКСТ КОДУ (перевір сам перед початком):
- Доменні типи: lib/engine/types.ts — SceneRecord, TimelineStep (має стабільний id),
  BlockType, BlockData, SceneConnection.
- Валідатор історій: lib/story-validator.ts — переиспользуй, де можливо.
- Тест-ранер: vitest, запуск `pnpm test` (НІКОЛИ не npx jest). zod v4 вже в залежностях.

СТВОРИ:

1. lib/ai/scene-patch-types.ts — канонічні типи (це зафіксований контракт,
   інші пакети роботи вже на нього спираються, НЕ змінюй імена):

   export type ScenePatchOperation =
     | { op: 'insert_steps'; afterStepId: string | null; steps: TimelineStep[] } // null = на початок
     | { op: 'replace_step'; stepId: string; step: TimelineStep }
     | { op: 'delete_steps'; stepIds: string[] }
     | { op: 'update_scene_metadata'; updates: { name?: string; description?: string; tags?: string[] } }
     | { op: 'set_connection'; outputPort: string; targetSceneId: string | null; label?: string };

   export interface AiScenePatch {
     storyId: string;
     sceneId: string;
     expectedRevision: string;
     operations: ScenePatchOperation[];
     explanation: string;
   }

   Плюс zod-схеми для всього вищенаведеного (вхід від LLM — не довіряти нічому,
   включно з формою TimelineStep: звалідуй blockType проти реального BlockType
   і відповідність data типу блока хоча б структурно).

2. lib/ai/scene-revision.ts:
   computeSceneRevision(scene: SceneRecord): string
   Стабільний контент-хеш (FNV-1a або djb2 у hex) від детерміністичної серіалізації
   ПОЛІВ ЗМІСТУ: name, description, tags, timeline, connections, isStart, sceneState.
   НЕ включай updatedAt/createdAt/flowX/flowY. Серіалізація — з відсортованими
   ключами об'єктів (напиши stableStringify), щоб хеш не залежав від порядку ключів.

3. lib/ai/scene-patch.ts — три чисті функції (жодного імпорту zustand/stores/react):

   validateAiScenePatch(scene: SceneRecord, patch: AiScenePatch, ctx: PatchProjectContext):
     { ok: true; warnings: string[] } |
     { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED'; errors: string[] }
   де PatchProjectContext = { sceneIds: string[]; characterIds: string[];
     variableNames: string[]; assetIds: string[] }.
   Перевірки: expectedRevision збігається з computeSceneRevision(scene);
   storyId/sceneId збігаються; кожен stepId/afterStepId існує в timeline;
   нові кроки мають унікальні id (в межах результату); delete не лишає
   посилань goto на видалені label; set_connection.targetSceneId ∈ sceneIds або null;
   згадки characterId/variableName/assetId в data блоків існують у ctx;
   операції застосовні ПОСЛІДОВНО (валідність перевіряється на проміжних станах).

   applyAiScenePatch(scene: SceneRecord, patch: AiScenePatch): SceneRecord
   Повертає НОВИЙ об'єкт (без мутацій входу), операції застосовує послідовно.
   Кидати не можна — контракт: викликається лише після успішної validate;
   але додай захисний виняток InvalidPatchError на неможливі стани.

   describeAiScenePatch(scene: SceneRecord, patch: AiScenePatch): ScenePatchDescription
   export interface ScenePatchDescription {
     sceneId: string; sceneName: string;
     changes: Array<
       | { kind: 'step_added'; step: TimelineStep; index: number }
       | { kind: 'step_removed'; step: TimelineStep }
       | { kind: 'step_changed'; before: TimelineStep; after: TimelineStep }
       | { kind: 'metadata_changed'; field: 'name' | 'description' | 'tags'; before: unknown; after: unknown }
       | { kind: 'connection_changed'; outputPort: string; before: string | null; after: string | null }>;
     warnings: string[];
   }
   Це модель для UI-диффа — жодного тексту від LLM, тільки структуровані факти.

4. __tests__/unit/lib/ai-scene-patch.test.ts — вичерпні vitest-тести:
   - happy path кожної з 5 операцій;
   - STALE_REVISION при зміненій сцені;
   - неіснуючий stepId / afterStepId / targetSceneId / characterId → VALIDATION_FAILED
     з людською помилкою, що називає конкретний id;
   - дублікати id у insert_steps;
   - послідовність операцій: insert потім replace щойно вставленого кроку — валідно;
     delete потім replace видаленого — невалідно;
   - імутабельність: вхідний scene не змінився (deep-freeze у тесті);
   - computeSceneRevision: стабільний при перестановці ключів, змінюється при
     зміні timeline, НЕ змінюється при зміні updatedAt/flowX.

ЗАБОРОНЕНО: імпортувати stores/*, react, react-native у ці файли; змінювати
існуючі файли (крім додавання експортів, якщо конче треба — обґрунтуй).
Після реалізації запусти `pnpm test` і `pnpm check`, покажи результати.
```

---

## Prompt C — Sonnet (store adapter + rollback + read DTOs)

```text
Прочитай wiki/ai-chat-integration-plan.md і lib/ai/scene-patch.ts (ядро вже
реалізоване: validateAiScenePatch / applyAiScenePatch / describeAiScenePatch,
типи в lib/ai/scene-patch-types.ts, ревізія в lib/ai/scene-revision.ts).
Твоє завдання — тонкий адаптер між чистим ядром і Zustand-стором + read-DTO.

ФАКТИ ПРО СТОР (перевір сигнатури сам):
- Єдиний шлях запису сцени: useAppStore.getState().saveSceneRecord(record) —
  повний SceneRecord. Per-block екшенів НЕМАЄ.
- Snapshot-інфраструктура: createStorySnapshot(storyId, name, automatic) і
  restoreStorySnapshot(storyId, snapshotId) у stores/app-store-slices/snapshots-slice.ts.
- Undo-стека в сторі немає — rollback ТІЛЬКИ через снапшоти. Не намагайся
  інтегруватися з Plate-undo.

СТВОРИ:

1. lib/ai/scene-patch-adapter.ts:

   applyAiScenePatchToStore(patch: AiScenePatch): Promise<
     | { ok: true; snapshotId: string; description: ScenePatchDescription }
     | { ok: false; code: 'STALE_REVISION' | 'VALIDATION_FAILED' | 'SCENE_NOT_FOUND'; errors: string[] }>

   Порядок дій (строго):
   a) дістати SceneRecord зі стора; немає → SCENE_NOT_FOUND;
   b) зібрати PatchProjectContext з реального стора (id сцен історії, персонажів,
      імена змінних, id ассетів історії — подивись stores/app-store-slices/* і
      lib/story-image-library.ts, як їх дістати);
   c) validateAiScenePatch; помилка → повернути, НІЧОГО не змінюючи;
   d) createStorySnapshot(storyId, `AI: ${patch.explanation.slice(0, 40)}`, true)
      і запам'ятати snapshotId — це точка відкату;
   e) applyAiScenePatch → saveSceneRecord(нового запису);
   f) повернути ok з описом і snapshotId.

   rollbackAiPatch(storyId: string, snapshotId: string): Promise<boolean>
   — просто делегує restoreStorySnapshot.

2. lib/ai/story-context.ts — read-DTO для агента (НЕ сирий стан стора):

   export interface StorySummary { id: string; title: string; sceneCount: number;
     characterNames: string[]; variableNames: string[]; tags: string[]; }
   export interface SceneSummary { id: string; name: string; description: string;
     blockCount: number; connections: Array<{ outputPort: string; targetSceneId: string }>;
     isStart: boolean; }
   export interface AiSceneView extends SceneSummary {
     revision: string;                   // computeSceneRevision
     timeline: TimelineStep[];           // повний, для активної сцени
   }
   export interface AiStoryContext { story: StorySummary; activeScene: AiSceneView | null;
     nearbyScenes: SceneSummary[]; }     // nearby = сусіди по connections (1 хоп)

   buildAiStoryContext(storyId: string, activeSceneId: string | null): AiStoryContext | null
   Чиста функція від snapshot-даних стора: приймай дані аргументами
   (окрема обгортка дістає їх з useAppStore.getState()), щоб основна логіка
   тестувалась без Zustand.

3. Тести __tests__/unit/lib/ai-scene-patch-adapter.test.ts +
   __tests__/unit/lib/ai-story-context.test.ts (vitest, `pnpm test`;
   подивись, як існуючі store-тести в __tests__/unit/stores/* мокають стор,
   і зроби так само):
   - успішний apply: снапшот створено ДО запису, saveSceneRecord отримав
     результат applyAiScenePatch;
   - невалідний патч: снапшот НЕ створюється, стор НЕ змінюється;
   - STALE_REVISION наскрізь;
   - rollback відновлює снапшот;
   - buildAiStoryContext: nearbyScenes рахуються по connections, timeline
     є тільки в activeScene, revision збігається з computeSceneRevision.

ЗАБОРОНЕНО: змінювати ядро lib/ai/scene-patch*.ts; додавати нові екшени в стор;
чіпати Plate/редактор. Після завершення: `pnpm test`, `pnpm check`.
```

---

## Prompt D — Sonnet (UI: right rail + chat + diff preview + fake agent)

```text
Прочитай wiki/ai-chat-integration-plan.md. Ядро (lib/ai/scene-patch*.ts) і адаптер
(lib/ai/scene-patch-adapter.ts, lib/ai/story-context.ts) вже готові. Твоє завдання —
UI Phase 0: AI-панель у правій колонці документ-редактора, що працює з ФЕЙКОВИМ
агентом (без моста, без мережі).

ФАКТИ ПРО UI (перевір сам):
- Права колонка: components/document-editor/DocumentSceneEditor.tsx:~782 рендерить
  <DocumentInspectorPanel> — одну панель з ВЛАСНИМИ вкладками block|scene|issues
  (components/document-editor/DocumentInspectorPanel.tsx). ЇЇ НЕ ЧІПАТИ.
- Це Expo / React Native Web; стилі — як у сусідніх компонентах document-editor
  (подивись DocumentInspectorPanel.tsx і повтори патерни colorScheme/colors).
- Усі видимі користувачу рядки — через lib/translations.ts (подивись формат і
  додай ключі для обох мов).
- Приховування панелей: focusMode і isPhone уже враховуються в
  DocumentSceneEditor — нова панель має поводитись так само (desktop-only).

ЗРОБИ:

1. components/document-editor/DocumentRightRail.tsx — контейнер правої колонки
   з двома верхніми вкладками: "Inspector" | "AI". Inspector рендерить існуючий
   <DocumentInspectorPanel> без змін пропсів. Заміни пряме використання
   DocumentInspectorPanel у DocumentSceneEditor.tsx на DocumentRightRail
   (мінімальний дифф, та сама умова !isPhone && !focusMode). Ширина колонки —
   як у теперішнього інспектора; чат займає всю висоту вкладки.

2. stores/ai-chat-store.ts — ОКРЕМИЙ zustand-стор (НЕ в персистентному
   useAppStore, без persist middleware — історія чату не зберігається у Phase 0):
   повідомлення { id, role: 'user'|'assistant'|'system', text, createdAt },
   стан { status: 'idle'|'thinking'|'awaiting_confirmation', pendingPatch:
   { patch: AiScenePatch; description: ScenePatchDescription } | null,
   lastAppliedSnapshot: { storyId, snapshotId } | null }.

3. components/ai-chat/AiChatPanel.tsx (+ дрібні підкомпоненти в тій же теці):
   - список повідомлень (plain text, БЕЗ markdown-рендера) + поле вводу;
   - картка PatchPreviewCard: рендерить ScenePatchDescription СТРУКТУРОВАНО —
     згруповано за kind: додані кроки (зелена смужка, blockType + короткий зміст
     data), видалені (червона), змінені (жовта, before→after по зміненим полям),
     метадані і connections окремим блоком; warnings валідатора жовтим; кнопки
     "Застосувати" / "Відхилити";
   - після успішного apply — системне повідомлення з кнопкою
     "Відкотити AI-зміни" (rollbackAiPatch з lastAppliedSnapshot);
   - при помилці apply (STALE_REVISION тощо) — зрозуміле повідомлення в чаті.

4. lib/ai/fake-agent.ts — скриптований агент для Phase 0:
   async respond(userText: string, ctx: AiStoryContext): Promise<
     { kind: 'text'; text: string } | { kind: 'patch'; patch: AiScenePatch }>
   Поведінка: якщо текст містить "перепиши"/"rewrite" і є activeScene —
   згенерувати валідний AiScenePatch, який replace_step-ає перший dialogue-блок
   активної сцени (текст: той самий + " (переписано AI)") і insert_steps один
   новий dialogue після нього; expectedRevision взяти з ctx.activeScene.revision.
   Інакше — текстова відповідь-заглушка. Штучна затримка 600мс (імітація thinking).

5. Проводка: AiChatPanel бере activeStoryId/activeSceneId так само, як їх бере
   DocumentSceneEditor (подивись, звідки він їх отримує, і передай пропсами через
   DocumentRightRail) → buildAiStoryContext → fake-agent → якщо patch:
   validateAiScenePatch + describeAiScenePatch → pendingPatch → PatchPreviewCard →
   Apply викликає applyAiScenePatchToStore.

6. Тести (vitest + @testing-library/react, дивись __tests__/unit/components/*):
   - PatchPreviewCard рендерить всі kind-и changes;
   - Apply викликає applyAiScenePatchToStore і показує rollback-кнопку;
   - Reject очищає pendingPatch без викликів стора.

ПЕРЕВІРКА: запусти dev-сервер (pnpm dev:web), відкрий документ-редактор,
переконайся що: вкладки перемикаються, інспектор не зламався, сценарій
"перепиши діалоги" → diff → Apply → зміна видна в редакторі → Rollback повертає
як було. Зроби скриншоти до/після. `pnpm test`, `pnpm check` мають бути зелені.
ЗАБОРОНЕНО: чіпати DocumentInspectorPanel зсередини, лізти в Plate, додавати
мережеві виклики, markdown-бібліотеки.
```

---

## Prompt E — Opus (AI Bridge server)

```text
Прочитай wiki/ai-chat-integration-plan.md (архітектура) і файли протоколу
lib/ai/bridge-protocol.ts + lib/ai/bridge-client.ts (контракт уже зафіксований —
конверт BridgeEnvelope, типи повідомлень, коди помилок; ти реалізуєш СЕРВЕРНУ сторону).
Завдання — Phase 1: мінімальний локальний AI Bridge з одним провайдером (Claude Agent SDK).

СТВОРИ ПАКЕТ tools/ai-bridge/ (окремий Node-процес, TypeScript, tsx для запуску;
додай скрипт "ai-bridge": "tsx tools/ai-bridge/src/main.ts" у package.json):

1. Сервер: ws (додай залежність) на 127.0.0.1, порт з env AI_BRIDGE_PORT
   (дефолт 8787 — НЕ 3000 і НЕ 8081).
   Безпека (обов'язково, до будь-якої функціональності):
   - слухати ТІЛЬКИ 127.0.0.1;
   - при старті згенерувати випадковий токен (crypto.randomBytes(24).hex),
     надрукувати в консоль однією командою для копіювання; перше повідомлення
     session_start без валідного токена → error UNAUTHORIZED і закриття сокета;
   - перевірка заголовка Origin: дозволити тільки http://localhost:8081 і
     http://127.0.0.1:8081 (плюс env AI_BRIDGE_ALLOWED_ORIGINS через кому);
   - ліміт розміру вхідного повідомлення 1MB — більше → PROTOCOL_ERROR + закриття;
   - редагування секретів у логах (токен, api-ключі ніколи не логуються).

2. Сесія (одна активна на процес у Phase 1): sessionId = uuid; resumeSessionId
   з session_start відновлює сесію, якщо вона жива (агент зберігається між
   reconnect-ами клієнта); друга паралельна сесія → PROVIDER_UNAVAILABLE.

3. Провайдер Claude: @anthropic-ai/claude-agent-sdk, query() зі streaming.
   - системний промпт: файл tools/ai-bridge/src/system-prompt.md — опиши агенту
     доменну модель (SceneRecord, TimelineStep, 5 операцій AiScenePatch, правило
     expectedRevision: "перед мутацією завжди читай сцену, бери revision звідти;
     при STALE_REVISION перечитай і повтори");
   - стрімінг текстових шматків → assistant_delta; завершення → assistant_done;
   - interrupt від клієнта → скасування поточної генерації (AbortController) →
     assistant_done зі stopReason 'interrupted';
   - таймаут ходу 120с; ліміт tool-викликів за хід: 15, перевищення →
     assistant_done + error PROVIDER_UNAVAILABLE з поясненням.

4. Тули агента — через createSdkMcpServer/tool() з SDK. Кожен тул НЕ виконується
   на мості: хендлер пересилає клієнту tool_call через WS і чекає tool_result
   з тим самим toolCallId (Promise-реєстр, таймаут 30с → помилка тула агенту).
   Allowlist Phase 1-2 (zod-схеми входів пиши строго):
   - get_story_overview {}                     → StorySummary
   - list_scenes {}                            → SceneSummary[]
   - get_scene { sceneId }                     → AiSceneView (з revision)
   - propose_scene_patch { patch: AiScenePatch } → { accepted: boolean } —
     ВАЖЛИВО: цей тул НЕ застосовує патч; клієнт показує diff користувачу,
     а результат тула повідомляє агенту, прийняв користувач патч чи відхилив
     (може чекати довго — таймаут для цього тула 10 хвилин).
   ЖОДНИХ інших тулів: ні shell, ні filesystem, ні мережі. Це allowlist.

5. Життєвий цикл: перед стартом перевір наявність Claude Code CLI/автентифікації
   (SDK це вимагає) і, якщо ні — зрозуміла інструкція в консоль; graceful shutdown
   по SIGINT (закрити сесію агента і сокети).

6. Тести (vitest, у тому ж репо): протокольний шар моста без реального SDK —
   мокни провайдера інтерфейсом { send(text): AsyncIterable<event>; abort() }:
   - handshake з токеном / без → UNAUTHORIZED;
   - Origin-перевірка;
   - tool_call→tool_result кореляція по toolCallId, таймаут тула;
   - interrupt перериває стрім;
   - resume після реконекту зберігає sessionId.
   Провайдера з реальним SDK винеси за інтерфейс AgentProvider, щоб мок був чесним.

7. README tools/ai-bridge/README.md: як запустити, як передати токен у веб-апку
   (env EXPO_PUBLIC_AI_BRIDGE_TOKEN або поле в UI), обмеження безпеки, траблшутінг.

Після реалізації: `pnpm test`, `pnpm check`; запусти міст і покажи лог старту
з токеном (сам токен у звіті замаж). НЕ додавай image-тули, MCP-сервер як окремий
процес, других провайдерів — це пізніші фази.
```
