/**
 * components/editor/MiniPreview.tsx — Bottom mini preview panel
 *
 * Shows a live preview of the current scene state.
 * Collapsible, positioned at bottom of editor.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, type TimelineStep } from '@/lib/engine/types';

interface MiniPreviewProps {
  timeline: TimelineStep[];
  onClose: () => void;
}

export function MiniPreview({ timeline, onClose }: MiniPreviewProps) {
  const colors = useColors();

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
          fontWeight: '700',
          textTransform: 'uppercase',
          color: colors.muted,
        }}>
          👁 Preview
        </Text>
        <Pressable onPress={onClose} style={{ padding: 4 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>✕</Text>
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
            <View style={{
              flex: 1,
              backgroundColor: colors.primary + '20',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                🖼 {sceneState.backgroundAssetId}
              </Text>
            </View>
          ) : (
            <View style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>No background</Text>
            </View>
          )}

          {/* Character overlays */}
          {sceneState.characters.map((char, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: getPositionPercent(char.position),
                bottom: 10,
                width: 40,
                height: 60,
                backgroundColor: (colors.secondary || colors.primary) + '30',
                borderRadius: 4,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 8, color: colors.muted }}>
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
          <Text style={{ fontSize: 10, color: colors.foreground, fontWeight: '600' }}>
            {sceneState.characters.length} character{sceneState.characters.length !== 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
            {timeline.length} block{timeline.length !== 1 ? 's' : ''}
          </Text>
          {sceneState.musicTrackId && (
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              🎵 {sceneState.musicTrackId}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface MiniSceneState {
  backgroundAssetId: string | null;
  characters: Array<{ characterId: string; position: string }>;
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
    const data = step.data as any;

    switch (step.blockType) {
      case 'background':
        if (data.assetId) state.backgroundAssetId = data.assetId;
        break;
      case 'character':
        if (data.characterId) {
          state.characters.push({
            characterId: data.characterId,
            position: data.position || 'center',
          });
        }
        break;
      case 'music':
        if (data.assetId && data.action === 'play') {
          state.musicTrackId = data.assetId;
        }
        break;
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
