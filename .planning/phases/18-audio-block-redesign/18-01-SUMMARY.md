# Wave 1 Summary

Status: completed.

## Completed

- Added `lib/audio-block-migration.ts` for shared legacy audio block migration.
- Migrated canonical scene records in persisted app state and merge hydration.
- Migrated bundled story sync/upsert payloads.
- Migrated import validation in `story-hooks.ts`.
- Added migration on sidecar scene-record storage boundaries.
- Preserved legacy `action` fixtures only in migration tests and compatibility validation.

## Verification

- Added `__tests__/unit/lib/audio-block-migration.test.ts`.
- Extended app-store and scene-record storage tests for legacy audio block migration.
