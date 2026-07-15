/**
 * DocumentSceneEditor renders the whole story as one continuous, scrollable
 * document. Scenes near the viewport mount a live PlateWebViewEditor (a full
 * iframe); scenes further away render a lightweight placeholder so the DOM
 * and iframe count stay bounded regardless of story length.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentBranchBreadcrumb } from '@/components/document-editor/DocumentBranchBreadcrumb';
import { DocumentEditorHeader } from '@/components/document-editor/DocumentEditorHeader';
import { DocumentRightRail } from '@/components/document-editor/DocumentRightRail';
import { DocumentSceneFrame } from '@/components/document-editor/DocumentSceneFrame';
import { DocumentSceneSidebar } from '@/components/document-editor/DocumentSceneSidebar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type {
  PlateWebViewEditorHandle,
  PlateWebViewEditorSnapshot,
} from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useEditorShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { crumbsForSceneIndex, type BranchBreadcrumbItem } from '@/lib/document-editor/branch-breadcrumb';
import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
import { loadSceneHeights, persistSceneHeight } from '@/lib/document-editor/scene-height-cache';
import {
  computeActiveSceneId,
  computeMountDelta,
  seedMountedSceneIds,
} from '@/lib/document-editor/scene-mount-range';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateBranchInfo, VNPlateFormatCommand, VNPlateFormatState } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { IncomingScenePath } from '@/lib/document-editor/story-path';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneRecord } from '@/lib/engine/types';

interface DocumentSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  /** Scenes not reachable on the active path, listed in the sidebar under «Поза сюжетом». */
  offPathScenes?: SceneRecord[];
  /** Branch info per choice block, forwarded to webview editors for the branch switcher. */
  branchInfo?: VNPlateBranchInfo[];
  /** Called after dirty editors are flushed and saved; the host then re-renders the new branch. */
  onSelectChoiceOption?: (choiceStepId: string, optionId: string) => void;
  /** Called after dirty editors are flushed and saved; the host creates a new scene for the option. */
  onStartBranchOption?: (choiceStepId: string, optionId: string) => void;
  /** incomingCount per scene id, drives the merge-point banners. */
  incomingCountBySceneId?: Record<string, number>;
  /** Source scenes and trigger texts per scene id, shown in merge-point tooltips. */
  incomingPathsBySceneId?: Record<string, IncomingScenePath[]>;
  /** Branch accent color per scene id on the active path (branch tinting). */
  branchColorBySceneId?: Record<string, string>;
  /** Choice crumbs for the whole active path; sliced here by the scrolled-to scene. */
  branchBreadcrumbTrail?: BranchBreadcrumbItem[];
  /** 'path' renders the active branch path; 'all' renders every scene sequentially. */
  viewMode?: 'path' | 'all';
  /** Called after dirty editors are flushed and saved; the host re-renders in the new mode. */
  onSetViewMode?: (mode: 'path' | 'all') => void;
  sceneIndex: number;
  sceneCount: number;
  initialDocuments: DocumentScene[];
  documentsResetKey: string;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  audioAssets: VNPlateAudioAsset[];
  protectedCharacterIds?: string[];
  onSave: (documentScenes: DocumentScene[], characters: Character[]) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
  onDuplicateScene?: (sceneId: string) => void;
  onDeleteScene?: (sceneId: string) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string, purpose?: 'background' | 'sprite') => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
  onBack?: () => void;
  onPreview?: (sceneId: string) => void;
  onGallery?: () => void;
  onSaveAndPlay?: (sceneId: string) => void;
}

/**
 * Returns a per-sceneId-bound callback with a stable identity across
 * renders, so DocumentSceneFrame's React.memo isn't defeated by the parent
 * re-creating a fresh function on every render.
 */
/**
 * Quiet period after the pinned scene's y stops moving before the pending
 * scroll pin is released. The pin itself has no absolute time limit — frames
 * (iframes) above the target can keep mounting and shifting it for many
 * seconds; a user scroll releases it immediately.
 */
const PENDING_SCROLL_SETTLE_MS = 900;

