# Wave 0 Summary

Status: completed.

## Completed

- Replaced the public audio block data contract with explicit `mode: 'track' | 'silence'`.
- Added seconds-based `fadeIn`/`fadeOut`, music `boundTo`, and optional `autoFadeAfter`.
- Updated step factory defaults and document inline audio parts.
- Changed `crossFade` interfaces to accept `fadeInMs` and `fadeOutMs`.
- Fixed `AudioPlayerService.crossFade()` so the old track fades out before the new track fades in.

## Verification

- `corepack pnpm run check` passed after the wave was integrated with later waves.
- Crossfade behavior is covered by `__tests__/unit/lib/audio-player-service.test.ts`.
