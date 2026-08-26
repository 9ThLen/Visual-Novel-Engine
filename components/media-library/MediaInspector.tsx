/**
 * The media inspector: a bottom sheet on a phone, a side panel everywhere else.
 *
 * Deleting is deliberately not the primary action. Story membership is
 * re-derived from scene references on every hydration, so removing a file that
 * is still referenced does not survive a restart — the honest UI is to block
 * the action and hand the author the scenes instead.
 */

import { useEvent } from 'expo';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';

import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { AppModal } from '@/components/ui/AppModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { acquireResolvedAssetUri } from '@/lib/asset-resolver';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import {
  canDetachOwner,
  canRemoveFromStory,
  type AudioCategory,
  type CharacterMediaFilter,
  type MediaOwner,
  type StoryMediaItem,
} from '@/lib/story-media-gallery';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Plays one clip, with none of the scene runtime's behaviour: no autoplay, no
 * cutscene state, no poster policy. The lease is what keeps the resolver from
 * revoking this object URL while the grid resolves the rest of the library.
 */
export function MediaInspectorVideo({ item, colors }: { item: StoryMediaItem; colors: ThemeColorPalette }) {
  const { t } = useI18n();
  const [source, setSource] = useState<VideoSource>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    setSource(null);
    setFailed(false);

    void acquireResolvedAssetUri(item.assetId ?? item.uri)
      .then((lease) => {
        // The selection may have moved on while we were resolving; holding the
        // pin for a clip nobody is watching is exactly the leak the dev warning
        // in the resolver is about.
        if (!active) {
          lease.release();
          return;
        }
        release = lease.release;
        setSource(lease.source);
        setFailed(lease.source === null);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      release?.();
    };
  }, [attempt, item.assetId, item.uri]);

  const player = useVideoPlayer(source, (instance) => {
    instance.keepScreenOnWhilePlaying = false;
  });

  // Resolving is only half of what can go wrong: a URL that resolves can still
  // fail to decode or play, and without watching the player that lands as a
  // silent black rectangle with no way back.
  const playerState = useEvent(player, 'statusChange', { status: player.status, error: undefined });
  const playbackFailed = playerState?.status === 'error';

  // Stop the previous clip the moment the selection changes; the player object
  // outlives the source it was built from.
  useEffect(() => () => player.pause(), [player]);

  if (failed || playbackFailed) {
    return (
      <View style={[styles.videoFallback, { backgroundColor: colors.background }]}>
        <Text style={[typeScale.label, { color: colors.muted }]}>{t('mediaLibrary.video.unavailable')}</Text>
        <Pressable
          accessibilityRole="button"
          // Re-runs the resolve, which is also what re-creates the player: a
          // revoked object URL cannot be recovered by replaying the same value.
          onPress={() => setAttempt((value) => value + 1)}
          style={styles.retry}
        >
          <Text style={[typeScale.label, { color: colors.primary }]}>{t('mediaLibrary.video.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!source) {
    return (
      <View style={[styles.videoFallback, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

/**
 * What the screen knows about where things are used.
 *
 * `pending` is the load still running; `unavailable` is a load that ended
 * without an answer — rejected, or finished without producing the story's
 * scenes. Both forbid the destructive actions, but they are different things to
 * say to an author, and saying "checking…" forever would be the wrong one.
 */
export type UsageState = 'pending' | 'ready' | 'unavailable';

export interface MediaInspectorProps {
  item: StoryMediaItem;
  colors: ThemeColorPalette;
  /** Phone renders a bottom sheet; wider layouts get a docked panel. */
  asSheet: boolean;
  canRemoveBackground: boolean;
  removingBackground: boolean;
  /** Every character in the story; the ones already owning the file are filtered out here. */
  characters: CharacterMediaFilter[];
  /** The scene the author came from, when the library was opened from one. */
  currentSceneId?: string;
  /**
   * Whether the story's scenes are loaded. Until they are, "used in no scene"
   * is an artefact of the load rather than an answer, and nothing destructive
   * may be offered on the strength of it.
   */
  usageState: UsageState;
  onClose: () => void;
  onOpenScene: (sceneId: string) => void;
  onRemoveBackground: (item: StoryMediaItem) => void;
  onRemoveFromStory: (item: StoryMediaItem) => void;
  onAttachToCharacter: (item: StoryMediaItem, characterId: string) => void;
  onDetachFromCharacter: (item: StoryMediaItem, owner: MediaOwner) => void;
  onMakeDefaultSprite: (item: StoryMediaItem, owner: MediaOwner) => void;
  /**
   * Audio only, and the same controller the grid drives: one player for the
   * screen, so the panel and the tile can never both be playing.
   */
  onTogglePlayback?: (item: StoryMediaItem) => void;
  playing?: boolean;
  progress?: number;
  playbackFailed?: boolean;
  /** Audio only: the author's own answer about what this file is. */
  onSetAudioCategory?: (item: StoryMediaItem, category: AudioCategory) => void;
}

function InspectorBody({
  item,
  colors,
  canRemoveBackground,
  removingBackground,
  characters,
  currentSceneId,
  usageState,
  onClose,
  onOpenScene,
  onRemoveBackground,
  onRemoveFromStory,
  onAttachToCharacter,
  onDetachFromCharacter,
  onMakeDefaultSprite,
  onTogglePlayback,
  playing = false,
  progress = 0,
  playbackFailed = false,
  onSetAudioCategory,
}: Omit<MediaInspectorProps, 'asSheet'>) {
  const { t } = useI18n();
  const [pickingCharacter, setPickingCharacter] = useState(false);
  // The panel stays mounted while the selection moves from tile to tile; an
  // open picker would otherwise carry over to a file the author never asked
  // about, and its first row is a one-tap write.
  useEffect(() => setPickingCharacter(false), [item.key]);
  // One scene can reference the same file from several steps — a background and
  // a sprite, or the same sprite in two dialogue blocks. The author cares which
  // scenes to visit, so both the count and the list are per scene.
  const scenes = React.useMemo(() => {
    const seen = new Set<string>();
    const unique = item.references.filter((reference) => {
      if (seen.has(reference.sceneId)) return false;
      seen.add(reference.sceneId);
      return true;
    });
    // The scene the author came from goes first and says so. Everything else
    // keeps document order — the sort is stable, so this only lifts one row.
    if (!currentSceneId) return unique;
    return [...unique].sort((a, b) =>
      Number(b.sceneId === currentSceneId) - Number(a.sceneId === currentSceneId));
  }, [currentSceneId, item.references]);
  const attachable = React.useMemo(
    () => characters.filter((character) =>
      !item.owners.some((owner) => owner.characterId === character.characterId)),
    [characters, item.owners],
  );
  const usageReady = usageState === 'ready';
  const usagePendingText = t(usageState === 'pending'
    ? 'mediaLibrary.usagePending'
    : 'mediaLibrary.usageUnavailable');
  const sceneActionLabel = (sceneId: string) => t(sceneId === currentSceneId
    ? 'mediaLibrary.action.openInCurrentScene'
    : 'mediaLibrary.action.openInScene');
  const removable = canRemoveFromStory(item);
  const blockedReason = removable
    ? null
    : !item.assetId
      ? t('mediaLibrary.remove.blockedSprite')
      : item.owners.length
        ? t('mediaLibrary.remove.blockedOwned')
        : t('mediaLibrary.remove.blockedUsed');

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.headerRow}>
        <Text numberOfLines={2} style={[typeScale.sectionTitle, { color: colors.foreground, flex: 1 }]}>
          {item.name}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('mediaLibrary.inspector.close')}
          style={styles.iconButton}
        >
          <IconSymbol name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {item.kind === 'video' ? (
        <MediaInspectorVideo item={item} colors={colors} />
      ) : item.kind === 'audio' ? (
        <View style={[styles.audioPreview, { backgroundColor: colors.background }]}>
          <IconSymbol
            name={item.audioCategory === 'music' ? 'music' : 'sound'}
            size={40}
            color={colors.muted}
          />
          {onTogglePlayback ? (
            <Pressable
              onPress={() => onTogglePlayback(item)}
              accessibilityRole="button"
              accessibilityLabel={t(
                playing ? 'mediaLibrary.audio.stop' : 'mediaLibrary.audio.play',
                { name: item.name },
              )}
              style={[styles.action, { borderColor: colors.border }]}
            >
              <IconSymbol name={playing ? 'stop' : 'play'} size={17} color={colors.primary} />
              <Text style={[typeScale.label, { color: colors.primary }]}>
                {t(playing ? 'mediaLibrary.audio.stop' : 'mediaLibrary.audio.play', { name: item.name })}
              </Text>
            </Pressable>
          ) : null}
          {playbackFailed ? (
            <Text style={[typeScale.caption, { color: colors.muted }]}>
              {t('mediaLibrary.audio.unavailable')}
            </Text>
          ) : null}
          {playing ? (
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <ResolvedAssetImage
          uri={item.uri}
          style={[styles.preview, { backgroundColor: colors.background }]}
          resizeMode="contain"
        />
      )}

      <Text style={[typeScale.caption, { color: colors.muted }]}>
        {t('mediaLibrary.inspector.addedAt', { date: new Date(item.addedAt).toLocaleDateString() })}
      </Text>

      {item.owners.length ? (
        <View style={styles.ownerRow}>
          <Text style={[typeScale.caption, { color: colors.muted }]}>{t('mediaLibrary.inspector.characters')}</Text>
          {item.owners.map((owner) => (
            <View key={owner.usageAssetId} style={styles.ownerBlock}>
              <View style={styles.owner}>
                <View style={[styles.dot, { backgroundColor: owner.color || colors.primary }]} />
                <Text style={[typeScale.label, { color: colors.foreground, flex: 1 }]}>
                  {owner.characterName} · {owner.spriteName}
                </Text>
                {owner.isDefaultSprite ? (
                  <Text style={[typeScale.caption, { color: colors.muted }]}>
                    {t('mediaLibrary.inspector.defaultSprite')}
                  </Text>
                ) : null}
              </View>
              {owner.isDefaultSprite ? null : (
                // Safe at any time: the default is only a fallback for steps
                // that named no sprite, so nothing can be left dangling.
                <Pressable
                  onPress={() => onMakeDefaultSprite(item, owner)}
                  accessibilityRole="button"
                  accessibilityLabel={t('mediaLibrary.action.makeDefault', { name: owner.characterName })}
                  style={[styles.action, { borderColor: colors.border }]}
                >
                  <Text style={[typeScale.label, { color: colors.primary }]}>
                    {t('mediaLibrary.action.makeDefault', { name: owner.characterName })}
                  </Text>
                </Pressable>
              )}
              {!usageReady ? (
                // Scenes are still loading. Everything looks unreferenced right
                // now, and offering a permanent delete on that basis is how a
                // sprite a scene still shows gets removed.
                <Text style={[typeScale.caption, { color: colors.muted }]}>
                  {usagePendingText}
                </Text>
              ) : canDetachOwner(owner) ? (
                <Pressable
                  onPress={() => onDetachFromCharacter(item, owner)}
                  accessibilityRole="button"
                  style={[styles.action, { borderColor: colors.border }]}
                >
                  <Text style={[typeScale.label, { color: colors.danger }]}>
                    {t('mediaLibrary.action.removeFromCharacter', { name: owner.characterName })}
                  </Text>
                </Pressable>
              ) : (
                // Detaching a sprite a scene still shows would dangle that
                // reference for good, and nothing restores it the way story
                // membership is restored.
                <Text style={[typeScale.caption, { color: colors.muted }]}>
                  {t('mediaLibrary.detach.blocked', {
                    name: owner.characterName,
                    count: owner.usage.enabled + owner.usage.disabled,
                  })}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {item.kind === 'image' ? (
        <View style={styles.ownerRow}>
          <Pressable
            onPress={() => setPickingCharacter((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: pickingCharacter }}
            style={[styles.action, { borderColor: colors.border }]}
          >
            <IconSymbol name="character" size={17} color={colors.primary} />
            <Text style={[typeScale.label, { color: colors.primary }]}>
              {t('mediaLibrary.action.addToCharacter')}
            </Text>
          </Pressable>
          {pickingCharacter ? (
            attachable.length ? attachable.map((character) => (
              <Pressable
                key={character.characterId}
                onPress={() => {
                  onAttachToCharacter(item, character.characterId);
                  setPickingCharacter(false);
                }}
                accessibilityRole="button"
                // The bare name reads as a filter chip; what this row does is
                // add the file to that character.
                accessibilityLabel={t('mediaLibrary.attach.option', { name: character.name })}
                style={[styles.sceneLink, { borderColor: colors.border }]}
              >
                <View style={[styles.dot, { backgroundColor: character.color || colors.primary }]} />
                <Text style={[typeScale.label, { color: colors.foreground, flex: 1 }]}>{character.name}</Text>
              </Pressable>
            )) : (
              <Text style={[typeScale.caption, { color: colors.muted }]}>
                {t(characters.length ? 'mediaLibrary.attach.none' : 'mediaLibrary.attach.noCharacters')}
              </Text>
            )
          ) : null}
        </View>
      ) : null}

      {item.audioCategory === undefined ? null : onSetAudioCategory ? (
        // The name is a guess and the scenes only speak for files already in
        // use, so the author gets the last word — and it is the answer the
        // library trusts from then on.
        <View style={styles.categoryRow}>
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {t('mediaLibrary.inspector.category')}
          </Text>
          {(['music', 'sound'] as AudioCategory[]).map((category) => {
            const active = item.audioCategory === category;
            return (
              <Pressable
                key={category}
                onPress={() => onSetAudioCategory(item, category)}
                accessibilityRole="button"
                // The bare name is also a filter chip a rail away; what this
                // one does is declare what the file is.
                accessibilityLabel={t(`mediaLibrary.audio.setCategory.${category}`)}
                accessibilityState={{ selected: active }}
                style={[
                  styles.categoryChip,
                  { borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <Text style={[typeScale.label, { color: active ? colors.foreground : colors.muted }]}>
                  {t(`mediaLibrary.audio.category.${category}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[typeScale.caption, { color: colors.muted }]}>
          {t('mediaLibrary.inspector.category')}: {t(`mediaLibrary.audio.category.${item.audioCategory}`)}
        </Text>
      )}

      <View style={styles.metaRow}>
        {item.sizeBytes === undefined ? null : (
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {t('mediaLibrary.inspector.size')}: {formatBytes(item.sizeBytes)}
          </Text>
        )}
        {item.durationSeconds === undefined ? null : (
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {t('mediaLibrary.inspector.duration')}: {formatDuration(item.durationSeconds)}
          </Text>
        )}
      </View>

      <Text style={[typeScale.label, { color: usageReady ? colors.foreground : colors.muted }]}>
        {!usageReady
          ? usagePendingText
          : scenes.length
            ? t('mediaLibrary.inspector.usedIn', { count: scenes.length })
            : t('mediaLibrary.inspector.notUsed')}
        {usageReady && item.usage.disabled
          ? ` · ${t('mediaLibrary.inspector.disabled', { count: item.usage.disabled })}`
          : ''}
      </Text>

      {scenes.map((reference) => (
        <Pressable
          key={reference.sceneId}
          onPress={() => onOpenScene(reference.sceneId)}
          accessibilityRole="button"
          accessibilityLabel={`${sceneActionLabel(reference.sceneId)}: ${reference.sceneName}`}
          style={[styles.sceneLink, { borderColor: colors.border }]}
        >
          <Text style={[typeScale.label, { color: colors.foreground, flex: 1 }]}>{reference.sceneName}</Text>
          <Text style={[typeScale.caption, { color: colors.primary }]}>{sceneActionLabel(reference.sceneId)}</Text>
        </Pressable>
      ))}

      {item.kind === 'image' && canRemoveBackground && item.assetId ? (
        <Pressable
          onPress={() => onRemoveBackground(item)}
          disabled={removingBackground}
          accessibilityRole="button"
          style={[styles.action, { borderColor: colors.border, opacity: removingBackground ? 0.5 : 1 }]}
        >
          <IconSymbol name="scissors" size={17} color={colors.primary} />
          <Text style={[typeScale.label, { color: colors.primary }]}>{t('mediaLibrary.action.removeBackground')}</Text>
        </Pressable>
      ) : null}

      {!usageReady ? null : blockedReason ? (
        <Text style={[typeScale.caption, { color: colors.muted }]}>{blockedReason}</Text>
      ) : (
        <Pressable
          onPress={() => onRemoveFromStory(item)}
          accessibilityRole="button"
          style={[styles.action, { borderColor: colors.border }]}
        >
          <IconSymbol name="delete" size={17} color={colors.danger} />
          <Text style={[typeScale.label, { color: colors.danger }]}>
            {t('mediaLibrary.action.removeImportedFile')}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

export function MediaInspector({ asSheet, ...props }: MediaInspectorProps) {
  if (!asSheet) {
    return (
      <View style={[styles.panel, { backgroundColor: props.colors['surface-1'], borderColor: props.colors.border }]}>
        <InspectorBody {...props} />
      </View>
    );
  }

  return (
    <AppModal
      visible
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      onRequestClose={props.onClose}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.backdropFill} accessibilityRole="button" onPress={props.onClose} />
        <View style={[styles.sheet, { backgroundColor: props.colors['surface-1'] }]}>
          <InspectorBody {...props} />
        </View>
      </View>
    </AppModal>
  );
}

export const MEDIA_INSPECTOR_WIDTH = 340;

const styles = StyleSheet.create({
  panel: { width: MEDIA_INSPECTOR_WIDTH, borderLeftWidth: 1, borderRadius: radius.lg },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  body: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: 180, borderRadius: radius.md },
  audioPreview: {
    width: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  categoryChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  progressTrack: { alignSelf: 'stretch', height: 2, marginHorizontal: spacing.md },
  progressFill: { height: 2 },
  video: { width: '100%', height: 180, borderRadius: radius.md },
  videoFallback: { width: '100%', height: 180, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  ownerRow: { gap: spacing.xs },
  ownerBlock: { gap: spacing.xs, paddingBottom: spacing.xs },
  owner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  metaRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  sceneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
