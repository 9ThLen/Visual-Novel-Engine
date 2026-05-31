# Testing Guide

Last updated: 2026-05-29

## Test Framework

- **Runner:** Vitest 2.1.9
- **DOM:** jsdom (via vitest environment: 'jsdom')
- **Testing Library:** @testing-library/react 16 (rendering, queries, assertions)
- **Coverage:** @vitest/coverage-v8

## Commands

```bash
pnpm test                  # Run all tests
pnpm test:coverage         # Run with coverage report
pnpm check                 # TypeScript type check (tsc --noEmit)
pnpm lint                  # ESLint
pnpm format                # Prettier
```

## Config

- **File:** `vitest.config.ts`
- **Environment:** `jsdom`
- **Globals:** `true` (describe, expect, it available without import)
- **Setup:** `vitest.setup.ts` (sets `__DEV__ = true`)
- **Include:** `__tests__/**/*.test.{ts,tsx}`
- **Exclude:** `node_modules`, `dist`, `.expo`, `__tests__/e2e`
- **Coverage include:** `lib/**`, `server/**`, `components/**`, `app/**`
- **Path alias:** `@/` → project root

## Existing Test Structure

```
__tests__/
  unit/
    lib/                           # Pure function tests
      condition-utils.test.ts      # 8 condition operators
      editor-scene-draft.test.ts   # Draft normalization
      editor-scene-save.test.ts    # Save resolution
      scene-record-adapter.test.ts # Legacy conversion
      story-flow-graph.test.ts     # Flow graph building
      story-hooks-canonical-scene.test.ts  # Hook integration
      story-manuscript.test.ts     # Manuscript logic
      story-manuscript-save.test.ts
      runtime-story.test.ts        # Runtime snapshots
      runtime-persistence.test.ts
      media-library-service.test.ts
      audio-library.test.ts
      audio-player-service.test.ts
      audio-web-source.test.ts
      bundled-story-sync.test.ts
      button-platform.test.ts
      mobile-composer-layout.test.ts
      preview-step-state.test.ts
      reader-launch.test.ts
      reader-runtime.test.ts
      screen-container-platform.test.ts
      theme-nativewind.test.ts
      theme-runtime.test.ts
      theme-variables.test.ts
      timeline-item-layout.test.ts
      timeline-sortable.test.ts
      translations.test.ts
      useSceneExecutor.test.ts     # Executor hook
    stores/                        # Store tests
      use-app-store-canonical.test.ts      # Canonical scene ops
      use-app-store-scene-operations.test.ts # Scene CRUD
      use-app-store-settings.test.ts       # Settings
      use-editor-store.test.ts             # Editor actions
    hooks/                         # Hook tests
      use-reader-audio.test.ts   # Reader audio management
    smoke.test.ts                  # Basic sanity
```

## Test Coverage

### Currently Tested (✅ ~15% of total LOC)

| Module | What's Tested |
|---|---|
| `lib/engine/conditionUtils.ts` | All 8 operators, AND logic, edge cases |
| `lib/engine/useSceneExecutor.ts` | Text yield, choice select, transition, disabled/conditions |
| `lib/editor-scene-draft.ts` | Normalization, hydration, draft creation |
| `lib/scene-record-adapter.ts` | SceneRecord → StoryScene conversion |
| `lib/story-flow-graph.ts` | Graph building from snapshot |
| `lib/runtime-story.ts` | Story/scene snapshot resolution |
| `stores/use-editor-store.ts` | Add/remove/move/duplicate/undo/redo |
| `stores/use-app-store.ts` | Canonical scene operations, settings |

### Not Tested (❌ 0% UI coverage)

| Area | Files | Priority |
|---|---|---|
| Editor components | `components/editor/*.tsx` (8 files, ~3,500 LOC) | 🔴 High |
| Reader components | `story-reader-responsive.tsx`, `dialogue-history.tsx` | 🔴 High |
| Shared UI | `components/ui/*.tsx`, `Button.tsx`, `ConfirmDialog.tsx` | 🟡 Medium |
| Core hooks | `useTypewriter.ts`, `useAutoSave.ts`, `useResponsiveLayout.ts` | 🟡 Medium |
| Audio hooks | `useReaderAudio.ts` | 🟡 Medium |
| Web layout | `DesktopLayout.tsx`, `WebSidebar.tsx`, `WebTopBar.tsx` | 🟢 Low |
| Legacy lego | `components/lego-editor/*.tsx`, `hooks/lego/*.ts` | 🟢 Low |

