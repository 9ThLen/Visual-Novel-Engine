/**
 * What the Scene tab shows below the preview: the scene's name, how long it
 * reads, and where it leads.
 *
 * This replaced a block count, a badge dump of internal block types, and the
 * raw asset id of the background — none of which answered a question an author
 * actually has while writing.
 */

import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { documentSceneToConnections } from '@/lib/document-editor/document-scene';
import { getSceneReadingStats, type PreviewFrame } from '@/lib/document-editor/preview-frames';
import type { DocumentScene } from '@/lib/document-editor/types';

export interface SceneRef {
  id: string;
  name: string;
}

interface SceneFactsCardProps {
  scene: DocumentScene | null;
  frames: PreviewFrame[];
  storyScenes: SceneRef[];
  onOpenScene?: (sceneId: string) => void;
  colors: ReturnType<typeof useColors>;
}

export function SceneFactsCard({ scene, frames, storyScenes, onOpenScene, colors }: SceneFactsCardProps) {
  const { t, pluralize } = useI18n();
  const stats = useMemo(() => getSceneReadingStats(frames), [frames]);

  const destinations = useMemo(() => {
    if (!scene) return [];
    const names = new Map(storyScenes.map((item) => [item.id, item.name]));
    return documentSceneToConnections(scene).map((connection) => ({
      key: `${connection.outputPort}:${connection.targetSceneId}`,
      sceneId: connection.targetSceneId,
      sceneName: names.get(connection.targetSceneId) ?? connection.targetSceneId,
      isNext: connection.outputPort === 'next',
      label: connection.label,
    }));
  }, [scene, storyScenes]);

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '800' }}>
          {scene?.sceneName || t('document.scene.untitled')}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
          {scene
            ? t('document.scene.readingStats', {
                time: formatReadingTime(stats.seconds, t),
                words: stats.words,
                wordsLabel: pluralize(stats.words, t('document.scene.wordOne'), t('document.scene.wordFew'), t('document.scene.wordMany')),
              })
            : t('document.scene.noScene')}
        </Text>
      </View>

      <View>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>
          {t('document.scene.leadsTo')}
        </Text>
        <View style={{ gap: 7, marginTop: 8 }}>
          {destinations.length ? (
            destinations.map((destination) => (
              <Pressable
                key={destination.key}
                onPress={onOpenScene ? () => onOpenScene(destination.sceneId) : undefined}
                disabled={!onOpenScene}
                accessibilityRole={onOpenScene ? 'button' : undefined}
                style={{
                  borderWidth: 1,
                  borderColor: destination.isNext ? colors.border : withAlpha(colors.primary, 0.45),
                  backgroundColor: colors.background,
                  borderRadius: 7,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>
                  {destination.sceneName}
                </Text>
                <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 3 }}>
                  {destination.isNext ? t('document.scene.viaNext') : destination.label}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12 }}>{t('document.scene.leadsNowhere')}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function formatReadingTime(seconds: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (seconds < 60) return t('document.scene.timeSeconds', { seconds: Math.max(0, seconds) });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest
    ? t('document.scene.timeMinutesSeconds', { minutes, seconds: rest })
    : t('document.scene.timeMinutes', { minutes });
}
