# AI assistant release checklist

## Required automated evidence

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm test:ai-e2e`
- [ ] Standalone bridge package starts outside the repository.
- [ ] Browser bundle contains no provider, image API, or bridge pairing secrets.
- [ ] Codex either passes the documented zero-data-access security gate or is visibly unavailable.

## Deterministic browser scenarios

- [ ] Valid pairing reaches authenticated `Connected`.
- [ ] Invalid token remains unauthorized without a reconnect loop; composer stays disabled.
- [ ] A second tab receives stable session-active guidance.
- [ ] Streamed response returns the composer to idle.
- [ ] Stop interrupts a long turn.
- [ ] Clear chat receives provider reset acknowledgement before clearing the transcript.
- [ ] Story-scoped pending proposals do not cross stories.
- [ ] Pending generated images survive reload and import exactly once.
- [ ] Undo after a manual edit requires explicit cancel/force confirmation.

The first six are browser-CI coverage. The final three remain required release
acceptance and are covered by focused store/component tests until stable
browser fixtures for deterministic story mutations and binary images are added.

## Opt-in live evidence

Run from a machine where the selected CLI is installed and authenticated:

```text
AI_E2E_PROVIDER=claude pnpm test:ai-live
AI_E2E_PROVIDER=codex pnpm test:ai-live
```

The smoke sends one short Ukrainian, read-only turn. It must not mutate the
story or request an image. Save only provider, CLI version, date, and pass/fail;
never save pairing tokens, credentials, prompts, replies, or story text.

- [ ] Recent Claude smoke: date/version/result recorded.
- [ ] Recent Codex smoke: date/version/result recorded, or Codex recorded as disabled by its security gate.