function useSceneCallback<Args extends unknown[]>(
  handler: (sceneId: string, ...args: Args) => void,
): (sceneId: string) => (...args: Args) => void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const cacheRef = useRef(new Map<string, (...args: Args) => void>());

  return useCallback((sceneId: string) => {
    let cached = cacheRef.current.get(sceneId);
    if (!cached) {
      cached = (...args: Args) => handlerRef.current(sceneId, ...args);
      cacheRef.current.set(sceneId, cached);
    }
    return cached;
  }, []);
}

export function DocumentSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  offPathScenes,
  branchInfo,
  onSelectChoiceOption,
  onStartBranchOption,
  incomingCountBySceneId,
  incomingPathsBySceneId,
  branchColorBySceneId,
  branchBreadcrumbTrail,
  viewMode,
  onSetViewMode,
  sceneIndex,
  sceneCount,
  initialDocuments,
  documentsResetKey,
  characters,
  backgroundAssets,
  audioAssets,
  onSave,
  onCreateNextScene,
  onDuplicateScene,
  onDeleteScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
  onBack,
  onPreview,
  onGallery,
  onSaveAndPlay,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const documentColorScheme = 'light';
  const colors = useColors(documentColorScheme);
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';

  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [focusedEditorSceneId, setFocusedEditorSceneId] = useState<string | null>(null);
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteSceneId, setPendingDeleteSceneId] = useState<string | null>(null);
  // Distraction-free writing: hides the sidebar, breadcrumb, inspector, and
  // the header's undo/redo + formatting tools, leaving only the document.
  const [focusMode, setFocusMode] = useState(false);
  const [historyStateByScene, setHistoryStateByScene] = useState<Record<string, { canUndo: boolean; canRedo: boolean }>>({});
  const [formatStateByScene, setFormatStateByScene] = useState<Record<string, VNPlateFormatState>>({});
  const [mountedSceneIds, setMountedSceneIds] = useState<Set<string>>(() =>
    seedMountedSceneIds(initialDocuments.map((ds) => ds.sceneId), sceneRecord.id),
  );
  // Bumped whenever sceneLayoutRef is wiped (document rebuild) so every frame
  // re-measures itself — RNW's onLayout does not re-fire for frames whose
  // geometry did not change, which would leave the layout map empty forever.
  const [measureVersion, setMeasureVersion] = useState(0);

  const editorRefsRef = useRef(new Map<string, PlateWebViewEditorHandle>());
  const draftRegistryRef = useRef(new Map<string, PlateWebViewEditorSnapshot>());
  const sceneLayoutRef = useRef(new Map<string, { y: number; height: number }>());
  // Heights measured in previous sessions: placeholders and fresh iframes
  // start at their real height, so scrolling doesn't shift as frames mount.
  const persistedHeights = useMemo(() => loadSceneHeights(storyId), [storyId]);
  const mountedSceneIdsRef = useRef(mountedSceneIds);
  const documentScenesRef = useRef(documentScenes);
  const activeSceneIdRef = useRef(activeSceneId);
  const focusedEditorSceneIdRef = useRef<string | null>(null);
  const localCharactersRef = useRef(localCharacters);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const pendingScrollSceneIdRef = useRef<string | null>(sceneRecord.id);
  // While a pending scroll target is set, every frame layout re-pins the
  // scroll to it: scenes mounting ABOVE the target keep shifting its y, and a
  // single scrollTo would leave the viewport on a neighboring scene (e.g.
  // after toggling «Всі сцени»). Released once the target's y has been quiet
  // for PENDING_SCROLL_SETTLE_MS, or as soon as the user scrolls themselves.
  const pendingScrollDeadlineRef = useRef<number>(Date.now() + PENDING_SCROLL_SETTLE_MS);
  const pendingScrollLastYRef = useRef<number | null>(null);
  const recomputeScheduledRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const prevResetKeyRef = useRef(documentsResetKey);
  const prevRouteSceneIdRef = useRef(sceneRecord.id);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Starts at 1 so the initial mount renders without an entrance animation.
  const branchSwitchAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mountedSceneIdsRef.current = mountedSceneIds;
  }, [mountedSceneIds]);

  useEffect(() => {
    documentScenesRef.current = documentScenes;
  }, [documentScenes]);

  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);

  useEffect(() => {
    return () => {
      if (savingTimerRef.current) {
        clearTimeout(savingTimerRef.current);
        savingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (prevResetKeyRef.current === documentsResetKey) return;
    const routeSceneChanged = prevRouteSceneIdRef.current !== sceneRecord.id;
    prevResetKeyRef.current = documentsResetKey;
    prevRouteSceneIdRef.current = sceneRecord.id;
    if (!routeSceneChanged && dirtySceneIds.has(activeSceneId)) return;

    // Clamp to a scene that exists in the rebuilt document: switching an
    // ancestor branch (e.g. from the breadcrumb) can drop the scene the
    // author was viewing off the active path, and a stale activeSceneId
    // would leak into preview/save-and-play routes and the scroll seed.
    const documentSceneIds = new Set(initialDocuments.map((ds) => ds.sceneId));
    let nextActiveSceneId = routeSceneChanged ? sceneRecord.id : activeSceneId;
    if (!documentSceneIds.has(nextActiveSceneId)) {
      nextActiveSceneId = documentSceneIds.has(sceneRecord.id)
        ? sceneRecord.id
        : initialDocuments[0]?.sceneId ?? nextActiveSceneId;
    }
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    localCharactersRef.current = characters;
    setActiveSceneId(nextActiveSceneId);
    draftRegistryRef.current.clear();
    sceneLayoutRef.current.clear();
    editorRefsRef.current.clear();
    focusedEditorSceneIdRef.current = null;
    setFocusedEditorSceneId(null);
    setMeasureVersion((version) => version + 1);
    setMountedSceneIds(seedMountedSceneIds(initialDocuments.map((ds) => ds.sceneId), nextActiveSceneId));
    pendingScrollSceneIdRef.current = nextActiveSceneId;
    pendingScrollDeadlineRef.current = Date.now() + PENDING_SCROLL_SETTLE_MS;
    pendingScrollLastYRef.current = null;

    // Slide-and-fade the rebuilt document in so a branch switch reads as a
    // content change rather than a flicker. Opacity/transform only — layout
    // and the scroll restore logic above are unaffected.
    branchSwitchAnim.setValue(0);
    Animated.timing(branchSwitchAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [activeSceneId, branchSwitchAnim, characters, dirtySceneIds, documentsResetKey, initialDocuments, sceneRecord.id]);

  // Live scene refs for transition/choice target pickers inside the webview
  // editors — names come from the in-session documents so renames show up
  // immediately. Off-path scenes («Поза сюжетом») are appended so a branch
  // can be merged back into them; they are not editable here, so their
  // record names are current.
  const storySceneRefs = React.useMemo(() => {
    const refs = documentScenes.map((ds) => ({ id: ds.sceneId, name: ds.sceneName || 'Untitled Scene' }));
    const inDocument = new Set(documentScenes.map((ds) => ds.sceneId));
    for (const scene of offPathScenes ?? []) {
      if (!inDocument.has(scene.id)) {
        refs.push({ id: scene.id, name: scene.name || 'Untitled Scene' });
      }
    }
    return refs;
  }, [documentScenes, offPathScenes]);

  const activeDocument = documentScenes.find((ds) => ds.sceneId === activeSceneId) ?? documentScenes[0];
  const activeSceneIndex = Math.max(0, scenes.findIndex((scene) => scene.id === activeSceneId));

  // Breadcrumb crumbs for the scene currently in view. Off-path scenes
  // («Поза сюжетом») are appended after the active path in `scenes`, so the
  // choices of the path do not lead to them — show a neutral breadcrumb.
  const isActiveSceneOffPath = useMemo(
    () => (offPathScenes ?? []).some((scene) => scene.id === activeSceneId),
    [activeSceneId, offPathScenes],
  );
  const breadcrumbCrumbs = useMemo(() => {
    if (!branchBreadcrumbTrail?.length || isActiveSceneOffPath) return [];
    return crumbsForSceneIndex(branchBreadcrumbTrail, activeSceneIndex);
  }, [activeSceneIndex, branchBreadcrumbTrail, isActiveSceneOffPath]);

  const applyDraftSnapshot = useCallback((snapshot: PlateWebViewEditorSnapshot, dirty = true) => {
    draftRegistryRef.current.set(snapshot.scene.sceneId, snapshot);
    localCharactersRef.current = snapshot.characters;
    setLocalCharacters(snapshot.characters);
    setDocumentScenes((current) =>
      current.map((documentScene) =>
        documentScene.sceneId === snapshot.scene.sceneId ? snapshot.scene : documentScene,
      ),
    );
    if (dirty) {
      setDirtySceneIds((current) => {
        const next = new Set(current);
        next.add(snapshot.scene.sceneId);
        return next;
      });
    }
  }, []);

  const documentsWithDrafts = useCallback(() => {
    return documentScenes.map((documentScene) =>
      draftRegistryRef.current.get(documentScene.sceneId)?.scene ?? documentScene,
    );
  }, [documentScenes]);

  const scheduleUnmount = useCallback((sceneId: string) => {
    const handle = editorRefsRef.current.get(sceneId);
    if (!handle) {
      setMountedSceneIds((current) => {
        if (!current.has(sceneId)) return current;
        const next = new Set(current);
        next.delete(sceneId);
        return next;
      });
      return;
    }
    void handle.flush().then((snapshot) => {
      applyDraftSnapshot(snapshot);
      // Only unmount if this is still the live handle — if the scene scrolled
      // back into range and remounted while we were flushing, leave it alone.
      if (editorRefsRef.current.get(sceneId) === handle) {
        editorRefsRef.current.delete(sceneId);
        if (focusedEditorSceneIdRef.current === sceneId) {
          focusedEditorSceneIdRef.current = null;
          setFocusedEditorSceneId(null);
        }
        setMountedSceneIds((current) => {
          if (!current.has(sceneId)) return current;
          const next = new Set(current);
          next.delete(sceneId);
          return next;
        });
      }
    });
  }, [applyDraftSnapshot]);

  const recomputeMounted = useCallback(() => {
    const order = documentScenesRef.current.map((ds) => ds.sceneId);
    const { toMount, toUnmount } = computeMountDelta({
      order,
      layout: sceneLayoutRef.current,
      scrollY: scrollYRef.current,
      viewportHeight: viewportHeightRef.current,
      mounted: mountedSceneIdsRef.current,
    });

    if (toMount.length) {
      setMountedSceneIds((current) => {
        const next = new Set(current);
        let changed = false;
        toMount.forEach((sceneId) => {
          if (!next.has(sceneId)) {
            next.add(sceneId);
            changed = true;
          }
        });
        return changed ? next : current;
      });
    }
    toUnmount.forEach(scheduleUnmount);
  }, [scheduleUnmount]);

  const scheduleMountRecompute = useCallback(() => {
    if (recomputeScheduledRef.current) return;
    recomputeScheduledRef.current = true;
    requestAnimationFrame(() => {
      recomputeScheduledRef.current = false;
      recomputeMounted();
    });
  }, [recomputeMounted]);

  const flushDirtyMountedEditors = useCallback(async () => {
    const targets = Array.from(dirtySceneIds).filter((sceneId) => editorRefsRef.current.has(sceneId));
    await Promise.all(
      targets.map(async (sceneId) => {
        const handle = editorRefsRef.current.get(sceneId);
        if (!handle) return;
        const snapshot = await handle.flush();
        applyDraftSnapshot(snapshot);
      }),
    );
  }, [applyDraftSnapshot, dirtySceneIds]);

  const handleSave = useCallback(async () => {
    await flushDirtyMountedEditors();
    setIsSaving(true);
    const saveCharacters = localCharactersRef.current;
    const nextDocuments = documentsWithDrafts().map((ds) => ({ ...ds, blocks: [...ds.blocks] }));
    const ensured = ensureDocumentCharactersInBlocks(
      nextDocuments.flatMap((ds) => ds.blocks),
      saveCharacters,
    );

    let cursor = 0;
    const ensuredDocuments = nextDocuments.map((ds) => {
      const blocks = ensured.blocks.slice(cursor, cursor + ds.blocks.length);
      cursor += ds.blocks.length;
      return { ...ds, blocks };
    });

    onSave(ensuredDocuments, ensured.characters);
    localCharactersRef.current = ensured.characters;
    setLocalCharacters(ensured.characters);
    setDocumentScenes(ensuredDocuments);
    draftRegistryRef.current.clear();
    setDirtySceneIds(new Set());

    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
    }
    savingTimerRef.current = setTimeout(() => {
      setIsSaving(false);
      savingTimerRef.current = null;
    }, 250);
  }, [documentsWithDrafts, flushDirtyMountedEditors, onSave]);

  const handleSelectChoiceOption = useCallback(async (choiceStepId: string, optionId: string) => {
    if (!onSelectChoiceOption) return;
    // Flush unsaved edits and persist BEFORE switching the branch: the switch
    // replaces initialDocuments/documentsResetKey, and the reset effect both
    // skips while the active scene is dirty and drops draft snapshots.
    await handleSave();
    onSelectChoiceOption(choiceStepId, optionId);
  }, [handleSave, onSelectChoiceOption]);

  // Ref-stable wrapper so passing it to every (memoized) DocumentSceneFrame
  // doesn't defeat React.memo when handleSave's identity changes.
  const selectChoiceOptionImplRef = useRef(handleSelectChoiceOption);
  selectChoiceOptionImplRef.current = handleSelectChoiceOption;
  const stableSelectChoiceOption = useCallback((choiceStepId: string, optionId: string) => {
    void selectChoiceOptionImplRef.current(choiceStepId, optionId);
  }, []);

  const handleStartBranchOption = useCallback(async (choiceStepId: string, optionId: string) => {
    if (!onStartBranchOption) return;
    // Same flush-then-mutate contract as branch switching: the host will
    // rewrite the choice scene's record and reset the document.
    await handleSave();
    onStartBranchOption(choiceStepId, optionId);
  }, [handleSave, onStartBranchOption]);

  const startBranchOptionImplRef = useRef(handleStartBranchOption);
  startBranchOptionImplRef.current = handleStartBranchOption;
  const stableStartBranchOption = useCallback((choiceStepId: string, optionId: string) => {
    void startBranchOptionImplRef.current(choiceStepId, optionId);
  }, []);

  const handleAddScene = useCallback(async () => {
    await handleSave();
    onCreateNextScene(activeSceneIdRef.current, [], localCharactersRef.current);
  }, [handleSave, onCreateNextScene]);

  const handleDuplicateScene = useCallback(async (sourceSceneId: string) => {
    if (!onDuplicateScene) return;
    await handleSave();
    onDuplicateScene(sourceSceneId);
  }, [handleSave, onDuplicateScene]);

  const handleRequestDeleteScene = useCallback((sceneId: string) => {
    setPendingDeleteSceneId(sceneId);
  }, []);

  const handleConfirmDeleteScene = useCallback(async () => {
    const sceneId = pendingDeleteSceneId;
    if (!sceneId || !onDeleteScene) return;
    setPendingDeleteSceneId(null);
    await handleSave();
    onDeleteScene(sceneId);
  }, [handleSave, onDeleteScene, pendingDeleteSceneId]);

  const handleSetViewMode = useCallback(async (mode: 'path' | 'all') => {
    if (!onSetViewMode || mode === viewMode) return;
    // Same flush-then-mutate contract as branch switching: the mode change
    // rebuilds initialDocuments, and the reset effect keeps the author on the
    // scene they were viewing (activeSceneId survives the rebuild).
    await handleSave();
    onSetViewMode(mode);
  }, [handleSave, onSetViewMode, viewMode]);

  const setViewModeImplRef = useRef(handleSetViewMode);
  setViewModeImplRef.current = handleSetViewMode;
  const stableSetViewMode = useCallback((mode: 'path' | 'all') => {
    void setViewModeImplRef.current(mode);
  }, []);

  const handleOffPathScenePress = useCallback(async (nextSceneId: string) => {
    // Off-path scenes are not rendered in the current document — reopen the
    // route on that scene so it gets appended and becomes editable.
    await handleSave();
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: nextSceneId } });
  }, [handleSave, router, storyId]);

  const handlePlateChangeImpl = useCallback((_sceneId: string, nextScene: DocumentScene, nextCharacters: Character[]) => {
    applyDraftSnapshot({ scene: nextScene, characters: nextCharacters });
  }, [applyDraftSnapshot]);

  const handleCreateNextSceneImpl = useCallback((_sceneId: string, nextScene: DocumentScene, nextCharacters: Character[]) => {
    const nextDocuments = documentsWithDrafts().map((documentScene) =>
      documentScene.sceneId === nextScene.sceneId ? nextScene : documentScene,
    );
    draftRegistryRef.current.set(nextScene.sceneId, { scene: nextScene, characters: nextCharacters });
    localCharactersRef.current = nextCharacters;
    setLocalCharacters(nextCharacters);
    setDocumentScenes(nextDocuments);
    onCreateNextScene(nextScene.sceneId, nextDocuments, nextCharacters);
  }, [documentsWithDrafts, onCreateNextScene]);

  const registerEditorRefImpl = useCallback((sceneId: string, handle: PlateWebViewEditorHandle | null) => {
    if (handle) {
      editorRefsRef.current.set(sceneId, handle);
    } else {
      editorRefsRef.current.delete(sceneId);
    }
  }, []);

  const handleFrameLayoutImpl = useCallback((sceneId: string, y: number, height: number) => {
    const prev = sceneLayoutRef.current.get(sceneId);
    sceneLayoutRef.current.set(sceneId, { y, height });

    // Remember real (live editor) heights across sessions so placeholders are
    // exact next time. Placeholder frames are skipped — persisting their
    // min/estimated height would overwrite a real measurement.
    if (mountedSceneIdsRef.current.has(sceneId)) {
      persistSceneHeight(storyId, sceneId, height);
    }

    // Anti-jump: if a scene fully above the current scroll position changed
    // height (e.g. its iframe resized after mounting), shift the scroll
    // offset by the same delta so on-screen content doesn't visibly move.
    // Skipped while a pending scroll target is pinned — the pin below already
    // keeps the viewport anchored to the target scene.
    if (!pendingScrollSceneIdRef.current && prev && prev.height !== height && y < scrollYRef.current) {
      const delta = height - prev.height;
      if (delta !== 0) {
        const nextScrollY = Math.max(0, scrollYRef.current + delta);
        scrollYRef.current = nextScrollY;
        scrollViewRef.current?.scrollTo({ y: nextScrollY, animated: false });
      }
    }

    // Pin the viewport to the pending target on every layout event: frames
    // mounting above the target shift its y after the first scroll, and a
    // one-shot scrollTo would land on a neighboring scene. Each shift of the
    // target's y restarts the quiet period; once y has been stable for the
    // whole period, the pin is released.
    const pendingSceneId = pendingScrollSceneIdRef.current;
    if (pendingSceneId) {
      const target = sceneLayoutRef.current.get(pendingSceneId);
      if (target) {
        if (pendingScrollLastYRef.current !== target.y) {
          pendingScrollLastYRef.current = target.y;
          pendingScrollDeadlineRef.current = Date.now() + PENDING_SCROLL_SETTLE_MS;
          scrollYRef.current = target.y;
          scrollViewRef.current?.scrollTo({ y: target.y, animated: false });
        } else if (Date.now() >= pendingScrollDeadlineRef.current) {
          pendingScrollSceneIdRef.current = null;
          pendingScrollLastYRef.current = null;
        }
      }
    }

    scheduleMountRecompute();
  }, [scheduleMountRecompute, storyId]);

  const getOnChange = useSceneCallback(handlePlateChangeImpl);
  const getOnCreateNextScene = useSceneCallback(handleCreateNextSceneImpl);
  const getOnDuplicateScene = useSceneCallback((_sceneId: string) => {
    void handleDuplicateScene(_sceneId);
  });
  const getOnRequestDeleteScene = useSceneCallback((_sceneId: string) => {
    handleRequestDeleteScene(_sceneId);
  });
  const getRegisterEditorRef = useSceneCallback(registerEditorRefImpl);
  const getOnFrameLayout = useSceneCallback(handleFrameLayoutImpl);

  const handleUndo = useCallback(() => {
    const sceneId = focusedEditorSceneIdRef.current ?? activeSceneIdRef.current;
    editorRefsRef.current.get(sceneId)?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    const sceneId = focusedEditorSceneIdRef.current ?? activeSceneIdRef.current;
    editorRefsRef.current.get(sceneId)?.redo();
  }, []);

  useEditorShortcuts({ onUndo: handleUndo, onRedo: handleRedo });

  const handleHistoryStateImpl = useCallback((sceneId: string, canUndo: boolean, canRedo: boolean) => {
    setHistoryStateByScene((current) => {
      const previous = current[sceneId];
      if (previous?.canUndo === canUndo && previous.canRedo === canRedo) return current;
      return { ...current, [sceneId]: { canUndo, canRedo } };
    });
  }, []);
  const getOnHistoryStateChange = useSceneCallback(handleHistoryStateImpl);
  const activeHistoryState = historyStateByScene[activeSceneId] ?? { canUndo: false, canRedo: false };
  const handleFormatStateImpl = useCallback((sceneId: string, state: VNPlateFormatState) => {
    setFormatStateByScene((current) => ({ ...current, [sceneId]: state }));
    // Keep the selection target separate from the scroll-derived active scene.
    // Updating activeSceneId here causes the whole document chrome to rerender
    // while the browser is selecting text, which can make the ScrollView jump.
    if (state.canFormat && focusedEditorSceneIdRef.current !== sceneId) {
      focusedEditorSceneIdRef.current = sceneId;
      setFocusedEditorSceneId(sceneId);
    }
  }, []);
  const getOnFormatStateChange = useSceneCallback(handleFormatStateImpl);
  const formatSceneId = focusedEditorSceneId ?? activeSceneId;
  const activeFormatState = formatStateByScene[formatSceneId] ?? {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    alignment: 'left',
    fontSize: 17,
    color: null,
    canFormat: false,
  };
  const handleFormatText = useCallback((command: VNPlateFormatCommand, value?: string) => {
    const sceneId = focusedEditorSceneIdRef.current ?? activeSceneIdRef.current;
    editorRefsRef.current.get(sceneId)?.formatText(command, value);
  }, []);

  const handleBack = useCallback(async () => {
    await handleSave();
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  }, [handleSave, onBack, router]);

  const handlePreview = useCallback(async () => {
    await handleSave();
    if (onPreview) {
      onPreview(activeSceneId);
      return;
    }
    router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
  }, [activeSceneId, handleSave, onPreview, router, storyId]);

  const handleSaveAndPlay = useCallback(async () => {
    await handleSave();
    if (onSaveAndPlay) {
      onSaveAndPlay(activeSceneId);
      return;
    }
    router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
  }, [activeSceneId, handleSave, onSaveAndPlay, router, storyId]);

  const handleScenePress = useCallback((nextSceneId: string) => {
    setMountedSceneIds((current) => {
      if (current.has(nextSceneId)) return current;
      const next = new Set(current);
      next.add(nextSceneId);
      return next;
    });
    const entry = sceneLayoutRef.current.get(nextSceneId);
    if (entry) {
      pendingScrollSceneIdRef.current = null;
      scrollYRef.current = entry.y;
      scrollViewRef.current?.scrollTo({ y: entry.y, animated: true });
    } else {
      pendingScrollSceneIdRef.current = nextSceneId;
      pendingScrollDeadlineRef.current = Date.now() + PENDING_SCROLL_SETTLE_MS;
      pendingScrollLastYRef.current = null;
    }
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    // A scroll that doesn't match the last programmatic position is the user
    // scrolling — release the pending pin instead of yanking them back.
    if (pendingScrollSceneIdRef.current && Math.abs(y - scrollYRef.current) > 4) {
      pendingScrollSceneIdRef.current = null;
      pendingScrollLastYRef.current = null;
    }
    scrollYRef.current = y;
    const order = documentScenesRef.current.map((ds) => ds.sceneId);
    const nextActive = computeActiveSceneId({ order, layout: sceneLayoutRef.current, scrollY: y });
    if (nextActive && nextActive !== activeSceneIdRef.current) {
      activeSceneIdRef.current = nextActive;
      setActiveSceneId(nextActive);
    }
    scheduleMountRecompute();
  }, [scheduleMountRecompute]);

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeightRef.current = event.nativeEvent.layout.height;
    scheduleMountRecompute();
  }, [scheduleMountRecompute]);

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={0}
      >
      <DocumentEditorHeader
        activeTitle={activeDocument?.sceneName || sceneRecord.name}
        colorScheme={documentColorScheme}
        isPhone={isPhone}
        isSaving={isSaving}
        safeTop={insets.top}
        sceneIndex={activeSceneIndex >= 0 ? activeSceneIndex : sceneIndex}
        sceneCount={sceneCount}
        onBack={handleBack}
        onPreview={handlePreview}
        onGallery={onGallery ?? (() => router.push({ pathname: '/story-gallery', params: { storyId } }))}
        onSave={handleSave}
        onSaveAndPlay={handleSaveAndPlay}
        canUndo={activeHistoryState.canUndo}
        canRedo={activeHistoryState.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        formatState={activeFormatState}
        onFormatText={handleFormatText}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode((current) => !current)}
      />

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone && !focusMode ? (
          <DocumentSceneSidebar
            activeSceneId={activeSceneId}
            colorScheme={documentColorScheme}
            dirtySceneIds={dirtySceneIds}
            scenes={scenes}
            offPathScenes={offPathScenes}
            branchColorBySceneId={branchColorBySceneId}
            onScenePress={handleScenePress}
            onAddScene={handleAddScene}
            onOffPathScenePress={handleOffPathScenePress}
          />
        ) : null}

        <View style={{ flex: 1 }}>
        {!focusMode ? (
        <DocumentBranchBreadcrumb
          colorScheme={documentColorScheme}
          isPhone={isPhone}
          crumbs={breadcrumbCrumbs}
          currentLabel={activeDocument?.sceneName || sceneRecord.name}
          branchInfo={branchInfo}
          onSelectChoiceOption={stableSelectChoiceOption}
          onStartBranchOption={stableStartBranchOption}
          onNavigateToScene={handleScenePress}
          viewMode={viewMode}
          onSetViewMode={stableSetViewMode}
        />
        ) : null}
        <ScrollView
          ref={scrollViewRef}
          style={{
            flex: 1,
            backgroundColor: colors.background,
          }}
          contentContainerStyle={{
            paddingHorizontal: isPhone ? 0 : 28,
            paddingTop: isPhone ? 0 : 28,
            paddingBottom: isPhone ? insets.bottom + 20 : 36,
          }}
          keyboardShouldPersistTaps="handled"
          onLayout={handleViewportLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Animated.View
            style={{
              gap: isPhone ? 18 : 34,
              opacity: branchSwitchAnim,
              transform: [
                {
                  translateY: branchSwitchAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            }}
          >
          {documentScenes.map((documentScene) => (
            <DocumentSceneFrame
              key={documentScene.sceneId}
              scene={documentScene}
              editorId={`vn-plate-${storyId}-${documentScene.sceneId}`}
              characters={localCharacters}
              backgroundAssets={backgroundAssets}
              audioAssets={audioAssets}
              storyScenes={storySceneRefs}
              branchInfo={branchInfo}
              onSelectChoiceOption={stableSelectChoiceOption}
              onStartBranchOption={stableStartBranchOption}
              incomingCount={incomingCountBySceneId?.[documentScene.sceneId]}
              incomingPaths={incomingPathsBySceneId?.[documentScene.sceneId]}
              branchColor={branchColorBySceneId?.[documentScene.sceneId]}
              isPhone={isPhone}
              isMounted={mountedSceneIds.has(documentScene.sceneId)}
              cachedHeight={sceneLayoutRef.current.get(documentScene.sceneId)?.height ?? persistedHeights[documentScene.sceneId]}
              onChange={getOnChange(documentScene.sceneId)}
              onCreateNextScene={getOnCreateNextScene(documentScene.sceneId)}
              onDuplicateScene={getOnDuplicateScene(documentScene.sceneId)}
              onRequestDeleteScene={getOnRequestDeleteScene(documentScene.sceneId)}
              onUploadBackgroundAsset={onUploadBackgroundAsset}
              onUploadAudioAsset={onUploadAudioAsset}
              registerEditorRef={getRegisterEditorRef(documentScene.sceneId)}
              onHistoryStateChange={getOnHistoryStateChange(documentScene.sceneId)}
              onFormatStateChange={getOnFormatStateChange(documentScene.sceneId)}
              onFrameLayout={getOnFrameLayout(documentScene.sceneId)}
              measureVersion={measureVersion}
            />
          ))}
          </Animated.View>
        </ScrollView>
        </View>

        {!isPhone && !focusMode ? (
          <DocumentRightRail
            colorScheme={documentColorScheme}
            scene={activeDocument ?? null}
            storyId={storyId}
            activeSceneId={activeSceneId}
          />
        ) : null}
      </View>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={pendingDeleteSceneId !== null}
        title={t('editor.confirmDeleteSceneTitle')}
        message={t('editor.confirmDeleteSceneMessage')}
        confirmLabel={t('common.delete')}
        onConfirm={() => { void handleConfirmDeleteScene(); }}
        onCancel={() => setPendingDeleteSceneId(null)}
        destructive
      />
    </>
  );
}
