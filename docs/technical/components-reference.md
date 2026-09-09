# Components Reference

Last updated: 2026-07-02

## App Shell

| Component | Role |
|---|---|
| `src/components/ErrorBoundary.tsx` | Runtime error fallback with retry/reset actions |
| `src/components/StoryAutoSave.tsx` | Autosaves active story state |
| `src/components/ReaderAudioRouteGuard.tsx` | Stops reader audio when leaving reader routes |
| `src/components/MigrationErrorBanner.tsx` | Shows persisted migration failures |
| `src/components/screen-container.tsx` | Shared responsive screen wrapper |
| `src/components/WebSidebar.tsx` | Web sidebar navigation |

## Reader

| Component | Role |
|---|---|
| `src/components/story-reader-responsive.tsx` | Main reader surface |
| `src/components/reader/ReaderDisplay.tsx` | Background, characters, dialogue/text, effects, interactive overlays |
| `src/components/reader/ReaderControls.tsx` | Reader controls for autoplay, turbo, history, menu |
| `src/components/reader/ReaderChoices.tsx` | Choice block buttons |
| `src/components/reader/VisualEffectsOverlay.tsx` | Reader visual effect layer |
| `src/components/reader/WeatherEffectsLayer.tsx` | Weather effect layer |
| `src/components/dialogue-history.tsx` | Dialogue history panel |
| `src/components/ReaderMenu.tsx` | Reader menu overlay |
| `src/components/CharacterDisplay.tsx` | Character sprite rendering |
| `src/components/InteractiveObjectsLayer.tsx` | Interactive object overlay |

## Editors

| Component | Role |
|---|---|
| `src/components/document-editor/DocumentSceneEditor.tsx` | Main document scene editor |
| `src/components/document-editor/DocumentSceneSidebar.tsx` | Scene/document navigation sidebar |
| `src/components/document-editor/DocumentInspectorPanel.tsx` | Technical block inspector |
| `src/components/document-editor/DocumentEditorHeader.tsx` | Document editor header |
| `src/components/editor/StoryManuscriptScreen.tsx` | Manuscript editor screen |
| `src/components/editor/manuscript/*` | Manuscript sidebar, section, and block components |
| `src/components/editor/SceneManager.tsx` | Scene list and CRUD flow |
| `src/components/editor/SceneSelector.tsx` | Scene selection/connect modal |
| `src/components/editor/PreviewScreen.tsx` | Preview surface using `useSceneExecutor` |
| `src/components/editor/PlayMode.tsx` | In-editor playback mode |
| `src/components/editor/plate/*` | Plate scene editor and serializers |
| `src/components/vn-plate-editor/*` | WebView wrapper for VN Plate editor |

## Shared UI

| Component | Role |
|---|---|
| `src/components/ui/Button.tsx` | Theme-aware button |
| `src/components/ui/ConfirmDialog.tsx` | Confirmation dialog |
| `src/components/ui/Toast.tsx` | Toast viewport |
| `src/components/ui/collapsible.tsx` | Collapsible section |
| `src/components/ui/icon-symbol.tsx` | Icon wrapper |
| `src/components/LanguageSelector.tsx` | Language switcher |
| `src/components/themed-view.tsx` | Themed view wrapper used by OAuth callback |

## Removed

- `components/reader/ReaderTransitions.tsx`
- `components/SplashScreen.tsx`
- `components/WebTopBar.tsx`
- `components/ShortcutHint.tsx`
- Old Lego editor panels such as `SceneComposer`, `BlockLibraryPanel`, `TimelinePanel`, and `PropertiesPanel`
