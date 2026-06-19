import React from 'react';
import { Text, View } from 'react-native';

import type { ChoiceNode } from '@/lib/scene-document/sceneTypes';

export function ChoiceBlock({ node }: { node: ChoiceNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#7C2D12', fontWeight: '800' }}>{node.prompt || 'Choice'}</Text>
      {node.options.map((option, index) => (
        <Text key={option.id} style={{ color: '#111827' }}>
          {index + 1}. {option.label}
        </Text>
      ))}
    </View>
  );
}
