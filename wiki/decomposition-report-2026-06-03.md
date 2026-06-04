# Звіт декомпозиції God Components — 2026-06-03

## Виконано

### M2: StoryReaderResponsive — декомпозиція

**Було:** 357 LOC, ~19 хуків/викликів
**Стало:** 292 LOC + 4 нові hooks (216 LOC) = 508 LOC загалом, основний компонент ~12 хуків

**Нові хуки:**
| Файл | LOC | Призначення |
|------|-----|-------------|
| `hooks/useReaderPages.ts` | 61 | Page computation + display choices |
| `hooks/useReaderAssets.ts` | 53 | Character animations + scene images |
| `hooks/useReaderNotifications.ts` | 52 | Transition/complete side effects |
| `hooks/useDialogueHistory.ts` | 50 | History entries + showHistory toggle |

**Що винесено з StoryReaderResponsive:**
- `useMemo` для pages, displayChoices → `useReaderPages`
- `useMemo` для executorImageState + `useSceneImages` + `useCharacterAnimations` + `useMemo` для characterInstances → `useReaderAssets`
- 2 `useEffect` для transition/complete notification + 2 `useRef` → `useReaderNotifications`
- `useState` для history/showHistory + `useEffect` для history tracking → `useDialogueHistory`

**Залишилось в StoryReaderResponsive:**
- `useColors`, `useI18n`, `useWindowDimensions` — базові хуки
- `getReaderLayout`, `getResponsiveFontSize` — responsive
- `useSceneExecutor` — core executor
- `useMemo` для displaySceneId
- `useState` для pageIndex
- `useTypewriter` — typewriter effect
- `useReaderAutoAdvance` — auto-advance
- `useSharedValue` x3 — animations
- `useAnimatedStyle` x3 — animated styles
- `useRef` x2 — callback refs
- `useEffect` x2 — history/sceneState callbacks

### M2: SceneComposer — декомпозиція

**Було:** 510 LOC, ~21 хук
**Стало:** 288 LOC + 2 нові компоненти (313 + 335 LOC) + 1 хук (70 LOC)

**Нові файли:**
| Файл | LOC | Призначення |
|------|-----|-------------|
| `SceneComposerPhone.tsx` | 313 | Phone layout (header, tabs, panels, bottom bar) |
| `SceneComposerDesktop.tsx` | 335 | Desktop layout (toolbar, 3-panel) |
| `useSceneComposerShortcuts.ts` | 70 | Keyboard shortcuts |

**Що винесено з SceneComposer:**
- Phone layout (269 LOC) → `SceneComposerPhone`
- Desktop layout (206 LOC) → `SceneComposerDesktop`
- `useEditorShortcuts` + `useKeyboardShortcuts` → `useSceneComposerShortcuts`
- `phoneStyles` useMemo → в `SceneComposerPhone`

**Залишилось в SceneComposer:**
- `useRouter`, `useColors`, `useI18n`, `useSafeAreaInsets`, `useResponsiveLayout` — базові
- `useEditorStore` x3 — store access
- `useAppStore` — app state
- `useState` x5 — UI state (showBlockLibrary, showProperties, showMiniPreview, showSceneSelector, pendingDeleteId)
- `useCallback` x12 — event handlers
- `useMemo` x2 — storyScenes, commonProps
- `useEffect` x1 — hydrateSceneDraft
- `useSceneComposerShortcuts` — keyboard shortcuts

**Примітка:** SceneComposer все ще має багато `useCallback` (12), але це нормально — він є "orchestrator" який збирає callback'и і передає їх в дочірні компоненти. Кожен `useCallback` — це окрема функція яка муśт бути мемоізована для стабільності callback'ів.

## Метрики

| Компонент | Було LOC | Стало LOC | Було хуків | Стало хуків |
|-----------|----------|-----------|------------|-------------|
| StoryReaderResponsive | 357 | 292 (+216 hooks) | ~19 | ~12 |
| SceneComposer | 510 | 288 (+648 subcomponents) | ~21 | ~27* |

*SceneComposer має багато useCallback бо він є orchestrator

## Рекомендації подальших покращень

1. **PropertiesPanel.tsx — 1094 LOC** — найбільший файл. Розбити на per-block-type форми.
2. **StoryReaderResponsive** — можна ще винести animated styles в `useReaderAnimations` hook
3. **SceneComposerPhone/Desktop** — обидва мають дублювання SceneSelector/ConfirmDialog. Можна винести в спільний wrapper.
