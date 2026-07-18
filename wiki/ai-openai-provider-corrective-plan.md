# План виправлень AI-провайдерів

Статус: готовий до реалізації  
Дата аудиту: 2026-07-18  
Базовий план: `wiki/ai-openai-providers-plan.md` v1.5 + corrective section v1.6

## 1. Мета

Довести інтеграцію Claude + OpenAI API до релізного стану, не видаючи
fail-closed каркас Codex Beta за завершену інтеграцію.

OpenAI API можна випускати після пакетів R3a, R0-R2 і R3b. Codex Beta залишається
технічно заблокованим і стає доступним лише після окремого пакета R4.

## 2. Перевірений базовий стан

- TypeScript typecheck проходить.
- Повний Vitest: 163 файли / 1248 тестів проходять.
- 27 тестів `OpenAiProvider` проходять.
- Standalone bridge package збирається і запускається в поточному Windows
  середовищі.
- Виправлення закриття вкладеного response-stream уже є в dirty working tree.
- Abort-listener у retry delay уже знімається на успішному шляху.
- Живого smoke-тесту з реальним `OPENAI_API_KEY` ще немає.
- Codex hardening зараз завжди повертає `supported: false`; це безпечно, але це
  не завершений Codex-провайдер.

## 3. Підтверджені дефекти й прогалини

| Пріоритет | Проблема | Наслідок |
|---|---|---|
| P0 | `bridge.call()` не змагається з abort signal | Stop або turn timeout може чекати app/image tool до 600 секунд |
| P0 | Ліміт історії не гарантується для одного великого turn | Наступний Responses-запит може перевищити запланований memory/request budget |
| P0 | Немає перевірки повного request budget перед кожним API-викликом | Великий поточний tool-loop обходить history cap |
| P0 | Missing/non-array `response.output` приймається як порожній успіх | Пошкоджена відповідь може завершити turn без помилки |
| P1 | OpenAI-помилки згортаються у `PROVIDER_ERROR` | UI не розрізняє auth, rate limit, timeout, refusal та malformed response |
| P1 | Refusal SSE не обробляється | Користувач може отримати порожню відповідь |
| P1 | Немає usage/request-id diagnostics і session token budget | Важко діагностувати витрати та runaway-сесію |
| P2 | `abortableDelay()` не перевіряє вже aborted signal | Можлива затримка скасування перед повторним fetch |
| P2 | Package-тест залежить від першого `tar` у PATH | Тест непереносимий між bsdtar і GNU tar на Windows |
| P2 | Немає opt-in live OpenAI smoke | Fake transport не доводить сумісність із живим Responses API |
| P0 Codex | Сервер перевіряє лише наявність consent-об'єкта | Майбутнє увімкнення capability може прийняти невалідний consent |
| P1 Codex | UI пропонує Codex, який гарантовано fail-closed | Користувач проходить setup, який не може завершитися |

## 4. Пакет R3a — portable package test

Залежності: немає. Виконується першим, щоб release harness не залежав від того,
який `tar` перший у PATH.

Файл: `__tests__/unit/ai-bridge-package.test.ts`.

Завдання:

1. Прибрати прямий виклик системного `tar`.
2. Встановлювати локально створений tarball у тимчасову папку через наявний
   package-manager toolchain, без мережі й без нової runtime-залежності.
3. Перевіряти self-contained bundle, `--version`, `--help` і fail-closed Codex
   startup поза repository cwd.

Критерій приймання: тест детерміновано проходить незалежно від bsdtar/GNU tar
у PATH і може бути надійним gate для наступних пакетів.

## 5. Пакет R0 — cleanup, гарантований Stop і release-safe Codex closure

Залежності: немає.  
Власність: bridge provider/server.

Файли:

- `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/server.ts`
- `components/ai-chat/ConnectionCard.tsx`
- `lib/ai/codex-beta-consent.ts`
- `__tests__/unit/ai-bridge-openai-provider.test.ts`
- `__tests__/unit/ai-bridge-server.test.ts`

Завдання:

1. Зберегти наявний `finally { await stream.return(...) }` і тест, який доводить
   виклик `ReadableStream.cancel()` після виходу consumer посеред turn.
2. У `abortableDelay()` негайно відхиляти Promise, якщо `signal.aborted` уже
   дорівнює `true`.
3. Знімати abort-listener на всіх завершальних шляхах delay.
4. Обгорнути очікування `BridgeToolRuntime.call()` у локальний abort race:
   - abort завершує provider turn негайно;
   - пізній результат не додається в history;
   - continuation request не відправляється;
   - пізній resolve/reject спостерігається і не створює unhandled rejection.
5. Не додавати tool-cancel повідомлення в протокол у цьому пакеті. Фізичне
   скасування вже показаного browser confirmation лишається окремим scope.
6. У сервері розрізнити `user interrupt` і `turn timeout`, а не зберігати обидва
   стани лише в одному boolean `interrupted`.
7. Поки `getCodexHardeningCapability().supported === false`, приховати Codex у
   setup UI або показувати його явно недоступним без активної команди/CTA.
