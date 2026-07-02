# Components Reference

Last updated: 2026-07-02

## App Shell

| Component | Role |
|---|---|
| `components/ErrorBoundary.tsx` | Runtime error fallback with retry/reset actions |
| `components/StoryAutoSave.tsx` | Autosaves active story state |
| `components/ReaderAudioRouteGuard.tsx` | Stops reader audio when leaving reader routes |
| `components/MigrationErrorBanner.tsx` | Shows persisted migration failures |
| `components/screen-container.tsx` | Shared responsive screen wrapper |
| `components/WebSidebar.tsx` | Web sidebar navigation |

## Reader

| Component | Role |
|---|---|
| `components/story-reader-responsive.tsx` | Main reader surface |
| `components/reader/ReaderDisplay.tsx` | Background, characters, dialogue/text, effects, interactive overlays |
| `components/reader/ReaderControls.tsx` | Reader controls for autoplay, turbo, history, menu |
| `components/reader/ReaderChoices.tsx` | Choice block buttons |
| `components/reader/VisualEffectsOverlay.tsx` | Reader visual effect layer |
| `components/reader/WeatherEffectsLayer.tsx` | Weather effect layer |
| `components/dialogue-history.tsx` | Dialogue history panel |
| `components/ReaderMenu.tsx` | Reader menu overlay |
| `components/CharacterDisplay.tsx` | Character sprite rendering |
| `components/InteractiveObjectsLayer.tsx` | Interactive object overlay |

## Editors

| Component | Role |
|---|---|
| `components/document-editor/DocumentSceneEditor.tsx` | Main document scene editor |
| `components/document-editor/DocumentSceneSidebar.tsx` | Scene/document navigation sidebar |
| `components/document-editor/DocumentInspectorPanel.tsx` | Technical block inspector |
| `components/document-editor/DocumentEditorHeader.tsx` | Document editor header |
| `components/editor/StoryManuscriptScreen.tsx` | Manuscript editor screen |
| `components/editor/manuscript/*` | Manuscript sidebar, section, and block components |
| `components/editor/SceneManager.tsx` | Scene list and CRUD flow |
| `components/editor/SceneSelector.tsx` | Scene selection/connect modal |
| `components/editor/PreviewScreen.tsx` | Preview surface using `useSceneExecutor` |
| `components/editor/PlayMode.tsx` | In-editor playback mode |
| `components/editor/plate/*` | Plate scene editor and serializers |
| `components/vn-plate-editor/*` | WebView wrapper for VN Plate editor |

## Shared UI

| Component | Role |
|---|---|
| `components/ui/Button.tsx` | Theme-aware button |
| `components/ui/ConfirmDialog.tsx` | Confirmation dialog |
| `components/ui/Toast.tsx` | Toast viewport |
| `components/ui/collapsible.tsx` | Collapsible section |
| `components/ui/icon-symbol.tsx` | Icon wrapper |
| `components/LanguageSelector.tsx` | Language switcher |
| `components/themed-view.tsx` | Themed view wrapper used by OAuth callback |

## Removed

- `components/reader/ReaderTransitions.tsx`
- `components/SplashScreen.tsx`
- `components/WebTopBar.tsx`
- `components/ShortcutHint.tsx`
- Old Lego editor panels such as `SceneComposer`, `BlockLibraryPanel`, `TimelinePanel`, and `PropertiesPanel`
