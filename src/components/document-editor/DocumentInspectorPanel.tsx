import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScenePreviewCard } from '@/components/document-editor/inspector/ScenePreviewCard';
import { ScenePreviewOverlay } from '@/components/document-editor/inspector/ScenePreviewOverlay';
import { SceneFactsCard, type SceneRef } from '@/components/document-editor/inspector/SceneFactsCard';
import { INSPECTOR_RAIL_PADDING, INSPECTOR_RAIL_WIDTH } from '@/components/document-editor/inspector/rail-metrics';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { buildPreviewFrames } from '@/lib/document-editor/preview-frames';
import { sanitizeReaderLayoutPreset } from '@/lib/story-theme';
import { useAppStore } from '@/stores/use-app-store';
import { useEditorPreviewDevice } from '@/components/document-editor/inspector/useEditorPreviewDevice';
import type { ColorScheme } from '@/constants/theme';
import type { Character } from '@/lib/character-types';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';

type InspectorTab = 'block' | 'scene' | 'issues';

interface DocumentInspectorPanelProps {
  colorScheme?: ColorScheme;
  scene: DocumentScene | null;
  storyId: string;
  characters: Character[];
  storyScenes: SceneRef[];
  onOpenScene?: (sceneId: string) => void;
}

export function DocumentInspectorPanel({
  colorScheme,
  scene,
  storyId,
  characters,
  storyScenes,
  onOpenScene,
}: DocumentInspectorPanelProps) {
  const colors = useColors(colorScheme);
  const [tab, setTab] = useState<InspectorTab>('scene');
  const [device, setDevice] = useEditorPreviewDevice();
  const [frameIndex, setFrameIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const layoutPreset = useAppStore((state) =>
    sanitizeReaderLayoutPreset(state.storiesMetadata.find((story) => story.id === storyId)?.readerLayoutPreset),
  );
  const textSize = useAppStore((state) => state.settings.textSize);
  const readerFontScale = useAppStore((state) => state.settings.readerFontScale);
  const readerLineHeightScale = useAppStore((state) => state.settings.readerLineHeightScale);
  const readerSettings = useMemo(
    () => ({ textSize, readerFontScale, readerLineHeightScale }),
    [textSize, readerFontScale, readerLineHeightScale],
  );

  // Rebuilt on every keystroke in the editor, so it stays keyed to the scene
  // object identity the editor already replaces per edit.
  const frames = useMemo(() => buildPreviewFrames(scene, characters), [scene, characters]);
  const issues = useMemo(() => collectIssues(scene), [scene]);

  // Typing can shorten the scene under the stepper; clamp instead of resetting
  // so the author keeps their place.
  useEffect(() => {
    setFrameIndex((current) => Math.min(current, Math.max(0, frames.length - 1)));
  }, [frames.length]);

  return (
    <View
      style={{
        width: INSPECTOR_RAIL_WIDTH,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
        backgroundColor: colors['surface-1'],
      }}
    >
      <ScrollView contentContainerStyle={{ padding: INSPECTOR_RAIL_PADDING, gap: 16 }}>
        <ScenePreviewCard
          colorScheme={colorScheme}
          frames={frames}
          storyId={storyId}
          device={device}
          onSelectDevice={setDevice}
          layoutPreset={layoutPreset}
          settings={readerSettings}
          frameIndex={frameIndex}
          onFrameIndexChange={setFrameIndex}
          onExpand={frames.length ? () => setExpanded(true) : undefined}
        />

        <View>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
            Properties
          </Text>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {(['block', 'scene', 'issues'] as const).map((item) => (
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
                <Text style={{ color: tab === item ? colors.primary : colors.foreground, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {tab === 'scene' ? (
          <SceneFactsCard
            scene={scene}
            frames={frames}
            storyScenes={storyScenes}
            onOpenScene={onOpenScene}
            colors={colors}
          />
        ) : null}
        {tab === 'block' ? (
          <BlockList scene={scene} colors={colors} />
        ) : null}
        {tab === 'issues' ? (
          <IssuesList issues={issues} colors={colors} />
        ) : null}
      </ScrollView>

      {expanded ? (
        <ScenePreviewOverlay
          onClose={() => setExpanded(false)}
          frames={frames}
          storyId={storyId}
          device={device}
          onSelectDevice={setDevice}
          layoutPreset={layoutPreset}
          settings={readerSettings}
          colorScheme={colorScheme}
          frameIndex={frameIndex}
          onFrameIndexChange={setFrameIndex}
        />
      ) : null}
    </View>
  );
}

function BlockList({ scene, colors }: { scene: DocumentScene | null; colors: ReturnType<typeof useColors> }) {
  const blocks = scene?.blocks ?? [];
  return (
    <View style={{ gap: 7 }}>
      {blocks.map((block, index) => (
        <InfoCard
          key={block.id}
          title={`${index + 1}. ${blockLabel(block)}`}
          subtitle={blockSubtitle(block)}
          colors={colors}
        />
      ))}
    </View>
  );
}

function IssuesList({ issues, colors }: { issues: string[]; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {issues.length} issues
      </Text>
      {issues.length ? issues.map((issue) => (
        <InfoCard key={issue} title="Warning" subtitle={issue} colors={colors} tone="warning" />
      )) : (
        <InfoCard title="No issues" subtitle="Scene is ready for preview." colors={colors} />
      )}
    </View>
  );
}

function InfoCard({
  title,
  subtitle,
  colors,
  tone,
}: {
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useColors>;
  tone?: 'warning';
}) {
  const borderColor = tone === 'warning' ? '#d97706' : colors.border;
  const backgroundColor = tone === 'warning' ? '#fffbeb' : colors.background;
  return (
    <View style={{ borderWidth: 1, borderColor, backgroundColor, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>{title}</Text>
      <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 3 }}>{subtitle}</Text>
    </View>
  );
}

function blockLabel(block: DocumentBlock): string {
  if (block.kind === 'technical') return block.blockType;
  return block.kind;
}

function blockSubtitle(block: DocumentBlock): string {
  if (block.kind === 'text') return block.content.trim() || 'Draft text';
  if (block.kind === 'dialogue') return `${block.speakerName || 'Character'}: ${block.text || '...'}`;
  if (block.kind === 'choice') return `${block.question || 'Choice'} · ${block.options.length} options`;
  return block.summary || block.label || block.commandId;
}

function collectIssues(scene: DocumentScene | null): string[] {
  if (!scene) return ['No scene loaded.'];
  const issues: string[] = [];
  const hasBackground = scene.blocks.some((block) => block.kind === 'technical' && block.blockType === 'background');
  if (!hasBackground) issues.push('Choose a background.');
  const hasText = scene.blocks.some((block) => {
    if (block.kind === 'text') return Boolean(block.content.trim());
    if (block.kind === 'dialogue') return Boolean(block.text.trim());
    if (block.kind === 'choice') return block.options.length > 0;
    return false;
  });
  if (!hasText) issues.push('Add story text or dialogue.');
  return issues;
}
