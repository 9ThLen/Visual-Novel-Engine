import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveAssetUri } from '@/lib/asset-resolver';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateBackgroundAsset, VNPlateEditorMessage } from '@/lib/vn-plate-editor/types';
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

export interface PlateWebViewEditorSnapshot {
  scene: DocumentScene;
  characters: Character[];
}

export interface PlateWebViewEditorHandle {
  flush: () => Promise<PlateWebViewEditorSnapshot>;
}

interface PlateWebViewEditorProps {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  isPhone: boolean;
  style?: StyleProp<ViewStyle>;
  onChange: (scene: DocumentScene, characters: Character[]) => void;
  onCreateNextScene?: (scene: DocumentScene, characters: Character[]) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
}

export const PlateWebViewEditor = forwardRef<PlateWebViewEditorHandle, PlateWebViewEditorProps>(function PlateWebViewEditor({
  editorId,
  scene,
  characters,
  backgroundAssets,
  isPhone,
  style,
  onChange,
  onCreateNextScene,
  onUploadBackgroundAsset,
}: PlateWebViewEditorProps, ref) {
  const minimumFrameHeight = isPhone ? MIN_PHONE_FRAME_HEIGHT : MIN_FRAME_HEIGHT;
  const [frameHeight, setFrameHeight] = useState(minimumFrameHeight);
  const [resolvedBackgroundAssets, setResolvedBackgroundAssets] = useState(backgroundAssets);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sceneRef = useRef(scene);
  const charactersRef = useRef(characters);
  const latestSnapshotRef = useRef<PlateWebViewEditorSnapshot>({ scene, characters });
  const pendingFlushesRef = useRef(new Map<string, {
    resolve: (snapshot: PlateWebViewEditorSnapshot) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const html = useMemo(
    () => createVNPlateEditorHtml({ editorId, scene, characters, backgroundAssets, isPhone }),
    // Keep iframe srcDoc stable while live scene/character changes flow through postMessage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorId, isPhone],
  );

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

  const postBackgroundAssets = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      source: 'vn-plate-host',
      editorId,
      type: 'backgroundAssetsUpdated',
      assets: resolvedBackgroundAssets,
    }, '*');
  }, [editorId, resolvedBackgroundAssets]);

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
  }), [editorId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VNPlateEditorMessage | string>) => {
      const message = typeof event.data === 'string'
        ? safeParseMessage(event.data)
        : event.data;
      if (message?.source !== 'vn-plate-editor' || message.editorId !== editorId) return;
      if (message.type === 'resize') {
        if (Number.isFinite(message.height) && message.height > 0) {
          setFrameHeight((current) => {
            const next = Math.max(minimumFrameHeight, Math.ceil(message.height));
            return next === current ? current : next;
          });
        }
        return;
      }
      if (message.type === 'ready') {
        postBackgroundAssets();
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
  }, [editorId, minimumFrameHeight, onChange, onCreateNextScene, onUploadBackgroundAsset, postBackgroundAssets]);

  return (
    <View style={[{ alignSelf: 'stretch', overflow: 'visible' }, style, { height: frameHeight }]}>
      <Iframe
        ref={iframeRef}
        key={editorId}
        title="VN Plate editor"
        srcDoc={html}
        onLoad={postBackgroundAssets}
        style={{
          width: '100%',
          height: frameHeight,
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
