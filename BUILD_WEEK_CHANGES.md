# OpenAI Build Week Contribution

This document distinguishes the pre-existing Visual Novel Engine from the AI Assistant work added during the OpenAI Build Week submission period.

## Submission-period boundary

- Submission period start: July 13, 2026 at 9:00 AM Pacific Time.
- First AI Assistant implementation commit: `c55e6d0b` — July 13, 2026 at 8:42 PM Europe/Warsaw.
- Current implementation branch: `ai-chat-attachments`.
- Repository: `https://github.com/9ThLen/Visual-Novel-Engine`.

The project existed before Build Week. Only the work listed below should be presented as the Build Week contribution.

## What was added

Visual Novel Engine gained an AI-assisted scene editing workflow:

1. The assistant receives the active story and scene context.
2. It can propose a validated scene patch or change set.
3. The editor presents the proposed change before mutation.
4. The creator can apply or reject the proposal.
5. Applied changes create a recoverable snapshot and can be rolled back.
6. Revision checks prevent stale proposals from silently overwriting newer edits.
7. Permission and bridge boundaries restrict which AI actions may run automatically.
8. The bridge supports a local browser-to-provider workflow with explicit pairing and provider configuration.

The latest extension also adds attachment handling and AI settings:

- image, PDF, and text attachments;
- server-side attachment validation;
- untrusted-attachment mode with default-deny permissions;
- AI provider and bridge settings;
- persistence and IndexedDB coverage for attachment state.

## Commit evidence

| Commit | Date | Contribution |
| --- | --- | --- |
| `c55e6d0b` | July 13, 2026 | Initial `AiChatPanel`, scene context, scene patch validation, Apply/Reject/Rollback flow, bridge client, AI store, and unit-test foundation. |
| `d72bba46` | July 15, 2026 | Continued scene execution and persistence integration for the AI-assisted editor path. |
| `0905b25e` | July 15, 2026 | Windows bridge startup fixes and bridge documentation. |
| `1b7e0015` | July 16, 2026 | Continued scene execution and persistence stabilization. |
| `bdcbd94a` | July 16, 2026 | Continued scene execution and persistence stabilization. |
| `4cdd6698` | July 18, 2026 | Scene editing architecture and app persistence improvements supporting the AI workflow. |
| `b749acc3` | July 18, 2026 | Attachments, AI settings, server-side validation, permission hardening, and expanded tests. |

## Relevant implementation areas

- `components/ai-chat/AiChatPanel.tsx` — user-facing assistant flow.
- `components/ai-chat/PatchPreviewCard.tsx` — proposal review UI.
- `lib/ai/scene-patch.ts` — patch validation and descriptions.
- `lib/ai/scene-patch-adapter.ts` — apply and rollback integration.
- `lib/ai/change-set.ts` — structured multi-change proposals.
- `lib/ai/applied-change-journal.ts` — applied-change tracking.
- `lib/ai/scene-revision.ts` — stale-revision protection.
- `lib/ai/permissions.ts` — AI permission policy.
- `lib/bridge-client.ts` and `lib/bridge-protocol.ts` — local bridge protocol.
- `tools/ai-bridge/` — Claude, OpenAI, and fail-closed Codex bridge providers.
- `e2e/ai/` — browser coverage for pairing, proposals, reset, rollback safety, and attachments.

## Evidence still required before submission

These fields must be completed from the actual primary Codex build thread and live validation. Do not infer or fabricate them from commit history.

- Primary Codex `/feedback` Session ID: `TODO`
- GPT-5.6 model or Codex configuration used: `TODO`
- Date and time of the GPT-5.6-assisted build step: `TODO`
- Demo URL: `TODO`
- Public YouTube demo URL: `TODO`

The README and submission description must explain which work Codex accelerated, which product, engineering, and design decisions were made by the author, and how GPT-5.6 contributed to the final result.

## GitHub attribution

The human author remains the Git author. A GitHub `Co-authored-by` trailer for Codex is not required by the Build Week rules and is not added here because there is no verified official Codex GitHub identity to reference. Codex usage will be documented through the README, this evidence file, the primary `/feedback` Session ID, and the submission narrative.

## Validation commands

```text
pnpm check
pnpm test
pnpm lint
pnpm test:ai-e2e
```

Validation completed on July 19, 2026:

- `pnpm check` passed.
- `pnpm test` passed: 1,273 tests in 166 files.
- `pnpm lint` passed with 6 pre-existing hook/style warnings and 0 errors.
- `pnpm test:ai-e2e` passed: 7 tests, including pairing, unauthorized access, session isolation, stop, story scoping, image persistence, and manual-edit rollback protection.

The browser tests use the real Studio → story → editor → AI route and run Expo in offline mode so the demo path does not depend on registry/network availability.

The final demo must show the complete flow: prompt → proposal → review → apply → preview → rollback.
