# UX Refresh UI Specification

## Objective

Improve the first-run and returning-user experience without changing story data, persistence, or the Lego editing model.

## Design Contract

- Navigation starts from a calm library dashboard: hero copy, primary editor action, secondary settings action, and lightweight library stats.
- Story cards use elevated surfaces, larger cover art, stronger titles, short descriptions, author metadata, and a clear play affordance.
- Empty and loading states must explain what is happening and give the next useful action.
- Layout scales from one column on mobile to two or three columns on wider web screens.
- Motion is progressive enhancement only: web route transitions use the browser View Transition API when available and fall back to instant navigation.
- Reduced-motion users receive no route transition animation.

## Implementation Boundaries

- Keep NativeWind `active:` modifiers off `Pressable`.
- Keep state access through `useAppStore()` and existing story hooks.
- Do not introduce bitmap assets until a concrete project-bound asset is required.
- Do not run Vercel metric-backed optimization unless the project is linked and production metrics are available.
