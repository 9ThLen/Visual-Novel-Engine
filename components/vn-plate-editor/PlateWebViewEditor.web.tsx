import React, { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateEditorMessage } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';

const Iframe = 'iframe' as unknown as React.ComponentType<{
  srcDoc: string;
  title: string;
  style: React.CSSProperties;
}>;

interface PlateWebViewEditorProps {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  isPhone: boolean;
  style?: StyleProp<ViewStyle>;
  onChange: (scene: DocumentScene, characters: Character[]) => void;
  onCreateNextScene?: (scene: DocumentScene, characters: Character[]) => void;
}

export function PlateWebViewEditor({
  editorId,
  scene,
  characters,
  isPhone,
  style,
  onChange,
  onCreateNextScene,
}: PlateWebViewEditorProps) {
  const [frameHeight, setFrameHeight] = useState(isPhone ? 520 : 640);
  const html = useMemo(
    () => createVNPlateEditorHtml({ editorId, scene, characters, isPhone }),
    [characters, editorId, isPhone, scene.sceneId],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VNPlateEditorMessage | string>) => {
      const message = typeof event.data === 'string'
        ? safeParseMessage(event.data)
        : event.data;
      if (message?.source !== 'vn-plate-editor' || message.editorId !== editorId) return;
      if (message.type === 'resize') {
        if (Number.isFinite(message.height) && message.height > 0) {
          setFrameHeight((current) => Math.max(240, Math.ceil(message.height)) === current
            ? current
            : Math.max(240, Math.ceil(message.height)));
        }
        return;
      }
      if (message.type !== 'save' && message.type !== 'createNextScene') return;

      const normalized = normalizePlateDocumentScene(message.scene, characters);
      if (message.type === 'createNextScene') {
        onCreateNextScene?.(normalized.scene, normalized.characters);
        return;
      }
      onChange(normalized.scene, normalized.characters);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [characters, editorId, onChange, onCreateNextScene]);

  return (
    <View style={[{ alignSelf: 'stretch', overflow: 'visible' }, style, { height: frameHeight }]}>
      <Iframe
        key={scene.sceneId}
        title="VN Plate editor"
        srcDoc={html}
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
}

function safeParseMessage(value: string): VNPlateEditorMessage | null {
  try {
    return JSON.parse(value) as VNPlateEditorMessage;
  } catch {
    return null;
  }
}
