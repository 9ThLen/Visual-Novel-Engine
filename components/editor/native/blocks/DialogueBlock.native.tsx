import React from 'react';
import { Text, View } from 'react-native';

import { getCharacterColor } from '@/lib/scene-document/characterColor';
import type { DialogueNode } from '@/lib/scene-document/sceneTypes';

export function DialogueBlock({ node }: { node: DialogueNode }) {
  const color = node.color ?? getCharacterColor(node.characterName);

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color, fontWeight: '800' }}>{node.characterName || 'Character'}</Text>
      <Text style={{ color: '#111827', fontSize: 15, lineHeight: 22 }}>{node.text}</Text>
    </View>
  );
}
