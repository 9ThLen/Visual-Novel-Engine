# Phase 8: Accessibility & i18n — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Додати accessibility labels, виправити кольорову систему (замінити hardcoded hex на RuntimePalette токени), створити i18n ключі для editor та додати контрастну перевірку. Phase 8 — фінальний шар якості перед додаванням нових product features.

Deliverables:
- Заміна hardcoded кольорів на RuntimePalette токени в Editor + Reader + UI компонентах
- ErrorBoundary: rewrite to functional component з useColors()
- Lego editor: мінімальні правки (тільки найочевидніші #fff/#000)
- accessibilityLabel + accessibilityRole на всі інтерактивні елементи (inline per component, через t())
- Перевірка contrast ratio 4.5:1 для всіх компонентів (світла тема)
- i18n ключі для editor toolbar, block labels, confirmation messages

Out of boundary:
- Нові переклади — тільки ключі, переклад не обов'язковий
- RTL підтримка
- Locale-aware date/number форматування
- Повний UI redesign
- Крупні product features

</domain>

<decisions>
## Implementation Decisions

### Обсяг заміни кольорів
- **D-01:** Замінювати hardcoded кольори тільки в Editor + Reader + UI компонентах. Lego editor — мінімальні правки.
- **D-02:** ErrorBoundary переписати з class component на функціональний, щоб міг використовувати useColors()
- **D-03:** SaveSceneDialog, ConfirmDialog використовують кольори від батьківського компонента (useColors()), окремі токени не потрібні
- **D-04:** oklch fallback не потрібен — oklchToRgb() вже конвертує всі токени в hex/rgb

### Стратегія accessibilityLabel
- **D-05:** Додавати accessibilityLabel вручну per component під час заміни кольорів
- **D-06:** Перевикористовувати існуючий Button компонент (вже має accessibilityLabel + accessibilityRole props) замість голого Pressable де можливо
- **D-07:** accessibilityLabel має використовувати t() для локалізації

### Контраст і кольорова система
- **D-08:** Перевірка contrast ratio 4.5:1 — full component audit (не тільки токени)
- **D-09:** Тільки світла тема — єдина тема в проекті
- **D-10:** Theme.config.js oklch токени — source of truth; theme.ts oklchToRgb() — runtime converter

### the agent's Discretion
- Порядок заміни кольорів у компонентах
- Які саме accessibilityLabel значення використовувати (де t() ключа ще немає)
- Деталі перепису ErrorBoundary

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Color system
- `theme.config.js` — All ~60 design tokens in oklch format (source of truth)
- `lib/_core/theme.ts` — RuntimePalette type, oklchToRgb(), Colors object, ThemeColorPalette
- `hooks/use-colors.ts` — useColors() hook, reads theme store
- `stores/theme-store.ts` — Theme persistence, CSS custom property injection for web

### i18n
- `lib/i18n.ts` — Core i18n hook: useI18n(), t(), pluralize()
- `lib/translations.ts` — Translation dictionaries (en, uk, pl), ~110 keys
- `lib/translations.json` — Potentially stale duplicate — needs cleanup decision
- `components/LanguageSelector.tsx` — Existing i18n UI component

### Accessibility patterns
- `components/ui/Button.tsx` — Best existing a11y pattern (accessibilityLabel + accessibilityRole as props)
- `components/story-reader-responsive.tsx` — Most a11y-augmented component (labels, roles, hints)
- `app/tabs/index.tsx` — Good a11y pattern for story cards
- `app/save-load.tsx` — Mixed i18n + a11y, hardcoded English in labels

### Existing components with hardcoded colors (targets)
- `components/editor/PropertiesPanel.tsx` — ~12 hardcoded colors
- `components/editor/SceneSelector.tsx` — ~10 hardcoded colors
- `components/editor/PreviewScreen.tsx` — ~4 hardcoded colors
- `components/editor/TimelinePanel.tsx` — ~4 hardcoded colors
- `components/editor/BlockLibraryPanel.tsx` — ~2 hardcoded colors
- `components/editor/modals/AssetPicker.tsx` — ~5 hardcoded colors
- `components/editor/modals/CharacterCreator.tsx` — ~13 hardcoded colors
- `components/editor/modals/SaveSceneDialog.tsx` — ~2 hardcoded colors
- `components/editor/StoryFlowScreen.tsx` — ~4 hardcoded colors
- `components/editor/SceneManager.tsx` — ~3 hardcoded colors
- `components/editor/MediaPickerRow.tsx` — 1 hardcoded color
- `components/editor/SceneEditorForm.tsx` — ~3 hardcoded colors
- `components/editor/SceneEditorHeader.tsx` — 1 hardcoded color
- `components/story-reader-responsive.tsx` — ~5 hardcoded colors
- `components/dialogue-history.tsx` — 2 hardcoded colors
- `components/ui/Button.tsx` — 2 hardcoded colors
- `components/ui/ConfirmDialog.tsx` — ~2 hardcoded colors
- `components/ErrorBoundary.tsx` — ~10 hardcoded colors (needs FC rewrite)
- `components/SplashScreen.tsx` — 1 hardcoded color
- `app/reader.tsx` — ~5 hardcoded colors
- `app/settings.tsx` — 2 hardcoded colors
- `components/lego-editor/LegoFlowWorkspace.tsx` — ~20+ hardcoded colors (minimal fixes)
- `components/lego-editor/LegoBlockLibrary.tsx` — ~8 hardcoded colors (minimal fixes)

### State and roadmap
- `.planning/STATE.md` — Project state
- `.planning/ROADMAP.md` — Phase 8 details and success criteria
- `.planning/REQUIREMENTS.md` — A11Y-01 through A11Y-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useColors()` hook — returns RuntimePalette, ready for inline styles
- `useI18n()` hook + `t()` — i18n infrastructure already works
- `Button` component — already has accessibilityLabel + accessibilityRole props
- `oklchToRgb()` — converts oklch tokens to hex/rgba at runtime

### Established Patterns
- Inline object styles (no className), colors from `useColors()`
- Pressable wrapped in View (remapProps pattern)
- Zustand directly (no React Context for state)
- Translation via `t('key')` with `useI18n()`

### Integration Points
- `theme.config.js` — add/modify color tokens here
- `lib/translations.ts` — add i18n keys here
- Stores: language in `useAppStore`, theme in `useThemeStore`

</code_context>

<specifics>
## Specific Ideas

- ErrorBoundary rewrite to FC: use useColors() for dynamic theming
- i18n keys: editor toolbar buttons, block labels (from BLOCK_TYPE_INFO), confirm dialog messages, save/load labels
- a11y labels: LanguageSelector buttons, settings sliders/switches, choice buttons, save slots
- Contrast: check text-on-surface, text-on-primary, text-on-error combinations

</specifics>

<deferred>
## Deferred Ideas

- Повний рефакторинг Lego editor кольорів — Lego deprecated, мінімальні правки тільки
- RTL підтримка — не входить в поточний scope
- Locale-aware date/number formatting — не входить
- Нові переклади для всіх мов — тільки ключі в цій фазі
- Automated a11y testing setup — не входить

</deferred>

---

*Phase: 08-accessibility-i18n*
*Context gathered: 2026-05-25*
