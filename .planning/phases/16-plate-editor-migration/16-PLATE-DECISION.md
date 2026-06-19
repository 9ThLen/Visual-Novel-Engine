# Phase 16 Plate Decision

## Decision

Use the installed `platejs` package as the production Plate dependency for Phase 16.

- `package.json` declares `platejs: ^53.0.7`.
- `pnpm-lock.yaml` resolves `platejs` to `53.1.2`.
- `node_modules/platejs/package.json` is installed at `53.1.2`.
- No dependency change is part of Wave 0.

The existing Document Editor Plate bridge is the migration baseline, not throwaway code:

- `components/document-editor/DocumentSceneEditor.tsx`
- `components/vn-plate-editor/PlateWebViewEditor.web.tsx`
- `components/vn-plate-editor/PlateWebViewEditor.native.tsx`
- `lib/vn-plate-editor/embedded-html.ts`
- `lib/vn-plate-editor/scene-normalizer.ts`
- `lib/document-editor/document-scene.ts`
- `lib/document-editor/commands.ts`

## Runtime

Web runtime:

- Plate can be used directly through React exports from `platejs/react`.
- Current iframe/WebView bridge remains the active baseline until serializer tests and a direct Plate prototype prove that replacing it is lower risk.

Native runtime:

- No direct React Native Plate package is confirmed in the installed package or official docs reviewed during Wave 0.
- Native keeps the WebView bridge strategy.
- Web and native must share the same canonical serializer contract instead of diverging into separate JSON models.

## Package Answers

React API:

- `platejs/react` exists and re-exports React-specific Plate APIs from `@platejs/core/react` and related utilities.

Direct web editor:

- Plate is documented as a React framework for rich text editors on the web, so direct web use is architecturally valid.
- The current Expo web iframe bridge may stay during the migration if it continues to preserve the canonical scene model.

Minimum package set:

- Start with installed `platejs` and its bundled dependencies.
- Add specific `@platejs/*` plugins only when a Wave 4 element or command requires a feature that is not available from the base package.

Custom VN elements:

- Plate supports custom node plugins through `createPlatePlugin`.
- VN block plugins can define custom element node types with `node.isElement`, `node.type`, and a component.
- Technical blocks should use a non-lossy node payload and may be rendered as void/non-direct-edit elements if the UI should expose only a summary.

React Native:

- No direct React Native package is confirmed.
- WebView remains the production native path unless a later verified API check proves otherwise.

## Serializer Shape

`SceneRecord` and `TimelineStep` remain the persisted source of truth.

Plate is only the scene editor for that format. It must not become a separate document world with a later best-effort conversion step.

Serializer rule:

- `SceneRecord.timeline` -> Plate/Document editor model -> `SceneRecord.timeline`
- Technical block payloads must roundtrip without data loss.
- First mandatory fixture: background step with `assetId: "bg_forest"`, `transition: "dissolve"`, and `duration: 1000`.

Type decision point for Wave 1:

- If the direct Plate API requires a different node shape, create `components/editor/plate/types.ts` and map to existing `DocumentScene` types.
- If `DocumentScene` and `DocumentBlock` are sufficient, re-export them as compatibility types.
- If both are needed, keep a thin adapter layer and preserve `TimelineStep` as the canonical payload.

## Legacy Boundary

The old Lego editor must stop being an active editing system.

Allowed:

- Legacy files may remain as reference or compatibility code.
- Shared helpers may remain if they are not editor UI state or active Lego editor logic.

Not allowed:

- Active editor screens must not import legacy Lego editor components.
- New Plate screens must not route through `SceneComposer`, `TimelinePanel`, `BlockLibraryPanel`, or `PropertiesPanel`.

README rule target:

```md
Use Plate as the only scene editing system. Legacy Lego components must not be imported by active editor screens.
```

## Git Preflight

Wave 0 created the branch pointer:

```text
codex/plate-editor-migration
```

Initial switch was blocked by an existing unresolved merge conflict:

```text
.claude/settings.local.json: needs merge
error: you need to resolve your current index first
```

The user resolved the conflict and switched successfully.

Current branch:

```text
codex/plate-editor-migration
```

Working tree status:

- dirty with pre-existing changes carried from `phase-15-fixes`
- pnpm-store file noise is expected and must not be touched by Phase 16 work

## Risks

- Technical block data loss during serializer roundtrip.
- Duplicate active models: DocumentScene, Plate nodes, and SceneRecord drifting apart.
- Native/web divergence if the WebView bridge and direct web editor serialize differently.
- Active imports from legacy Lego UI remaining after the move.
- Git conflict causing Phase 16 edits to land on the wrong branch.

## Fallback

Wave 1 fallback:

- Keep existing `DocumentScene` serializer shape and harden it with tests before adding a new Plate node shape.

Wave 2 fallback:

- If active preview or navigation breaks, pause the removal and document the exact `useEditorStore` dependency before touching more files.

Wave 4 fallback:

- If direct Plate web integration is not stable, keep `PlateWebViewEditor` as production and move the Plate-facing structure into `components/editor/plate` around the bridge.

Native fallback:

- Keep WebView bridge.

## Sources Reviewed

Local:

- `package.json`
- `pnpm-lock.yaml`
- `node_modules/platejs/package.json`
- `node_modules/platejs/dist/index.d.ts`
- `node_modules/platejs/dist/react/index.d.ts`

Official docs:

- `https://platejs.org/docs`
- `https://platejs.org/docs/installation`
- `https://platejs.org/docs/plugin`

Context7 note:

- Project rules prefer Context7 for library API checks, but no Context7 MCP tool is available in this session. Wave 0 used installed package metadata and official Plate docs instead.
