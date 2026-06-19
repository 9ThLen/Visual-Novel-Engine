import React, { useEffect, useMemo } from 'react';
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
  const html = useMemo(
    () => createVNPlateEditorHtml({ editorId, scene, characters, isPhone }),
    [characters, editorId, isPhone, scene.sceneId],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<VNPlateEditorMessage>) => {
      const message = event.data;
      if (message?.source !== 'vn-plate-editor' || message.editorId !== editorId) return;
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
    <View style={[{ flex: 1 }, style]}>
      <Iframe
        key={scene.sceneId}
        title="VN Plate editor"
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          background: 'transparent',
          display: 'block',
        }}
      />
    </View>
  );
}
