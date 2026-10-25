import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { DocumentInspectorPanel } from '@/components/document-editor/DocumentInspectorPanel';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import type { CaptureEditorContext } from '@/lib/ai/editor-context-capture';
import { getAiPlatformSupport } from '@/lib/ai/platform-support';
import type { ColorScheme } from '@/constants/theme';
import type { Character } from '@/lib/character-types';
import type { SceneRef } from '@/components/document-editor/inspector/SceneFactsCard';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { SceneComicSettings } from '@/lib/engine/types';
import { useAiChatStore } from '@/stores/ai-chat-store';

type RightRailTab = 'inspector' | 'ai';

interface DocumentRightRailProps {
  colorScheme?: ColorScheme;
  scene: DocumentScene | null;
  storyId: string;
  activeSceneId: string | null;
  /** Character library the preview resolves sprites from. */
  characters: Character[];
  /** Scene id/name pairs so the inspector can name this scene's destinations. */
  storyScenes: SceneRef[];
  onOpenScene?: (sceneId: string) => void;
  /** The scene's comic settings, from its record: the Preview draws the scene as it is read, with its edits. */
  comicSettings?: SceneComicSettings;
  /**
   * Save barrier. AI mutations compare revisions against the store, so the
   * editor's unsaved draft has to land there first or every staleness guard is
   * a false negative. Required, not optional: a mount that forgets it would
   * silently run mutations against a state the author has already moved past.
   */
  beforeStoryMutation: () => Promise<boolean>;
  /** Reads the open scene and the author's selection for the assistant; see the editor. */
  captureEditorContext: CaptureEditorContext;
}

export function DocumentRightRail({
  colorScheme,
  scene,
  storyId,
  activeSceneId,
  characters,
  storyScenes,
  onOpenScene,
  comicSettings,
  beforeStoryMutation,
  captureEditorContext,
}: DocumentRightRailProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [tab, setTab] = useState<RightRailTab>('inspector');
  const aiSupport = getAiPlatformSupport();
  // The session stays up while the inspector is shown, so a proposal can
  // arrive, or go on waiting, behind a tab the author is not looking at.
  const proposalWaiting = useAiChatStore((state) => state.pendingInteraction?.storyId === storyId) && tab !== 'ai';
  const tabs: RightRailTab[] = aiSupport.supported ? ['inspector', 'ai'] : ['inspector'];

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
        {tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            accessibilityRole="tab"
            accessibilityLabel={item === 'ai' && proposalWaiting ? t('document.rightRail.aiWaiting') : undefined}
            style={{
              flex: 1,
              minHeight: 34,
              flexDirection: 'row',
              gap: 6,
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
            {item === 'ai' && proposalWaiting ? (
              <View testID="ai-tab-waiting" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
            ) : null}
          </Pressable>
        ))}
      </View>

      {!aiSupport.supported ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {aiSupport.reason === 'unsupported-native'
              ? 'The local AI assistant is available in the desktop web editor.'
              : 'The local AI assistant is available only when the editor is opened from localhost.'}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === 'inspector' ? (
          <DocumentInspectorPanel
            colorScheme={colorScheme}
            scene={scene}
            storyId={storyId}
            characters={characters}
            storyScenes={storyScenes}
            onOpenScene={onOpenScene}
            comicSettings={comicSettings}
          />
        ) : (
          <AiChatPanel
            storyId={storyId}
            activeSceneId={activeSceneId}
            colorScheme={colorScheme}
            beforeStoryMutation={beforeStoryMutation}
            captureEditorContext={captureEditorContext}
          />
        )}
      </View>
    </View>
  );
}
