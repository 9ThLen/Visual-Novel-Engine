import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/hooks/use-i18n';
import { resolveAssetUri, resolvePlayableAssetUri } from '@/lib/asset-resolver';
import { getEmbeddedCommands } from '@/lib/vn-plate-editor/embedded-commands';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { getSharedEditorAssets } from '@/lib/vn-plate-editor/shared-assets';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateBranchInfo, VNPlateEditorMessage, VNPlateFormatCommand, VNPlateFormatState, VNPlateSceneRef } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';

const Iframe = 'iframe' as unknown as React.ComponentType<{
  srcDoc: string;
  title: string;
  style: React.CSSProperties;
  ref?: React.Ref<HTMLIFrameElement>;
  onLoad?: () => void;
}>;

const MIN_FRAME_HEIGHT = 760;
const MIN_PHONE_FRAME_HEIGHT = 640;
const FLUSH_TIMEOUT_MS = 800;

export function getMinFrameHeight(isPhone: boolean): number {
  return isPhone ? MIN_PHONE_FRAME_HEIGHT : MIN_FRAME_HEIGHT;
}

export interface PlateWebViewEditorSnapshot {
  scene: DocumentScene;
  characters: Character[];
}

export interface PlateWebViewEditorHandle {
  flush: () => Promise<PlateWebViewEditorSnapshot>;
  undo: () => void;
  redo: () => void;
  formatText: (command: VNPlateFormatCommand, value?: string) => void;
}

interface PlateWebViewEditorProps {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  audioAssets: VNPlateAudioAsset[];
  /** All scenes of the story (id + name) for transition target pickers. */
  scenes?: VNPlateSceneRef[];
  /** Branch info for choice blocks on the active path (branch switcher). */
  branchInfo?: VNPlateBranchInfo[];
  /** Accent color of the branch this scene belongs to; tints the page shadow inside the webview. */
  branchColor?: string;
  isPhone: boolean;
  /** Seeds the initial frame height (e.g. from a cached layout) to avoid a visible collapse/expand jump on remount. */
  initialHeight?: number;
  style?: StyleProp<ViewStyle>;
  onChange: (scene: DocumentScene, characters: Character[]) => void;
  onCreateNextScene?: (scene: DocumentScene, characters: Character[]) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
  onOverlayActiveChange?: (active: boolean) => void;
  onHistoryStateChange?: (canUndo: boolean, canRedo: boolean) => void;
  onFormatStateChange?: (state: VNPlateFormatState) => void;
  /** The author asked to switch the rendered branch of a choice block. */
  onSelectChoiceOption?: (choiceStepId: string, optionId: string) => void;
  /** The author asked to create a new scene as the target of an empty choice option. */
  onStartBranchOption?: (choiceStepId: string, optionId: string) => void;
}

