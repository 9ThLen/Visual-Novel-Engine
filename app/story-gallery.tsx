/**
 * The story media library: one full-screen grid over every image and video the
 * story owns, with characters as filters rather than as a separate list.
 *
 * The route keeps its `/story-gallery` name and `storyId` param — three screens
 * link here — while the visible name is now the media library.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { MediaFilterRail, MediaTypeTabs } from '@/components/media-library/MediaFilters';
import { MediaGrid } from '@/components/media-library/MediaGrid';
import { MEDIA_INSPECTOR_WIDTH, MediaInspector } from '@/components/media-library/MediaInspector';
import { ScreenContainer } from '@/components/screen-container';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { resolveAssetUri } from '@/lib/asset-resolver';
import { spacing, radius, typeScale } from '@/lib/design-tokens';
import { pickImageFromDevice } from '@/lib/pick-image';
import { isBackgroundRemovalSupported, removeImageBackground } from '@/lib/remove-background';
import {
  buildStoryMediaGallery,
  filterMediaItems,
  type ImageFilter,
  type MediaKind,
  type StoryMediaItem,
} from '@/lib/story-media-gallery';
import { showToast } from '@/lib/toast-store';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { selectSceneRecordsForStory, selectStoryMetadata, useAppStore } from '@/stores/use-app-store';

/** Below this the inspector is a bottom sheet rather than a docked panel. */
const PHONE_MAX_WIDTH = 768;

