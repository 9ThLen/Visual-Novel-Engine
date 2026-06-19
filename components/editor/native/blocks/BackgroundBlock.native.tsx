import React from 'react';
import { Text, View } from 'react-native';

import type { BackgroundNode } from '@/lib/scene-document/sceneTypes';

export function BackgroundBlock({ node }: { node: BackgroundNode }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: '#047857', fontWeight: '800' }}>Background</Text>
      <Text style={{ color: '#111827' }}>{node.assetId || 'missing asset'}</Text>
    </View>
  );
}