export const PlateWebViewEditor = forwardRef<PlateWebViewEditorHandle, PlateWebViewEditorProps>(function PlateWebViewEditor({
  editorId,
  scene,
  characters,
  backgroundAssets,
  audioAssets,
  scenes,
  branchInfo,
  branchColor,
  isPhone,
  initialHeight,
  style,
  onChange,
  onCreateNextScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
  onOverlayActiveChange,
  onHistoryStateChange,
  onFormatStateChange,
  onSelectChoiceOption,
  onStartBranchOption,
}: PlateWebViewEditorProps, ref) {
  const { language } = useI18n();
  const minimumFrameHeight = isPhone ? MIN_PHONE_FRAME_HEIGHT : MIN_FRAME_HEIGHT;
  const initialFrameHeight = initialHeight && initialHeight > minimumFrameHeight ? initialHeight : minimumFrameHeight;
  const [frameHeight, setFrameHeight] = useState(initialFrameHeight);
  const [visibleFrameHeight, setVisibleFrameHeight] = useState(initialFrameHeight);
  const [resolvedBackgroundAssets, setResolvedBackgroundAssets] = useState(backgroundAssets);
  const [resolvedAudioAssets, setResolvedAudioAssets] = useState(audioAssets);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sceneRef = useRef(scene);
  const charactersRef = useRef(characters);
  const latestSnapshotRef = useRef<PlateWebViewEditorSnapshot>({ scene, characters });
  const pendingFlushesRef = useRef(new Map<string, {
    resolve: (snapshot: PlateWebViewEditorSnapshot) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  // Safety net for the shared-script path: if the boot script never reports
  // 'ready' (e.g. a strict CSP blocking blob: URLs), rebuild the frame with
  // the fully inlined srcDoc instead of leaving a dead editor.
  const [forceInlineHtml, setForceInlineHtml] = useState(false);
  const readyRef = useRef(false);
  const html = useMemo(
    () => {
      const shared = forceInlineHtml ? null : getSharedEditorAssets();
      // On a fallback rebuild, seed from the latest snapshot refs so edits
      // made before the rebuild are not lost.
      const currentScene = sceneRef.current ?? scene;
      const currentCharacters = charactersRef.current ?? characters;
      return createVNPlateEditorHtml(
        { editorId, scene: currentScene, characters: currentCharacters, backgroundAssets, audioAssets, scenes, isPhone, language },
        shared ?? undefined,
      );
    },
    // Keep iframe srcDoc stable while live scene/character changes flow through postMessage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorId, isPhone, forceInlineHtml],
  );

  useEffect(() => {
    if (forceInlineHtml || !getSharedEditorAssets()) return;
    const timer = setTimeout(() => {
      if (!readyRef.current) setForceInlineHtml(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [forceInlineHtml]);

  useEffect(() => {
    sceneRef.current = scene;
    latestSnapshotRef.current = {
      scene,
      characters: charactersRef.current,
    };
  }, [scene]);

  useEffect(() => {
    charactersRef.current = characters;
    latestSnapshotRef.current = {
      scene: sceneRef.current,
      characters,
    };
  }, [characters]);

  useEffect(() => {
    const pendingFlushes = pendingFlushesRef.current;
    return () => {
      pendingFlushes.forEach((pending) => {
        clearTimeout(pending.timer);
        pending.resolve(latestSnapshotRef.current);
      });
      pendingFlushes.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      backgroundAssets.map(async (asset) => {
        const resolved = await resolveAssetUri(asset.uri);
        return {
          ...asset,
          uri: typeof resolved === 'string' ? resolved : asset.uri,
        };
      }),
    ).then((assets) => {
      if (!cancelled) setResolvedBackgroundAssets(assets);
    });

    return () => {
      cancelled = true;
    };
  }, [backgroundAssets]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      audioAssets.map(async (asset) => {
        const resolved = await resolvePlayableAssetUri(asset.uri);
        return {
          ...asset,
          uri: resolved ?? asset.uri,
        };
      }),
    ).then((assets) => {
      if (!cancelled) setResolvedAudioAssets(assets);
    });

    return () => {
      cancelled = true;
    };
  }, [audioAssets]);

  const postBackgroundAssets = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'backgroundAssetsUpdated',
      assets: resolvedBackgroundAssets,
    }, '*');
  }, [editorId, resolvedBackgroundAssets]);

  const postAudioAssets = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'audioAssetsUpdated',
      assets: resolvedAudioAssets,
    }, '*');
  }, [editorId, resolvedAudioAssets]);

  const postScenes = useCallback(() => {
    if (!scenes) return;
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'scenesUpdated',
      scenes,
    }, '*');
  }, [editorId, scenes]);

  const postBranchInfo = useCallback(() => {
    if (!branchInfo) return;
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'branchInfoUpdated',
      branchInfo,
    }, '*');
  }, [branchInfo, editorId]);

  useEffect(() => {
    postBranchInfo();
  }, [postBranchInfo]);

  const postBranchColor = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'branchColorUpdated',
      color: branchColor ?? null,
    }, '*');
  }, [branchColor, editorId]);

  useEffect(() => {
    postBranchColor();
  }, [postBranchColor]);

  const postCommands = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'commandsUpdated',
      commands: getEmbeddedCommands(language),
    }, '*');
  }, [editorId, language]);

  useEffect(() => {
    postScenes();
  }, [postScenes]);

  useEffect(() => {
    postCommands();
  }, [postCommands]);

  const postCharacters = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'charactersUpdated',
      characters,
    }, '*');
  }, [characters, editorId]);

  useEffect(() => {
    postBackgroundAssets();
  }, [postBackgroundAssets]);

  useEffect(() => {
    postAudioAssets();
  }, [postAudioAssets]);

  useEffect(() => {
    postCharacters();
  }, [postCharacters]);

  useImperativeHandle(ref, () => ({
    flush: () => {
      const requestId = `${editorId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise<PlateWebViewEditorSnapshot>((resolve) => {
        const timer = setTimeout(() => {
          pendingFlushesRef.current.delete(requestId);
          resolve(latestSnapshotRef.current);
        }, FLUSH_TIMEOUT_MS);
        pendingFlushesRef.current.set(requestId, { resolve, timer });
        iframeRef.current?.contentWindow?.postMessage({
          source: 'vn-plate-host',
          editorId,
          type: 'flush',
          requestId,
        }, '*');
      });
    },
    undo: () => iframeRef.current?.contentWindow?.postMessage({ source: 'vn-plate-host', editorId, type: 'undo' }, '*'),
    redo: () => iframeRef.current?.contentWindow?.postMessage({ source: 'vn-plate-host', editorId, type: 'redo' }, '*'),
    formatText: (command, value) => iframeRef.current?.contentWindow?.postMessage({ source: 'vn-plate-host', editorId, type: 'formatText', command, value }, '*'),
  }), [editorId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VNPlateEditorMessage | string>) => {
      const message = typeof event.data === 'string'
        ? safeParseMessage(event.data)
        : event.data;
      if (message?.source !== 'vn-plate-editor' || message.editorId !== editorId) return;
      if (message.type === 'resize') {
        if (Number.isFinite(message.height) && message.height > 0) {
          const overlayHeight = typeof message.overlayHeight === 'number'
            && Number.isFinite(message.overlayHeight)
            && message.overlayHeight > 0
            ? message.overlayHeight
            : message.height;
          setFrameHeight((current) => {
            const next = Math.max(minimumFrameHeight, Math.ceil(message.height));
            return next === current ? current : next;
          });
          setVisibleFrameHeight((current) => {
            const next = Math.max(minimumFrameHeight, Math.ceil(message.height), Math.ceil(overlayHeight));
            return next === current ? current : next;
          });
        }
        return;
      }
      if (message.type === 'ready') {
        readyRef.current = true;
        postBackgroundAssets();
        postAudioAssets();
        postCommands();
        postScenes();
        postBranchInfo();
        postBranchColor();
        return;
      }
      if (message.type === 'historyState') {
        onHistoryStateChange?.(message.canUndo, message.canRedo);
        return;
      }
      if (message.type === 'formatState') {
        onFormatStateChange?.(message.state);
        return;
      }
      if (message.type === 'selectChoiceOption') {
        onSelectChoiceOption?.(message.choiceStepId, message.optionId);
        return;
      }
      if (message.type === 'startBranchOption') {
        onStartBranchOption?.(message.choiceStepId, message.optionId);
        return;
      }
      if (message.type === 'uploadBackgroundAsset') {
        void onUploadBackgroundAsset?.(message.name, message.dataUri).then((asset) => {
          if (!asset) return;
          iframeRef.current?.contentWindow?.postMessage({
            source: 'vn-plate-host',
            editorId,
            type: 'backgroundAssetUploaded',
            asset,
          }, '*');
        });
        return;
      }
      if (message.type === 'uploadAudioAsset') {
        void onUploadAudioAsset?.(message.name, message.dataUri).then(async (asset) => {
          if (!asset) return;
          const resolved = await resolvePlayableAssetUri(asset.uri);
          iframeRef.current?.contentWindow?.postMessage({
            source: 'vn-plate-host',
            editorId,
            type: 'audioAssetUploaded',
            asset: {
              ...asset,
              uri: resolved ?? asset.uri,
            },
          }, '*');
        });
        return;
      }
      if (message.type === 'flushed') {
        const incomingCharacters = Array.isArray(message.characters)
          ? message.characters
          : charactersRef.current;
        const normalized = normalizePlateDocumentScene(message.scene, incomingCharacters);
        latestSnapshotRef.current = normalized;
        sceneRef.current = normalized.scene;
        charactersRef.current = normalized.characters;
        const pending = pendingFlushesRef.current.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingFlushesRef.current.delete(message.requestId);
          pending.resolve(normalized);
        }
        return;
      }
      if (message.type !== 'save' && message.type !== 'createNextScene') return;

      const incomingCharacters = 'characters' in message && Array.isArray(message.characters)
        ? message.characters
        : charactersRef.current;
      const normalized = normalizePlateDocumentScene(message.scene, incomingCharacters);
      if (message.type === 'createNextScene') {
        latestSnapshotRef.current = normalized;
        sceneRef.current = normalized.scene;
        charactersRef.current = normalized.characters;
        onCreateNextScene?.(normalized.scene, normalized.characters);
        return;
      }
      latestSnapshotRef.current = normalized;
      sceneRef.current = normalized.scene;
      charactersRef.current = normalized.characters;
      onChange(normalized.scene, normalized.characters);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editorId, minimumFrameHeight, onChange, onCreateNextScene, onFormatStateChange, onHistoryStateChange, onSelectChoiceOption, onStartBranchOption, onUploadAudioAsset, onUploadBackgroundAsset, postAudioAssets, postBackgroundAssets, postBranchColor, postBranchInfo, postCommands, postScenes]);

  const postAssets = useCallback(() => {
    postBackgroundAssets();
    postAudioAssets();
    postCommands();
    postScenes();
  }, [postAudioAssets, postBackgroundAssets, postCommands, postScenes]);
  const hasOverlay = visibleFrameHeight > frameHeight + 1;

  useEffect(() => {
    onOverlayActiveChange?.(hasOverlay);
  }, [hasOverlay, onOverlayActiveChange]);

  return (
    <View
      style={[
        { alignSelf: 'stretch', overflow: 'visible', position: 'relative', zIndex: hasOverlay ? 40 : 0 },
        style,
        { height: frameHeight },
      ]}
    >
      <Iframe
        ref={iframeRef}
        key={editorId}
        title="VN Plate editor"
        srcDoc={html}
        onLoad={postAssets}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: hasOverlay ? 40 : 0,
          width: '100%',
          height: visibleFrameHeight,
          border: 0,
          background: 'transparent',
          display: 'block',
          overflow: 'visible',
        }}
      />
    </View>
  );
});

function safeParseMessage(value: string): VNPlateEditorMessage | null {
  try {
    return JSON.parse(value) as VNPlateEditorMessage;
  } catch {
    return null;
  }
}
