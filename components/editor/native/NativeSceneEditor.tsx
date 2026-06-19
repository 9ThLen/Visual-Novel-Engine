import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { parseSceneText } from '@/lib/scene-document/sceneParser';
import { serializeScene } from '@/lib/scene-document/sceneSerializer';
import { validateSceneNodes } from '@/lib/scene-document/sceneValidation';
import type { SceneDocument } from '@/lib/scene-document/sceneTypes';
import { NativeBlockPreview } from './NativeBlockPreview';
import { NativeEditorToolbar } from './NativeEditorToolbar';
import { NativeScriptInput } from './NativeScriptInput';

interface NativeSceneEditorProps {
  value: SceneDocument;
  onChange: (value: SceneDocument) => void;
  onCreateNextScene?: (value: SceneDocument) => void;
}

export function NativeSceneEditor({ value, onChange, onCreateNextScene }: NativeSceneEditorProps) {
  const [scriptText, setScriptText] = useState(() => serializeScene(value));

  const nodes = useMemo(() => parseSceneText(scriptText), [scriptText]);
  const issues = useMemo(() => validateSceneNodes(nodes), [nodes]);

  const commitText = (nextText: string) => {
    setScriptText(nextText);
    onChange({
      ...value,
      nodes: parseSceneText(nextText),
      metadata: {
        ...value.metadata,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const insertTemplate = (template: string) => {
    const separator = scriptText.trim().length > 0 && !scriptText.endsWith('\n') ? '\n' : '';
    commitText(`${scriptText}${separator}${template}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <NativeEditorToolbar
        onInsert={insertTemplate}
        onCreateNextScene={onCreateNextScene ? () => onCreateNextScene({
          ...value,
          nodes,
          metadata: {
            ...value.metadata,
            updatedAt: new Date().toISOString(),
          },
        }) : undefined}
      />
      <View style={{ flex: 1, gap: 14, padding: 12 }}>
        <NativeScriptInput value={scriptText} onChangeText={commitText} />
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: '#111827', fontSize: 16, fontWeight: '800' }}>Preview</Text>
          <NativeBlockPreview nodes={nodes} issues={issues} />
        </View>
      </View>
    </View>
  );
}
