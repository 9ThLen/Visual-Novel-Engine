import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useColors } from '@/hooks/use-colors';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { withAlpha } from '@/lib/_core/theme';
import type { ColorScheme } from '@/constants/theme';
import type { BackgroundBlockData } from '@/lib/engine/types';
import type { DocumentBlock, DocumentScene, DocumentTechnicalBlock } from '@/lib/document-editor/types';

type InspectorTab = 'block' | 'scene' | 'issues';

interface DocumentInspectorPanelProps {
  colorScheme?: ColorScheme;
  scene: DocumentScene | null;
}

export function DocumentInspectorPanel({ colorScheme, scene }: DocumentInspectorPanelProps) {
  const colors = useColors(colorScheme);
  const [tab, setTab] = useState<InspectorTab>('scene');
  const backgroundBlock = useMemo(() => {
    return scene?.blocks.find(
      (block): block is DocumentTechnicalBlock =>
        block.kind === 'technical' && block.blockType === 'background',
    ) ?? null;
  }, [scene]);
  const backgroundData = backgroundBlock?.step.data as BackgroundBlockData | undefined;
  const issues = useMemo(() => collectIssues(scene), [scene]);

  return (
    <View
      style={{
        width: 360,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
        backgroundColor: colors['surface-1'],
      }}
    >
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
        <View>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '800', marginBottom: 10 }}>
            Preview
          </Text>
          <View
            style={{
              height: 134,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
              backgroundColor: colors.surface,
            }}
          >
            <ResolvedBackgroundPreview assetId={backgroundData?.assetId ?? null} colorScheme={colorScheme} />
            <View
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 7,
                backgroundColor: withAlpha('#ffffff', 0.82),
              }}
            >
              <Text numberOfLines={2} style={{ color: '#111827', fontSize: 12, lineHeight: 16, fontWeight: '600' }}>
                {firstReadableText(scene) || 'No preview text yet.'}
              </Text>
            </View>
          </View>
        </View>

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
          <SceneInfo scene={scene} backgroundData={backgroundData} colors={colors} />
        ) : null}
        {tab === 'block' ? (
          <BlockList scene={scene} colors={colors} />
        ) : null}
        {tab === 'issues' ? (
          <IssuesList issues={issues} colors={colors} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function SceneInfo({
  scene,
  backgroundData,
  colors,
}: {
  scene: DocumentScene | null;
  backgroundData?: BackgroundBlockData;
  colors: ReturnType<typeof useColors>;
}) {
  const structure = sceneStructure(scene);
  return (
    <View style={{ gap: 14 }}>
      <View>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800' }}>
          {scene?.sceneName || 'Untitled scene'}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
          {scene ? `${scene.blocks.length} blocks` : 'No scene loaded'}
        </Text>
      </View>

      <View>
        <Text style={labelStyle(colors)}>Scene structure</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
          {structure.map((item) => (
            <Badge key={item} text={item} colors={colors} />
          ))}
        </View>
      </View>

      <View>
        <Text style={labelStyle(colors)}>Background</Text>
        <InfoCard
          title={backgroundData?.assetId ? backgroundData.assetId : 'No background selected'}
          subtitle={backgroundData ? `${backgroundData.transition} · ${backgroundData.duration}ms` : 'Add /background to the scene.'}
          colors={colors}
        />
      </View>
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

function ResolvedBackgroundPreview({ assetId, colorScheme }: { assetId: string | null; colorScheme?: ColorScheme }) {
  const colors = useColors(colorScheme);
  const [source, setSource] = useState<number | { uri: string } | null>(null);

  useEffect(() => {
    let active = true;
    if (!assetId) {
      setSource(null);
      return () => {
        active = false;
      };
    }

    resolveAssetUri(assetId)
      .then((resolved) => {
        if (!active) return;
        setSource(resolved ? (typeof resolved === 'number' ? resolved : { uri: resolved }) : null);
      })
      .catch(() => {
        if (active) setSource(null);
      });

    return () => {
      active = false;
    };
  }, [assetId]);

  if (!source) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{assetId ? 'Loading background...' : 'No background'}</Text>
      </View>
    );
  }

  return <Image source={source} style={{ flex: 1 }} contentFit="cover" cachePolicy="memory-disk" />;
}

function Badge({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>{text}</Text>
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

function labelStyle(colors: ReturnType<typeof useColors>) {
  return { color: colors.foreground, fontSize: 13, fontWeight: '800' as const };
}

function sceneStructure(scene: DocumentScene | null): string[] {
  if (!scene) return [];
  const counts = new Map<string, number>();
  for (const block of scene.blocks) {
    const label = block.kind === 'technical' ? block.blockType : block.kind;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) => `${label}${count > 1 ? ` x${count}` : ''}`);
}

function firstReadableText(scene: DocumentScene | null): string {
  if (!scene) return '';
  for (const block of scene.blocks) {
    if (block.kind === 'text' && block.content.trim()) return block.content.trim();
    if (block.kind === 'dialogue' && block.text.trim()) return `${block.speakerName}: ${block.text}`.trim();
    if (block.kind === 'choice' && block.question.trim()) return block.question.trim();
  }
  return '';
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
