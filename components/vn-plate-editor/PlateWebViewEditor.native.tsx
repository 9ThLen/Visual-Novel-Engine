import React, { useCallback, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { normalizePlateDocumentScene } from '@/lib/vn-plate-editor/scene-normalizer';
import type { VNPlateEditorMessage } from '@/lib/vn-plate-editor/types';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';

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

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let message: VNPlateEditorMessage | null = null;
    try {
      message = JSON.parse(event.nativeEvent.data) as VNPlateEditorMessage;
    } catch {
      return;
    }

    if (message?.source !== 'vn-plate-editor' || message.editorId !== editorId) return;
    if (message.type !== 'save' && message.type !== 'createNextScene') return;

    const normalized = normalizePlateDocumentScene(message.scene, characters);
    if (message.type === 'createNextScene') {
      onCreateNextScene?.(normalized.scene, normalized.characters);
      return;
    }
    onChange(normalized.scene, normalized.characters);
  }, [characters, editorId, onChange, onCreateNextScene]);

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        key={scene.sceneId}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        onMessage={handleMessage}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
