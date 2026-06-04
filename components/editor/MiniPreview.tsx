/**
 * components/editor/MiniPreview.tsx — Bottom mini preview panel
 *
 * Shows a live preview of the current scene state.
 * Collapsible, positioned at bottom of editor.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/use-colors';
import type {
  BackgroundBlockData,
  CharacterBlockData,
  MusicBlockData,
  TimelineStep,
} from '@/lib/engine/types';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { withAlpha } from '@/lib/_core/theme';
import { useI18n } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface MiniPreviewProps {
  timeline: TimelineStep[];
  onClose: () => void;
}

export function MiniPreview({ timeline, onClose }: MiniPreviewProps) {
  const colors = useColors();
  const { t } = useI18n();

  // Compute current scene state from timeline
  const sceneState = computeSceneState(timeline);

  return (
    <View style={{
      height: 120,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <Text style={{
          fontSize: 11,
          lineHeight: 15,
          fontWeight: '700',
          textTransform: 'uppercase',
          color: colors.muted,
        }}>
          {t('editor.preview.title')}
        </Text>
        <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
          <IconSymbol name="close" size={14} color={colors.muted} />
        </Pressable>
      </View>

      {/* Preview content */}
      <View style={{ flex: 1, flexDirection: 'row', padding: 8 }}>
        {/* Background preview */}
        <View style={{
          flex: 1,
          backgroundColor: colors.background,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {sceneState.backgroundAssetId ? (
            <ResolvedMiniBackground assetId={sceneState.backgroundAssetId} />
          ) : (
            <View style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted }}>{t('editor.noBackground')}</Text>
            </View>
          )}

          {/* Character overlays */}
          {sceneState.characters.map((char, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${getPositionPercent(char.position)}%`,
                bottom: 10,
                width: 40,
                height: 60,
                backgroundColor: withAlpha(colors.secondary, 0.19),
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateX: -20 }],
              }}
            >
              <Text style={{ fontSize: 11, lineHeight: 14, color: colors.muted }}>
                {char.characterId || '?'}
              </Text>
            </View>
          ))}
        </View>

        {/* Scene info */}
        <View style={{
          width: 120,
          paddingLeft: 8,
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 11, lineHeight: 15, color: colors.foreground, fontWeight: '600' }}>
            {t('editor.preview.characterCount', { count: String(sceneState.characters.length) })}
          </Text>
          <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted, marginTop: 4 }}>
            {t('editor.preview.blockCount', { count: String(timeline.length) })}
          </Text>
          {sceneState.musicTrackId && (
            <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted, marginTop: 4 }}>
              <IconSymbol name="music" size={11} color={colors.muted} /> {sceneState.musicTrackId}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ResolvedMiniBackground({ assetId }: { assetId: string }) {
  const colors = useColors();
  const { t } = useI18n();
  const [source, setSource] = useState<number | { uri: string } | null>(null);

  useEffect(() => {
    let active = true;

    resolveAssetUri(assetId)
      .then((resolved) => {
        if (!active || !resolved) {
          if (active) setSource(null);
          return;
        }
        setSource(typeof resolved === 'number' ? resolved : { uri: resolved });
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
      <View style={{
        flex: 1,
        backgroundColor: withAlpha(colors.primary, 0.13),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 11, lineHeight: 15, color: colors.muted }}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={{ flex: 1 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface MiniSceneState {
  backgroundAssetId: string | null;
  characters: { characterId: string; position: string }[];
  musicTrackId: string | null;
}

function computeSceneState(timeline: TimelineStep[]): MiniSceneState {
  const state: MiniSceneState = {
    backgroundAssetId: null,
    characters: [],
    musicTrackId: null,
  };

  for (const step of timeline) {
    if (!step.enabled) continue;

    switch (step.blockType) {
      case 'background': {
        const data = step.data as BackgroundBlockData;
        if (data.assetId) state.backgroundAssetId = data.assetId;
        break;
      }
      case 'character': {
        const data = step.data as CharacterBlockData;
        if (data.characterId) {
          state.characters.push({
            characterId: data.characterId,
            position: data.position || 'center',
          });
        }
        break;
      }
      case 'music': {
        const data = step.data as MusicBlockData;
        if (data.assetId && data.action === 'play') {
          state.musicTrackId = data.assetId;
        }
        break;
      }
    }
  }

  return state;
}

function getPositionPercent(position: string): number {
  switch (position) {
    case 'far-left': return 10;
    case 'left': return 25;
    case 'center': return 45;
    case 'right': return 65;
    case 'far-right': return 80;
    default: return 45;
  }
}
