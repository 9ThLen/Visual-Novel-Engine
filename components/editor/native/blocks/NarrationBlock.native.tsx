import React from 'react';
import { Text, View } from 'react-native';

import type { NarrationNode } from '@/lib/scene-document/sceneTypes';

export function NarrationBlock({ node }: { node: NarrationNode }) {
  return (
    <View>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 22 }}>{node.text}</Text>
    </View>
  );
}