8. Замінити loose `Record`-перевірку `codexBetaConsent` на
   `validateCodexBetaConsent()` з актуальною capability identity. Сервер і надалі
   fail-closed; це захисна перевірка, а не увімкнення Codex.

Обов'язкові тести:

- break consumer звільняє response reader;
- abort до встановлення retry listener не робить другого fetch;
- Stop під час Promise, який ніколи не завершується, повертає
  `assistant_done: interrupted` без очікування tool timeout;
- late resolve і late reject ігноруються без continuation/history mutation;
- turn timeout також завершує provider prompt-но і позначається як timeout, а
  не як натискання Stop.
- unsupported Codex не веде користувача у гарантовано невдалий setup;
- malformed або stale Codex consent відхиляється сервером.

Критерій приймання: після Stop або turn timeout сервер завершує turn за
обмежений тестовий інтервал незалежно від стану app/image tool.

## 6. Пакет R1 — бюджети та валідація Responses

Залежності: R0.  
Власність: `OpenAiProvider`.

Файли:

- `tools/ai-bridge/src/openai-provider.ts`
- `__tests__/unit/ai-bridge-openai-provider.test.ts`

Завдання:

1. Перед кожним fetch рахувати hard UTF-8 byte budget для:
   - `instructions`;
   - serialized tools;
   - committed history;
   - поточного незавершеного turn.
2. Не додавати новий tokenizer dependency. Hard safety boundary — реальні
   UTF-8 bytes; фактичні token counts надходять з `response.usage` у R2.
3. Додати обмежений `max_output_tokens` до кожного Responses request.
4. Компактувати history лише по межах завершених turn. Не розділяти reasoning,
   function call і function output.
5. Якщо один новий turn не вміщується, атомарно відхилити його та зберегти
   попередню history без змін.
6. Валідувати terminal response:
   - `response.output` обов'язково є масивом;
   - terminal status відповідає terminal event;
   - reasoning item, потрібний для replay, містить `encrypted_content`;
   - malformed non-sentinel SSE JSON є помилкою, а не silently ignored event.
7. Вимірювати SSE event cap за UTF-8 bytes. Загальний stream cap лишається
   окремою межею.
8. Обробити refusal:
   - якщо API надає безпечний refusal text — показати його та завершити зі
     `stopReason: refusal`;
   - якщо тексту немає — повернути структурований `OPENAI_REFUSAL`;
   - не дозволяти blank successful turn.
9. Обробити `response.incomplete` як штатний terminal state, якщо вже отримано
   непорожній текст: завершити з `stopReason: incomplete` і показати локалізоване
   попередження, що відповідь обрізано. `OPENAI_RESPONSE_INCOMPLETE` повертати
   лише коли корисного тексту немає або terminal payload невалідний.

Обов'язкові тести:

- request budget перевіряється перед кожним round;
- compaction видаляє лише цілі старі turns;
- oversized single turn не отруює history;
- missing output, wrong output type, invalid terminal status і malformed SSE;
- refusal з текстом і без тексту;
- incomplete з частковим текстом завершується без провалу turn, а incomplete без
  тексту повертає typed failure;
- multibyte SSE cap використовує bytes, не JavaScript string length;
- instructions входять у request budget, але не в history.

Критерій приймання: жоден API-запит і жодна committed history не перевищує
зафіксовані hard limits.

## 7. Пакет R2 — структуровані помилки й безпечна діагностика

Залежності: R1.  
Власність: provider → server → UI.

Файли:

- `tools/ai-bridge/src/provider.ts`
- `tools/ai-bridge/src/openai-provider.ts`
- `tools/ai-bridge/src/server.ts`
- `components/ai-chat/AiChatPanel.tsx`
- `lib/translations.ts`
- відповідні provider/server/UI tests

Завдання:

1. Додати окремий typed provider failure. Не використовувати
   `BridgeToolError` для transport/provider failures.
2. Зафіксувати closed reason union за явною таблицею всіх throw-сайтів:
   - `OPENAI_API_AUTH_FAILED`;
   - `OPENAI_API_FORBIDDEN`;
   - `OPENAI_RATE_LIMITED`;
   - `OPENAI_MODEL_UNAVAILABLE`;
   - `OPENAI_API_TIMEOUT`;
   - `OPENAI_RESPONSE_INCOMPLETE`;
   - `OPENAI_MALFORMED_RESPONSE`;
   - `OPENAI_REFUSAL`;
   - `OPENAI_STREAM_TOO_LARGE`;
   - `OPENAI_STREAM_EVENT_TOO_LARGE`;
   - `OPENAI_STREAM_INCOMPLETE`;
   - `OPENAI_API_FAILED`;
   - `OPENAI_ROUND_LIMIT`;
   - `OPENAI_PARALLEL_TOOL_CALLS`;
   - `OPENAI_MALFORMED_FUNCTION_CALL`;
   - `OPENAI_NON_REPLAYABLE_REASONING`;
   - generic `PROVIDER_ERROR` fallback.
   Не вигадувати reason без відповідного producer-сайту. Кожен plain
   `throw new Error(...)` у провайдері або замінити typed failure, або явно
   мапити в цій таблиці.
