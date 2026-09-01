# Build helper

A local service for native builds. The app never runs a toolchain and never
holds a signing credential; it submits a frozen release and follows it. The EAS
builder stages the player, checks the upload archive, submits, polls, cancels the
remote job when asked, downloads the result and verifies its bytes before the
browser saves them.

```bash
pnpm build-helper --eas-project-id <the-novel-eas-project-uuid> --allow-origin http://localhost:8081
```

It prints a port and a pairing token. The token is fresh per run unless `--token`
is given, so a helper left running is not a standing open door on the machine.

## Why its own protocol

It reuses the AI bridge's *pairing* model — a Node process on loopback, an exact
origin, a token compared in constant time — and none of its protocol. Four
reasons, each checkable rather than a matter of taste:

- `lib/bridge-protocol.ts` caps a message at 1 MB (8 MB for images). A release is
  measured in hundreds.
- `tools/ai-bridge/src/server.ts` closes the socket on any binary frame.
- It rejects unknown client message types outright.
- `tool_call` runs helper → browser. A build RPC runs the other way.

Builds are also not an AI tool. Putting a paid, credential-holding operation
behind a surface designed to be driven by a language model would be a category
error, whatever the transport could carry.

## The contract

```
POST /build-inputs/:requestId       the .vnerelease, streamed
  x-vne-build-token: <token>
  Origin: <one of --allow-origin>
  → written to <requestId>.part, SHA-256 computed as it arrives
  → renamed only once complete and matching
  → 404 if no such request was submitted
  → 409 if the bytes are not the ones the request declared
  → 413 above the upload limit

GET /build-artifacts/:requestId     the verified APK/AAB
  x-vne-build-token: <token>
  → available only while the job is succeeded and before expiresAt
  → SHA-256 is checked again before bytes are sent

WebSocket (same port)
  client → helper   hello | submit | status | cancel | retry
  helper → client   ready | progress | completed | failed | error
```

Stated rules, not implied ones:

- **`requestId` is an idempotency key.** Submitting it twice rejoins the running
  job. Submitting it with a *different* payload is refused — it is not a race to
  resolve, and answering it with the first job's artifact would attribute a build
  to a release it was never made from.
- **Uploads are capped** (`BUILD_LIMITS.maxUploadBytes`). Over the limit the
  helper stops reading and drops the connection rather than draining it politely.
- **Abandoned `.part` files are swept** at startup and by age. A closed laptop
  mid-upload is the normal case, not the exception.
- **Origin and token are checked** on the socket, upload, and artifact download.
- **The archive never travels over the socket.** It would need the whole release
  in memory twice, and the message cap exists so that cannot happen by accident.

## Job states

```
queued → staging → submitted → building → verifying → succeeded
                                                    ↘ failed | cancelled
succeeded → expired
failed | cancelled | expired → (retry) → queued
```

Persisted to disk under `--work-dir`, so a browser reload rejoins a running build
instead of paying for a second one. That is the reason this is a service with
state rather than an adapter that forwards calls.

`verifying` is a state rather than a step inside `building`: the helper re-checks
what came back before offering it, and a build that produced something unusable
must fail differently from one that never produced anything.

Artifacts carry a stated `expiresAt`. When it passes, the state becomes `expired`
and the bytes are removed — a link that quietly stops working is worse than one
that says when it will.

## Builders

`Builder` is the seam. Two exist:

- `FakeBuilder` — does everything except build. R7's acceptance runs against it,
  because a reload, a cancel, a retry and a resubmitted key are all answerable
  without a cloud account, and requiring one would mean the kernel could not be
  tested until R9 shipped.
- `EasBuilder` — the CLI default. Readiness checks the immutable project UUID,
  `eas --version` and `eas whoami` before an upload is accepted. It then stages,
  runs `eas build:inspect`, submits with `--no-wait`, follows `build:view`, and
  downloads the HTTPS artifact. The helper persists a project/novel identity
  binding, so one EAS project cannot silently become two applications.

`github-actions` and `local` plug into the same interface when they are wanted.

## One-time EAS setup

Install EAS CLI, sign in, create a separate EAS project for this novel, and
configure its Android signing credentials before starting the helper. Pass that
project's UUID as `--eas-project-id`. The build itself runs non-interactively
with `--freeze-credentials`: a browser click may use an existing signing key,
but must never mint or replace one without the author seeing it. Expo documents
the current commands in its [EAS CLI reference](https://docs.expo.dev/eas/cli/)
and [Android signing guide](https://docs.expo.dev/deploy/build-project/).

Keep `.vne-builds/eas-identities/`. It is not a signing key, but it is the local
record that prevents reusing one EAS project for a different novel. EAS-managed
credentials remain on EAS; the browser receives neither them nor an Expo token.

## Logs

Build output is sanitized before it reaches a browser
(`src/log-sanitizer.ts`): accounts, project identifiers, build URLs, signing
fingerprints, credentials printed with their values, and absolute paths. Each
pattern carries what it is for, and `describeLogSanitizer()` reads the set back,
because a bare regex in a security filter is unreviewable.

It is a filter, not a guarantee. It cannot know every shape a future toolchain
will print, which is why a builder reports through the helper rather than writing
to the client itself — a builder that could bypass this would make it decorative.