export default function StoryGalleryRoute() {
  const { storyId, sceneId } = useLocalSearchParams<{ storyId: string; sceneId?: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const { width } = useWindowDimensions();

  const story = useAppStore(useMemo(() => storyId ? selectStoryMetadata(storyId) : () => undefined, [storyId]));
  const scenes = useAppStore(useMemo(() => storyId ? selectSceneRecordsForStory(storyId) : () => [], [storyId]));
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const imageAssetIdsByStory = useAppStore((state) => state.imageAssetIdsByStory);
  const mediaAssetIdsByStory = useAppStore((state) => state.mediaAssetIdsByStory);
  const characters = useAppStore((state) => storyId ? state.characterLibraries[storyId] ?? [] : []);
  const hydrate = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const addImage = useAppStore((state) => state.addImageAssetToStory);
  const removeImage = useAppStore((state) => state.removeImageAssetFromStory);
  const removeMedia = useAppStore((state) => state.removeMediaAssetFromStory);

  const [kind, setKind] = useState<MediaKind>('image');
  const [filter, setFilter] = useState<ImageFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<StoryMediaItem | null>(null);
  const [removingBackgroundKey, setRemovingBackgroundKey] = useState<string | null>(null);

  useEffect(() => { if (storyId) void hydrate(storyId); }, [hydrate, storyId]);

  const gallery = useMemo(
    () => buildStoryMediaGallery({
      storyId: storyId ?? '',
      mediaLibrary,
      imageAssetIdsByStory,
      mediaAssetIdsByStory,
      characters,
      scenes,
    }),
    [characters, imageAssetIdsByStory, mediaAssetIdsByStory, mediaLibrary, scenes, storyId],
  );

  const source = kind === 'image' ? gallery.images : gallery.videos;
  const visible = useMemo(() => filterMediaItems(source, filter, query), [filter, query, source]);
  const selected = useMemo(
    () => visible.find((item) => item.key === selectedKey) ?? null,
    [selectedKey, visible],
  );

  // Character filters belong to images only: the store does not associate clips
  // with characters, and inventing that link would be a new data model.
  const characterFilters = kind === 'image' ? gallery.characterFilters : [];
  const counts = useMemo(() => ({
    all: source.length,
    used: source.filter((item) => item.usage.enabled + item.usage.disabled > 0).length,
    unused: source.filter((item) => item.usage.enabled + item.usage.disabled === 0).length,
  }), [source]);

  const handleSwitchKind = useCallback((next: MediaKind) => {
    setKind(next);
    setFilter({ kind: 'all' });
    setSelectedKey(null);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!storyId) return;
    try {
      const picked = await pickImageFromDevice();
      if (!picked) return;
      const asset = await addAssetToLibrary(picked.uri, picked.name, 'image');
      addImage(storyId, asset.id);
      showToast(t('storyHome.imageAdded'), 'success');
    } catch {
      showToast(t('storyHome.imageAddFailed'), 'error');
    }
  }, [addImage, storyId, t]);

  const handleRemoveBackground = useCallback(async (item: StoryMediaItem) => {
    if (!storyId || removingBackgroundKey) return;
    setRemovingBackgroundKey(item.key);
    try {
      const resolved = await resolveAssetUri(item.uri);
      if (typeof resolved !== 'string') throw new Error('Image unavailable');
      const uri = await removeImageBackground(resolved);
      const name = item.name.replace(/\.(png|jpe?g|webp)$/i, '');
      const created = await addAssetToLibrary(uri, `${name} (cutout).png`, 'image');
      addImage(storyId, created.id);
      showToast(t('storyHome.backgroundRemoved'), 'success');
    } catch {
      showToast(t('storyHome.backgroundRemoveFailed'), 'error');
    } finally {
      setRemovingBackgroundKey(null);
    }
  }, [addImage, removingBackgroundKey, storyId, t]);

  const handleConfirmRemoval = useCallback(() => {
    const assetId = pendingRemoval?.assetId;
    if (storyId && assetId) {
      if (pendingRemoval?.kind === 'video') removeMedia(storyId, assetId);
      else removeImage(storyId, assetId);
      setSelectedKey(null);
    }
    setPendingRemoval(null);
  }, [pendingRemoval, removeImage, removeMedia, storyId]);

  const handleOpenScene = useCallback((targetSceneId: string) => {
    if (!storyId) return;
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: targetSceneId } });
  }, [router, storyId]);

  const isPhone = width < PHONE_MAX_WIDTH;
  // Each empty state has to say why it is empty. Telling an author with six
  // images that the story has none, just because none are used yet, reads as a
  // bug in the library rather than an answer to the filter they picked.
  const emptyLabel = query.trim()
    ? t('mediaLibrary.search.empty', { query: query.trim() })
    : filter.kind === 'character'
      ? t('mediaLibrary.empty.character', {
          name: characterFilters.find((item) => item.characterId === filter.characterId)?.name ?? '',
        })
      : filter.kind === 'used' || filter.kind === 'unused'
        ? t(`mediaLibrary.empty.${filter.kind}`)
        : t(kind === 'image' ? 'mediaLibrary.empty.images' : 'mediaLibrary.empty.videos');

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <View style={styles.main}>
          <View style={styles.header}>
            <Pressable
              onPress={() => (sceneId && storyId
                ? router.push({ pathname: '/document-editor', params: { storyId, sceneId } })
                : router.back())}
              accessibilityRole="button"
              accessibilityLabel={t('menu.back')}
              style={styles.iconButton}
            >
              <IconSymbol name="chevron.left" size={22} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t('mediaLibrary.title')}</Text>
              {story ? <Text style={{ color: colors.muted }}>{story.title}</Text> : null}
            </View>
            <Pressable
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel={t('mediaLibrary.add')}
              style={styles.iconButton}
            >
              <IconSymbol name="add" size={24} color={colors.primary} />
            </Pressable>
          </View>

          <MediaTypeTabs colors={colors} kind={kind} counts={gallery.counts} onChange={handleSwitchKind} />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('mediaLibrary.search.placeholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('mediaLibrary.search.placeholder')}
            style={[styles.search, { borderColor: colors.border, color: colors.foreground }]}
          />

          <MediaFilterRail
            colors={colors}
            filter={filter}
            counts={counts}
            characters={characterFilters}
            onChange={(next) => { setFilter(next); setSelectedKey(null); }}
          />

          <MediaGrid
            items={visible}
            colors={colors}
            selectedKey={selectedKey}
            // Date headers only in the unfiltered view; under a filter they
            // collapse into groups of one or two tiles.
            grouped={filter.kind === 'all' && !query.trim()}
            now={Date.now()}
            emptyLabel={emptyLabel}
            onSelect={(item) => setSelectedKey(item.key)}
            reservedWidth={!isPhone && selected ? MEDIA_INSPECTOR_WIDTH : 0}
          />
        </View>

        {selected ? (
          <MediaInspector
            item={selected}
            colors={colors}
            asSheet={isPhone}
            canRemoveBackground={isBackgroundRemovalSupported()}
            removingBackground={removingBackgroundKey === selected.key}
            onClose={() => setSelectedKey(null)}
            onOpenScene={handleOpenScene}
            onRemoveBackground={handleRemoveBackground}
            onRemoveFromStory={setPendingRemoval}
          />
        ) : null}
      </View>

      <ConfirmDialog
        visible={Boolean(pendingRemoval)}
        title={t('mediaLibrary.remove.confirmTitle')}
        message={t('mediaLibrary.remove.confirmMessage', { name: pendingRemoval?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
        destructive
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  headerText: { flex: 1 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { ...typeScale.pageTitle },
  search: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
});