3. Сервер проносить safe reason у `details.reason`, але не response body,
   prompt, tool output чи credential material.
4. UI локалізує відомі runtime reasons українською та англійською; невідомий
   reason використовує generic fallback.
5. З terminal response читати лише privacy-safe diagnostics:
   - model;
   - response/request id;
   - duration;
   - input/output/total tokens.
6. Не логувати prompt, story context, function output, API key або розраховану
   грошову вартість.
7. Додати опційний `OPENAI_SESSION_TOKEN_BUDGET`. Накопичувати фактичний
   `usage.total_tokens`, відмовляти перед наступним turn після вичерпання та
   скидати лічильник через `conversation_reset`. Це межа між turn-ами: один
   поточний turn може перевищити залишок; усередині turn його стримують
   `MAX_ROUNDS`, request byte budget і `max_output_tokens`.

Обов'язкові тести:

- точний reason для 401/403/404/429/timeout/incomplete/malformed/refusal;
- Stop не мапиться на timeout;
- logs/envelopes/UI не містять adversarial API body або ключ;
- usage diagnostics містить лише allowlisted поля;
- session budget exhaustion і reset;
- EN/UK copy для всіх reason та generic fallback.
- guard-тест доводить, що у провайдері не лишилося plain throw-сайтів із
  довільним повідомленням поза closed reason union.

Критерій приймання: користувач отримує локалізовану дію, а технічна діагностика
не розкриває story content чи секрети.

## 8. Пакет R3b — live smoke

Залежності: R2.  
Власність: packaging/release evidence.

Файли:

- новий opt-in smoke script у `tools/ai-bridge/`
- `tools/ai-bridge/README.md`
- `wiki/ai-chat-release-checklist.md`

Завдання:

1. Додати opt-in smoke, який запускається лише за явним env flag і наявним
   `OPENAI_API_KEY`.
2. Smoke виконує:
   - один короткий text turn;
   - один нешкідливий VNE model-tool round;
   - Stop або timeout cleanup;
   - conversation reset.
3. Smoke не друкує key, prompt або story data. Результат містить лише дату,
   bridge/protocol version, model, response id та pass/fail.
4. Задокументувати результат у release checklist.

Критерій приймання: живий OpenAI smoke має зафіксований зелений результат.

## 9. Пакет R4 — Codex Beta як окремий security unit

Залежності: не блокує реліз Claude + OpenAI API.  
Правило: усі підпункти зливаються разом; часткове увімкнення заборонене.

Негайне UI-закриття, серверний fail-closed guard і shared consent validator
належать до R0. R4 містить лише повне безпечне ввімкнення Beta; його не можна
частково активувати.

Повна реалізація перед Beta:

- allowlist exact executable/version/platform profile;
- keyring-only authentication;
- ізольовані workspace, `CODEX_HOME` та environment allowlist;
- автоматичні sandbox probes на read/write/network/process/tool access;
- asynchronous single-flight preflight;
- waiter cleanup, child termination, timeout, TTL cache і per-connection rate
  limit;
- versioned consent UI з повторною згодою після CLI/policy/disclosure change;
- resume revalidation;
- browser E2E і live smoke для кожного allowlisted profile;
- жодного `continue anyway`.

Критерій приймання: змінений браузер або stale consent не може запустити Codex,
а невідомий CLI/platform profile завжди залишається заблокованим.

## 10. Порядок виконання

```text
R3a -> R0 -> R1 -> R2 -> R3b -> OpenAI API release gate

R4 -> окремий security review -> Codex Beta release gate
```

R3a виконується першим як незалежний repair тестового harness. R0-R2 і R3b
йдуть послідовно. R4 можна планувати паралельно, але не вмикати частково.

## 11. Фінальні release gates

### Claude + OpenAI API

- R3a, R0-R2 і R3b завершені;
- typecheck чистий;
- focused provider/server/package tests зелені;
- повний Vitest зелений;
- bridge bundle self-contained;
- `git diff --check` чистий;
- живий OpenAI smoke зелений і записаний у checklist;
- API key відсутній у browser bundle, persistence, protocol і logs.

### Codex Beta

- усі вимоги R4 завершені одним security unit;
- consent перевіряється браузером і сервером;
- hardening підтверджений автоматичними probes для exact profile;
- live smoke зелений для кожного allowlisted profile;
- інакше Codex лишається видимо недоступним і технічно fail-closed.

## 12. Межі змін

- Не додавати OpenAI SDK або tokenizer dependency без нової доведеної потреби.
- Не зберігати API key у браузері.
- Не додавати remote/LAN bridge, TLS чи multi-user sessions.
- Не змішувати bridge-виправлення з наявними незв'язаними editor/showcase
  змінами у working tree.
- Не створювати коміт автоматично без окремого запиту користувача.
