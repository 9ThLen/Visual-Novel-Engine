import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import {
  buildAssetUsageReport,
  collectAssetReferences,
  toSpriteUsageAssetId,
  type AssetReference,
  type AssetUsageKind,
  type AvailableAsset,
} from '@/lib/asset-usage';
import { buildPlaybackAudioLibraryItems } from '@/lib/audio-library';
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { useAppStore } from '@/stores/use-app-store';

interface AssetUsageCardProps {
  colors: ThemeColorPalette;
  storyId: string;
  scenes: SceneRecord[];
  onOpenScene: (sceneId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function audioKind(type: AudioLibraryItem['type']): AssetUsageKind {
  return type === 'music' ? 'music' : 'sound';
}

function buildAvailableAssets(
  mediaLibrary: LibraryAsset[],
  audioLibrary: AudioLibraryItem[],
  characters: Character[],
): AvailableAsset[] {
  const imageAssets = mediaLibrary
    .filter((asset) => asset.type === 'image')
    .map((asset) => ({
      id: asset.id,
      kind: 'background' as const,
      name: asset.name,
      aliases: [asset.uri],
    }));
  const audioAssets = audioLibrary.map((asset) => ({
    id: asset.id,
    kind: audioKind(asset.type),
    name: asset.name,
    aliases: [asset.uri],
  }));
  const spriteAssets = characters.flatMap((character) =>
    character.sprites.map((sprite) => ({
      id: toSpriteUsageAssetId(character.id, sprite.id),
      kind: 'sprite' as const,
      name: `${character.name} / ${sprite.name}`,
      aliases: [sprite.id, sprite.uri],
    })),
  );

  return [...imageAssets, ...audioAssets, ...spriteAssets];
}

function SectionToggle({
  colors,
  title,
  count,
  expanded,
  onPress,
}: {
  colors: ThemeColorPalette;
  title: string;
  count: number;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [styles.sectionToggle, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.sectionCount, { color: colors.muted }]}>{count.toLocaleString()}</Text>
      <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={16} color={colors.muted} />
    </Pressable>
  );
}

function KindBadge({
  colors,
  kind,
}: {
  colors: ThemeColorPalette;
  kind: AssetUsageKind;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.kindBadge, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
      <Text style={[styles.kindBadgeText, { color: colors.primary }]}>{t(`assetUsage.kind.${kind}`)}</Text>
    </View>
  );
}

function ReferenceLine({
  colors,
  reference,
  sceneName,
}: {
  colors: ThemeColorPalette;
  reference: AssetReference;
  sceneName: string;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.referenceLine}>
      <Text style={[styles.referenceText, { color: colors['foreground-secondary'] }]} numberOfLines={1}>
        {t('assetUsage.referenceLocation', { scene: sceneName })}
      </Text>
      {!reference.enabled ? (
        <Text style={[styles.disabledLabel, { color: colors.muted }]}>{t('assetUsage.disabled')}</Text>
      ) : null}
    </View>
  );
}