## Test Patterns

### Pure Function Tests (lib/)

```typescript
import { describe, expect, it } from 'vitest';
import { conditionsMet } from '@/lib/engine/conditionUtils';

describe('conditionsMet', () => {
  it('returns true for undefined conditions', () => {
    expect(conditionsMet(undefined, { x: 1 })).toBe(true);
  });
});
```

### Store Tests (stores/)

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/use-editor-store';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it('adds a block to the timeline', () => {
    useEditorStore.getState().setScene('scene-1', 'Test', []);
    useEditorStore.getState().addBlock('text');
    expect(useEditorStore.getState().timeline.length).toBe(2); // bg + text
  });
});
```

### Hook Tests (hooks/)

```typescript
import { act, renderHook } from '@testing-library/react';
import { useTypewriter } from '@/hooks/useTypewriter';

describe('useTypewriter', () => {
  it('starts typing on startTypewriter', async () => {
    const { result } = renderHook(() => useTypewriter(0.5));
    act(() => { result.current.startTypewriter('Hello'); });
    expect(result.current.isTyping).toBe(true);
    expect(result.current.displayedText).toBe('');
  });
});
```

### Component Tests (components/)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

// Requires setup: mock useColors, useI18n, expo-haptics
describe('Button', () => {
  it('renders children', () => {
    render(<Button onPress={() => {}}>Click me</Button>);
    expect(screen.getByText('Click me')).toBeTruthy();
  });
});
```

## Component Test Requirements

Components that need testing require mocking these dependencies:

| Dependency | Mock Approach |
|---|---|
| `useColors()` from `hooks/use-colors.ts` | Provide mock RuntimePalette |
| `useI18n()` from `lib/i18n.ts` | Mock `t(key) => key` |
| `expo-haptics` | Mock all methods |
| `expo-router` (useRouter) | Mock `back()`, `push()`, `replace()` |
| `react-native-reanimated` | Use `.dev.js` entry or mock |
| `useEditorStore` / `useAppStore` | Use real store with `reset()` in `beforeEach` |
| `useResponsiveLayout` | Override return value |

### Example: Mocking useColors

```typescript
jest.mock('@/hooks/use-colors', () => ({
  useColors: () => ({
    background: '#1a1a2e',
    surface: '#16213e',
    foreground: '#e0e0e0',
    primary: '#6c5ce7',
    error: '#d63031',
    muted: '#636e72',
    border: '#2d3436',
    hover: '#2d343680',
    backdrop: '#00000080',
    'text-inverse': '#ffffff',
  }),
}));
```

## Known Test Environment Issues

### WSL/NTFS Compatibility
- Project is on `/mnt/d/` (Windows NTFS), dependencies installed for Windows.
- Native binaries (`esbuild`, `rollup`) have `win32-x64` versions, but WSL needs `linux-x64`.
- **Workaround:** Manually download linux-x64 binaries from npm registry:
  ```bash
  curl -sL -o esbuild.tgz "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.21.5.tgz"
  tar xzf esbuild.tgz
  cp package/bin/esbuild node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/bin/esbuild
  ```
- Rollup native module requires a `.node` binary — test runner must stub `rollup/parseAst` to avoid native dependency.

### React Native Web Dependencies
- `react-native` globals must be available in jsdom.
- `react-native-gesture-handler` needs mock for `Pressable` interaction tests.
- `react-native-reanimated` must use `.dev.js` entry or be fully mocked.

## Recommended Next Steps

1. **Set up linux-x64 native binaries** for esbuild and rollup (or use esbuild-wasm).
2. **Create test setup file** in `vitest.setup.ts` that mocks common RN dependencies.
3. **Write component tests** in priority order:
   - `Button.tsx` (simple, no stores)
   - `ConfirmDialog.tsx` (modal interaction)
   - `PropertiesPanel.tsx` (form editing per block type)
   - `BlockLibraryPanel.tsx` (search, categories, add block)
   - `useTypewriter` (interval-based)
   - `useAutoSave` (debounce-based)
   - `useResponsiveLayout` (dimension-based)
4. **Target:** 60% overall coverage, 40% component coverage.
