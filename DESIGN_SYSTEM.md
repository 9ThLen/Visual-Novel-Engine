# Design System

The app uses a token-driven theme generated from `constants/theme-colors.json` and consumed through NativeWind, runtime variables, and shared UI helpers.

## Current Sources

- `constants/theme-colors.json` stores light and dark OKLCH color tokens.
- `lib/theme-variables.ts` maps tokens into runtime variables.
- `lib/theme-nativewind.ts` bridges theme colors into NativeWind usage.
- `theme.config.js` and `tailwind.config.js` expose tokens to styling.
- `stores/theme-store.ts` stores the selected theme.

## Core Tokens

- Base surfaces: `background`, `surface`, `surface-elevated`, `surface-1`, `surface-2`, `surface-3`.
- Text: `foreground`, `foreground-secondary`, `foreground-tertiary`, `foreground-disabled`, `foreground-inverse`.
- State: `success`, `warning`, `danger`, `error`, `info` and their background variants.
- Interaction: `hover`, `pressed`, `focus`, `selected`.
- Editor: `editor-canvas`, `editor-grid`, `editor-toolbar`, `editor-panel`, `editor-ruler`.
- Lego blocks: `lego-dialogue`, `lego-character`, `lego-background`, `lego-audio`, `lego-fx`, `lego-choice`, `lego-condition`, `lego-variable`, `lego-loop`, `lego-transition`.

## Maintenance Rules

- Add new colors to `constants/theme-colors.json` first.
- Keep light and dark values paired for every token.
- Add browser-safe fallback colors before `oklch()` when writing raw CSS.
- Do not duplicate token values in component files.
- Prefer shared UI components and theme helpers over one-off inline colors.