export const AssetUsageCard = React.memo(function AssetUsageCard({
  colors,
  storyId,
  scenes,
  onOpenScene,
  style,
}: AssetUsageCardProps) {
  const { t } = useI18n();
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const storyAudioLibrary = useAppStore((state) => state.audioLibraries[storyId] ?? []);
  const characters = useAppStore((state) => state.characterLibraries[storyId] ?? []);
  const [usedExpanded, setUsedExpanded] = useState(false);
  const [unusedExpanded, setUnusedExpanded] = useState(false);
  const [brokenExpanded, setBrokenExpanded] = useState(false);

  const playbackAudioLibrary = useMemo(
    () => buildPlaybackAudioLibraryItems(storyAudioLibrary, mediaLibrary),
    [mediaLibrary, storyAudioLibrary],
  );
  const availableAssets = useMemo(
    () => buildAvailableAssets(mediaLibrary, playbackAudioLibrary, characters),
    [characters, mediaLibrary, playbackAudioLibrary],
  );
  const references = useMemo(() => collectAssetReferences(scenes), [scenes]);
  const report = useMemo(
    () => buildAssetUsageReport(references, availableAssets),
    [availableAssets, references],
  );
  const usedAssets = useMemo(
    () => report.assets.filter((item) => item.references.length > 0),
    [report.assets],
  );
  const sceneNames = useMemo(
    () => new Map(scenes.map((scene) => [scene.id, scene.name || scene.id])),
    [scenes],
  );
  const statusColor = report.brokenReferences.length > 0
    ? colors.danger
    : report.unusedAssets.length > 0
      ? colors.warning
      : colors.success;

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(statusColor, 0.12) }]}>
          <IconSymbol name={report.brokenReferences.length > 0 ? 'question' : 'image'} size={18} color={statusColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('assetUsage.title')}</Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
            {t('assetUsage.summary', {
              assets: report.assets.length,
              unused: report.unusedAssets.length,
              broken: report.brokenReferences.length,
            })}
          </Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryPill, { backgroundColor: withAlpha(colors.primary, 0.09) }]}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{report.assets.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('assetUsage.assets')}</Text>
        </View>
        <View style={[styles.summaryPill, { backgroundColor: withAlpha(colors.warning, 0.11) }]}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{report.unusedAssets.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('assetUsage.unused')}</Text>
        </View>
        <View style={[styles.summaryPill, { backgroundColor: withAlpha(colors.danger, 0.1) }]}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{report.brokenReferences.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{t('assetUsage.broken')}</Text>
        </View>
      </View>

      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <SectionToggle
          colors={colors}
          title={t('assetUsage.usedAssets')}
          count={usedAssets.length}
          expanded={usedExpanded}
          onPress={() => setUsedExpanded((value) => !value)}
        />
        {usedExpanded ? (
          <View style={styles.list}>
            {usedAssets.length > 0 ? usedAssets.map((item) => (
              <View key={`${item.asset.kind}-${item.asset.id}`} style={styles.assetItem}>
                <View style={styles.assetTitleRow}>
                  <Text style={[styles.assetName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.asset.name}
                  </Text>
                  <KindBadge colors={colors} kind={item.asset.kind} />
                </View>
                {item.references.map((reference) => (
                  <ReferenceLine
                    key={`${reference.sceneId}-${reference.stepId}-${reference.kind}`}
                    colors={colors}
                    reference={reference}
                    sceneName={sceneNames.get(reference.sceneId) ?? reference.sceneId}
                  />
                ))}
              </View>
            )) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('assetUsage.noUsedAssets')}</Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <SectionToggle
          colors={colors}
          title={t('assetUsage.unusedAssets')}
          count={report.unusedAssets.length}
          expanded={unusedExpanded}
          onPress={() => setUnusedExpanded((value) => !value)}
        />
        {unusedExpanded ? (
          <View style={styles.list}>
            {report.unusedAssets.length > 0 ? report.unusedAssets.map((asset) => (
              <View key={`${asset.kind}-${asset.id}`} style={styles.assetTitleRow}>
                <Text style={[styles.assetName, { color: colors.foreground }]} numberOfLines={1}>
                  {asset.name}
                </Text>
                <KindBadge colors={colors} kind={asset.kind} />
              </View>
            )) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('assetUsage.noUnusedAssets')}</Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <SectionToggle
          colors={colors}
          title={t('assetUsage.brokenReferences')}
          count={report.brokenReferences.length}
          expanded={brokenExpanded}
          onPress={() => setBrokenExpanded((value) => !value)}
        />
        {brokenExpanded ? (
          <View style={styles.list}>
            {report.brokenReferences.length > 0 ? report.brokenReferences.map((reference) => {
              const sceneName = sceneNames.get(reference.sceneId) ?? reference.sceneId;
              return (
                <Pressable
                  key={`${reference.sceneId}-${reference.stepId}-${reference.kind}-${reference.assetId}`}
                  onPress={() => onOpenScene(reference.sceneId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('assetUsage.openBrokenReference', { scene: sceneName })}
                  style={({ pressed }) => [styles.assetItem, pressed && styles.pressed]}
                >
                  <View style={styles.assetTitleRow}>
                    <Text style={[styles.assetName, { color: colors.foreground }]} numberOfLines={1}>
                      {reference.assetId}
                    </Text>
                    <KindBadge colors={colors} kind={reference.kind} />
                  </View>
                  <ReferenceLine colors={colors} reference={reference} sceneName={sceneName} />
                </Pressable>
              );
            }) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('assetUsage.noBrokenReferences')}</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.body,
    fontFamily: Fonts.sans,
    fontWeight: '800',
  },
  status: {
    ...typeScale.caption,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  summaryPill: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 0,
  },
  summaryValue: {
    ...typeScale.body,
    fontWeight: '800',
  },
  summaryLabel: {
    ...typeScale.caption,
  },
  section: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    ...typeScale.caption,
    fontWeight: '800',
  },
  sectionCount: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  assetItem: {
    gap: 4,
  },
  assetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  assetName: {
    flex: 1,
    ...typeScale.caption,
    fontWeight: '700',
  },
  kindBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  kindBadgeText: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  referenceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  referenceText: {
    flex: 1,
    ...typeScale.caption,
    lineHeight: 18,
  },
  disabledLabel: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  emptyText: {
    ...typeScale.caption,
  },
  pressed: {
    opacity: 0.72,
  },
});
