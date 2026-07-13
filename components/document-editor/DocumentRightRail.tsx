import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { DocumentInspectorPanel } from '@/components/document-editor/DocumentInspectorPanel';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import type { ColorScheme } from '@/constants/theme';
import type { DocumentScene } from '@/lib/document-editor/types';

type RightRailTab = 'inspector' | 'ai';

interface DocumentRightRailProps {
  colorScheme?: ColorScheme;
  scene: DocumentScene | null;
  storyId: string;
  activeSceneId: string | null;
}

export function DocumentRightRail({ colorScheme, scene, storyId, activeSceneId }: DocumentRightRailProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [tab, setTab] = useState<RightRailTab>('inspector');

  return (
    <View
      style={{
        width: 360,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
        backgroundColor: colors['surface-1'],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 7,
          padding: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {(['inspector', 'ai'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={{
              flex: 1,
              minHeight: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 7,
              borderWidth: 1,
              borderColor: tab === item ? colors.primary : colors.border,
              backgroundColor: tab === item ? withAlpha(colors.primary, 0.12) : colors.background,
            }}
          >
            <Text
              style={{
                color: tab === item ? colors.primary : colors.foreground,
                fontSize: 12,
                fontWeight: '800',
              }}
            >
              {item === 'inspector' ? t('document.rightRail.inspector') : t('document.rightRail.ai')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'inspector' ? (
          <DocumentInspectorPanel colorScheme={colorScheme} scene={scene} />
        ) : (
          <AiChatPanel storyId={storyId} activeSceneId={activeSceneId} colorScheme={colorScheme} />
        )}
      </View>
    </View>
  );
}
