/**
 * DocumentSceneEditor renders the whole story as one continuous, scrollable
 * document. Scenes near the viewport mount a live PlateWebViewEditor (a full
 * iframe); scenes further away render a lightweight placeholder so the DOM
 * and iframe count stay bounded regardless of story length.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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

import { DocumentEditorHeader } from '@/components/document-editor/DocumentEditorHeader';
import { DocumentInspectorPanel } from '@/components/document-editor/DocumentInspectorPanel';
import { DocumentSceneFrame } from '@/components/document-editor/DocumentSceneFrame';
import { DocumentSceneSidebar } from '@/components/document-editor/DocumentSceneSidebar';
import type {
  PlateWebViewEditorHandle,
  PlateWebViewEditorSnapshot,
} from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { ensureDocumentCharactersInBlocks } from '@/lib/document-editor/document-scene';
import {
  computeActiveSceneId,
  computeMountDelta,
  seedMountedSceneIds,
} from '@/lib/document-editor/scene-mount-range';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneRecord } from '@/lib/engine/types';

interface DocumentSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
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
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
  onBack?: () => void;
  onPreview?: (sceneId: string) => void;
  onSaveAndPlay?: (sceneId: string) => void;
}

/**
 * Returns a per-sceneId-bound callback with a stable identity across
 * renders, so DocumentSceneFrame's React.memo isn't defeated by the parent
 * re-creating a fresh function on every render.
 */
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
  sceneIndex,
  sceneCount,
  initialDocuments,
  documentsResetKey,
  characters,
  backgroundAssets,
  audioAssets,
  onSave,
  onCreateNextScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
  onBack,
  onPreview,
  onSaveAndPlay,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const documentColorScheme = 'light';
  const colors = useColors(documentColorScheme);
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';

  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [mountedSceneIds, setMountedSceneIds] = useState<Set<string>>(() =>
    seedMountedSceneIds(initialDocuments.map((ds) => ds.sceneId), sceneRecord.id),
  );

  const editorRefsRef = useRef(new Map<string, PlateWebViewEditorHandle>());
  const draftRegistryRef = useRef(new Map<string, PlateWebViewEditorSnapshot>());
  const sceneLayoutRef = useRef(new Map<string, { y: number; height: number }>());
  const mountedSceneIdsRef = useRef(mountedSceneIds);
  const documentScenesRef = useRef(documentScenes);
  const activeSceneIdRef = useRef(activeSceneId);
  const localCharactersRef = useRef(localCharacters);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const pendingScrollSceneIdRef = useRef<string | null>(sceneRecord.id);
  const recomputeScheduledRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const prevResetKeyRef = useRef(documentsResetKey);
  const prevRouteSceneIdRef = useRef(sceneRecord.id);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const nextActiveSceneId = routeSceneChanged ? sceneRecord.id : activeSceneId;
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    localCharactersRef.current = characters;
    setActiveSceneId(nextActiveSceneId);
    draftRegistryRef.current.clear();
    sceneLayoutRef.current.clear();
    editorRefsRef.current.clear();
    setMountedSceneIds(seedMountedSceneIds(initialDocuments.map((ds) => ds.sceneId), nextActiveSceneId));
    pendingScrollSceneIdRef.current = nextActiveSceneId;
  }, [activeSceneId, characters, dirtySceneIds, documentsResetKey, initialDocuments, sceneRecord.id]);

  const activeDocument = documentScenes.find((ds) => ds.sceneId === activeSceneId) ?? documentScenes[0];
  const activeSceneIndex = Math.max(0, scenes.findIndex((scene) => scene.id === activeSceneId));

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

    // Anti-jump: if a scene fully above the current scroll position changed
    // height (e.g. its iframe resized after mounting), shift the scroll
    // offset by the same delta so on-screen content doesn't visibly move.
    if (prev && prev.height !== height && y < scrollYRef.current) {
      const delta = height - prev.height;
      if (delta !== 0) {
        const nextScrollY = Math.max(0, scrollYRef.current + delta);
        scrollYRef.current = nextScrollY;
        scrollViewRef.current?.scrollTo({ y: nextScrollY, animated: false });
      }
    }

    if (pendingScrollSceneIdRef.current === sceneId) {
      pendingScrollSceneIdRef.current = null;
      scrollYRef.current = y;
      scrollViewRef.current?.scrollTo({ y, animated: false });
    }

    scheduleMountRecompute();
  }, [scheduleMountRecompute]);

  const getOnChange = useSceneCallback(handlePlateChangeImpl);
  const getOnCreateNextScene = useSceneCallback(handleCreateNextSceneImpl);
  const getRegisterEditorRef = useSceneCallback(registerEditorRefImpl);
  const getOnFrameLayout = useSceneCallback(handleFrameLayoutImpl);

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
    }
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
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
        onSave={handleSave}
        onSaveAndPlay={handleSaveAndPlay}
      />

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone ? (
          <DocumentSceneSidebar
            activeSceneId={activeSceneId}
            colorScheme={documentColorScheme}
            dirtySceneIds={dirtySceneIds}
            scenes={scenes}
            onScenePress={handleScenePress}
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
            gap: isPhone ? 18 : 34,
          }}
          keyboardShouldPersistTaps="handled"
          onLayout={handleViewportLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {documentScenes.map((documentScene) => (
            <DocumentSceneFrame
              key={documentScene.sceneId}
              scene={documentScene}
              editorId={`vn-plate-${storyId}-${documentScene.sceneId}`}
              characters={localCharacters}
              backgroundAssets={backgroundAssets}
              audioAssets={audioAssets}
              isPhone={isPhone}
              isMounted={mountedSceneIds.has(documentScene.sceneId)}
              cachedHeight={sceneLayoutRef.current.get(documentScene.sceneId)?.height}
              onChange={getOnChange(documentScene.sceneId)}
              onCreateNextScene={getOnCreateNextScene(documentScene.sceneId)}
              onUploadBackgroundAsset={onUploadBackgroundAsset}
              onUploadAudioAsset={onUploadAudioAsset}
              registerEditorRef={getRegisterEditorRef(documentScene.sceneId)}
              onFrameLayout={getOnFrameLayout(documentScene.sceneId)}
            />
          ))}
        </ScrollView>

        {!isPhone ? (
          <DocumentInspectorPanel colorScheme={documentColorScheme} scene={activeDocument ?? null} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
