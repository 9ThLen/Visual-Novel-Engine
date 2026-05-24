# Tailwind Migration — 2026-05-12

## Scope
Конвертація inline-стилів (`style={{}}`) на Tailwind className у високонавантажених компонентах.

## Files Modified

### `app/editor.tsx`
- 310 → 283 lines
- Story card: `style={{ backgroundColor: colors.surface, borderRadius: 12, ... }}` → `className="bg-surface rounded-xl p-3 mb-3 border border-border"`
- Header row: inline flex → `className="flex-row justify-between items-center mb-5"`
- Grid sizing: inline width % → `className="w-1/3 px-1"` / `cn('gap-3', isWebDesktop ? 'flex-row flex-wrap' : 'flex-col')`
- Add story form: all inline → Tailwind card pattern

### `components/scene-editor/EditTab.tsx`
- 214 → 165 lines
- Dialogue box, choices, scene list — all converted
- Dynamic `colors.muted` в `placeholderTextColor` залишився (native prop, не CSS)
- `cn()` для conditional classes: `cn('px-2 py-1.5', newChoiceTarget === item ? 'bg-primary' : 'bg-transparent')`

### `components/block-editor/BlockCard.tsx`
- 207 lines (unchanged line count)
- `style={{ position: 'relative' }}` → `className="relative"`
- `style={{ flex: 1, paddingVertical: 8, paddingRight: 8 }}` → `className="flex-1 py-2 pr-2"`
- **Shadow/elevation залишені inline** — RN-only API, Tailwind не підтримує

### `components/story-reader-responsive.tsx`
- 665 → 640 lines
- Main container: `style={{ flex: 1, backgroundColor: '#000' }}` → `className="flex-1 bg-black"`
- Top controls: `style={{ position: 'absolute', top: 48, right: 16, ... }}` → `className="absolute right-4 top-12 flex-row gap-2"`
- Dialogue box: `style={{ margin: 12, borderRadius: 16, ... }}` → `className="mx-3 mb-7 rounded-2xl border overflow-hidden"` + inline `backgroundColor` (dynamic `colors.dialogueBg`)
- Page dots: `style={{ flexDirection: 'row', gap: 4 }}` → `className="flex-row gap-1"`
- Skip button: all style → `cn` + conditional

## Decision Log

| Case | Approach |
|---|---|
| Animated values (Animated.View) | **Inline залишено** — style prop required |
| Dynamic colors from `useColors()` | **Inline `style={{ backgroundColor: colors.X }}`** — runtime value |
| `Platform.select` margins | **Inline** — conditional platform logic |
| Shadow / elevation | **Inline** — RN-only, no Tailwind equivalent |
| `StyleSheet.absoluteFillObject` | **Inline** — more efficient than manual 4 props |
| Static layout (flex, gap, padding, margin, border, rounded, bg, text) | **Tailwind className** |
| Conditional + static combos | **`cn()` utility** from `@/lib/utils` |

## Test Results
- 218/218 tests passed ✅
- 0 failures
- Duration: 5.16s