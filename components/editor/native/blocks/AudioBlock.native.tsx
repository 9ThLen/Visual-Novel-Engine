import React from 'react';
import { Text, View } from 'react-native';

import type { MusicNode, SoundNode } from '@/lib/scene-document/sceneTypes';

export function AudioBlock({ node }: { node: MusicNode | SoundNode }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: '#BE123C', fontWeight: '800' }}>{node.type} {node.action}</Text>
      <Text style={{ color: '#111827' }}>{node.assetId || 'no asset'}</Text>
    </View>
  );
}
