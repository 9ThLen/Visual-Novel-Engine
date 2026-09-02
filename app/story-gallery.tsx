/**
 * The story media library: one screen over every image, clip and sound the
 * story owns, with characters as filters rather than as a separate list.
 *
 * The route keeps its `/story-gallery` name and `storyId` param — three screens
 * link here — while the visible name is now the media library.
 *
 * Three zones on a wide screen: the rail down the left (which kind, whose,
 * used or not), the browser in the middle, and a panel on the right that shows
 * the selected file — or, when nothing is selected, what the story's media adds
 * up to. Narrow screens have room for one column, so the rail becomes the type
 * tabs and the chip row above the browser, and the panel becomes a sheet.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { MediaBrowser } from '@/components/media-library/MediaBrowser';
import { MediaFilterRail, MediaTypeTabs } from '@/components/media-library/MediaFilters';
import { MEDIA_INSPECTOR_WIDTH, MediaInspector } from '@/components/media-library/MediaInspector';
import { MediaOverviewPanel } from '@/components/media-library/MediaOverviewPanel';
import {
  MEDIA_RAIL_COLLAPSED_WIDTH,
  MEDIA_RAIL_WIDTH,
  MediaRail,
} from '@/components/media-library/MediaRail';
import { MediaMenu, MediaToolbar } from '@/components/media-library/MediaToolbar';
import { ScreenContainer } from '@/components/screen-container';
import { ConfirmDialog } from '@/components/ui';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { resolveAssetUri } from '@/lib/asset-resolver';
import {
  attachSpriteToCharacter,
  detachSpriteFromCharacter,
  setDefaultSprite,
  spriteNameFromFileName,
} from '@/lib/character-media';
import { setAudioCategoryInLibrary, type AudioCategory } from '@/lib/audio-category';
import { spacing } from '@/lib/design-tokens';
import { sortMediaItems, type MediaSort, type MediaView } from '@/lib/media-browser-rows';
import { summarizeStoryMedia } from '@/lib/media-library-overview';
import { pickAudioFromDevice } from '@/lib/pick-audio';
import { pickImageFromDevice } from '@/lib/pick-image';
import { pickVideoFromDevice } from '@/lib/pick-video';
import { isBackgroundRemovalSupported, removeImageBackground } from '@/lib/remove-background';
import {
  buildStoryMediaGallery,
  canDetachOwner,
  filterMediaItems,
  findOwnerInGallery,
  usageIsKnowable,
  type ImageFilter,
  type MediaKind,
  type MediaOwner,
  type StoryMediaItem,
  type UsageState,
} from '@/lib/story-media-gallery';
import { showToast } from '@/lib/toast-store';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { selectSceneRecordsForStory, selectStoryMetadata, useAppStore } from '@/stores/use-app-store';

/** Below this the inspector is a bottom sheet and the rail becomes chips. */
const PHONE_MAX_WIDTH = 768;
/** Below this the rail is icons and counts: enough for a column, not a wide one. */
const RAIL_LABELS_WIDTH = 1100;
/**
 * Below this the side panel only appears for a selection. Keeping the overview
 * permanently would cost the grid two columns on a screen that has few to give.
 */
const OVERVIEW_MIN_WIDTH = 1100;

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
  const audioLibraries = useAppStore((state) => state.audioLibraries);
  const characters = useAppStore((state) => storyId ? state.characterLibraries[storyId] ?? [] : []);
  const hydrate = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const addImage = useAppStore((state) => state.addImageAssetToStory);
  const addMedia = useAppStore((state) => state.addMediaAssetToStory);
  const removeImage = useAppStore((state) => state.removeImageAssetFromStory);
  const removeMedia = useAppStore((state) => state.removeMediaAssetFromStory);
  const setAudioLibrary = useAppStore((state) => state.setAudioLibrary);
  const setCharacterLibrary = useAppStore((state) => state.setCharacterLibrary);

  // The library opens on everything it holds. Three kind-tabs made a story with
  // a handful of files look like three empty rooms; the combined view is the
  // answer to "what does this story have", which is why the screen is opened.
  const [view, setView] = useState<MediaView>('all');
  const [filter, setFilter] = useState<ImageFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MediaSort>('date');
  const [dense, setDense] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<StoryMediaItem | null>(null);
  const [removingBackgroundKey, setRemovingBackgroundKey] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // One player for the screen: the rows and the inspector drive the same
  // controller, so two files can never sound at once.
  const preview = useAudioPreview();

  /**
   * Scene records arrive asynchronously, and until they do every file looks
   * unused. That is a lie the destructive actions must not act on, so the
   * screen tracks how the load actually went — a rejection is not an answer,
   * and calling it loaded would open the gate on no information at all.
   */
  const [sceneLoad, setSceneLoad] = useState('pending');
  useEffect(() => {
    if (!storyId) return;
    let active = true;
    setSceneLoad('pending');
    void hydrate(storyId).then(
      () => { if (active) setSceneLoad('loaded'); },
      () => { if (active) setSceneLoad('failed'); },
    );
    return () => { active = false; };
  }, [hydrate, storyId]);

  /**
   * Three states, because "not yet" and "cannot" are different things to tell
   * an author — and a load that finished without producing the story's scenes
   * belongs to the second, not the first.
   */
  const usageState: UsageState = sceneLoad === 'pending'
    ? 'pending'
    : usageIsKnowable(sceneLoad === 'loaded', scenes, story)
      ? 'ready'
      : 'unavailable';
  const usageReady = usageState === 'ready';

  /**
   * A usage filter the author picked while usage was known must not keep
   * filtering once it stops being known. Disabling the chip is not enough — the
   * grid would go on hiding files on the strength of scenes it no longer has,
   * and an empty grid is a louder claim than a greyed-out chip.
   */
  useEffect(() => {
    if (usageReady) return;
    setFilter((current) => current.kind === 'used' || current.kind === 'unused'
      ? { kind: 'all' }
      : current);
  }, [usageReady]);

  const gallery = useMemo(
    () => buildStoryMediaGallery({
      storyId: storyId ?? '',
      mediaLibrary,
      imageAssetIdsByStory,
      mediaAssetIdsByStory,
      characters,
      scenes,
      audioLibrary: storyId ? audioLibraries[storyId] : undefined,
    }),
    [audioLibraries, characters, imageAssetIdsByStory, mediaAssetIdsByStory, mediaLibrary, scenes, storyId],
  );

  const summary = useMemo(() => summarizeStoryMedia(gallery), [gallery]);

  /** Everything the open view could show, before the filter and the search. */
  const source = useMemo(() => (view === 'all'
    ? [...gallery.images, ...gallery.videos, ...gallery.audios]
    : view === 'image' ? gallery.images : view === 'video' ? gallery.videos : gallery.audios),
  [gallery, view]);

  const shown = useMemo(() => {
    const kept = filterMediaItems(source, filter, query);
    return sortMediaItems(kept, sort);
  }, [filter, query, sort, source]);

  const images = useMemo(() => shown.filter((item) => item.kind === 'image'), [shown]);
  const videos = useMemo(() => shown.filter((item) => item.kind === 'video'), [shown]);
  const audios = useMemo(() => shown.filter((item) => item.kind === 'audio'), [shown]);

  const selected = useMemo(
    () => shown.find((item) => item.key === selectedKey) ?? null,
    [selectedKey, shown],
  );

  // Character filters belong to images: the store does not associate clips or
  // sounds with characters, and inventing that link would be a new data model.
  const characterFilters = view === 'image' || view === 'all' ? gallery.characterFilters : [];
  // Music and sound are what the audio view has instead: the two roles a
  // timeline actually plays a file in.
  const audioCategories = useMemo(
    () => (view === 'audio'
      ? ([
        { category: 'music' as const, count: source.filter((item) => item.audioCategory === 'music').length },
        { category: 'sound' as const, count: source.filter((item) => item.audioCategory === 'sound').length },
      ])
      : []),
    [source, view],
  );
  const filterCounts = useMemo(() => ({
    all: source.length,
    used: source.filter((item) => item.usage.enabled + item.usage.disabled > 0).length,
    unused: source.filter((item) => item.usage.enabled + item.usage.disabled === 0).length,
  }), [source]);

  /**
   * A sound whose row is gone has no controller left on screen: removing it,
   * searching, or picking a filter it does not match would otherwise leave it
   * playing with nothing anywhere to stop it.
   */
  const { activeKey: activePreviewKey, stop: stopPreview } = preview;
  useEffect(() => {
    if (!activePreviewKey) return;
    if (shown.some((item) => item.key === activePreviewKey)) return;
    stopPreview();
  }, [activePreviewKey, shown, stopPreview]);

  const handleSwitchView = useCallback((next: MediaView) => {
    setView(next);
    setFilter({ kind: 'all' });
    setSelectedKey(null);
    // Leaving a view that was sounding has to silence it: the row that was
    // playing is about to be unmounted, and nothing else offers a way to stop it.
    preview.stop();
  }, [preview]);

  const handleTogglePlayback = useCallback(
    (item: StoryMediaItem) => preview.toggle({ key: item.key, assetId: item.assetId, uri: item.uri }),
    [preview],
  );

  /**
   * What `+` adds is whatever the open view shows. It used to pick an image
   * whichever tab was open, so on the video tab it added something the tab
   * could not even display. The combined view shows all three, so there it is
   * the one question the button has to ask before it can act.
   */
  const addByKind = useCallback(async (kind: MediaKind) => {
    if (!storyId) return;
    if (kind === 'image') {
      try {
        const picked = await pickImageFromDevice();
        if (!picked) return;
        const asset = await addAssetToLibrary(picked.uri, picked.name, 'image');
        addImage(storyId, asset.id);
        showToast(t('storyHome.imageAdded'), 'success');
      } catch {
        showToast(t('storyHome.imageAddFailed'), 'error');
      }
      return;
    }

    if (kind === 'audio') {
      const picked = await pickAudioFromDevice();
      if (picked.status === 'cancelled') return;
      if (picked.status !== 'picked') {
        showToast(t(`mediaLibrary.audio.${picked.status}`), 'error');
        return;
      }
      try {
        const asset = await addAssetToLibrary(picked.audio.uri, picked.audio.name, 'audio', {
          mimeType: picked.audio.mimeType,
          size: picked.audio.size,
          durationSeconds: picked.audio.durationSeconds,
        });
        addMedia(storyId, asset.id);
        showToast(t('mediaLibrary.audio.added'), 'success');
      } catch {
        showToast(t('mediaLibrary.audio.addFailed'), 'error');
      } finally {
        // The object URL only had to survive the copy into storage.
        picked.audio.release?.();
      }
      return;
    }

    const picked = await pickVideoFromDevice();
    if (picked.status === 'cancelled') return;
    if (picked.status !== 'picked') {
      showToast(t(`mediaLibrary.video.${picked.status}`), 'error');
      return;
    }
    try {
      const asset = await addAssetToLibrary(picked.video.uri, picked.video.name, 'video', {
        mimeType: picked.video.mimeType,
        size: picked.video.size,
        durationSeconds: picked.video.durationSeconds,
      });
      addMedia(storyId, asset.id);
      showToast(t('mediaLibrary.video.added'), 'success');
    } catch {
      showToast(t('mediaLibrary.video.addFailed'), 'error');
    } finally {
      picked.video.release?.();
    }
  }, [addImage, addMedia, storyId, t]);

  const handleAdd = useCallback(() => {
    if (view === 'all') {
      setAddMenuOpen(true);
      return;
    }
    void addByKind(view);
  }, [addByKind, view]);

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
      // Images have their own membership list; video and audio share
      // `mediaAssetIdsByStory`.
      if (pendingRemoval?.kind === 'image') removeImage(storyId, assetId);
      else removeMedia(storyId, assetId);

      if (pendingRemoval?.kind === 'audio') {
        // The story's audio library is re-read into membership on every
        // hydration, so a leftover entry would quietly bring the file back on
        // the next launch. The entry describes a file of this story, and the
        // file is the thing being removed.
        const entries = useAppStore.getState().audioLibraries[storyId] ?? [];
        const remaining = entries.filter(
          (entry) => entry.id !== assetId && entry.uri !== pendingRemoval.uri,
        );
        if (remaining.length !== entries.length) setAudioLibrary(storyId, remaining);
      }
      setSelectedKey(null);
    }
    setPendingRemoval(null);
  }, [pendingRemoval, removeImage, removeMedia, setAudioLibrary, storyId]);

  /**
   * The author's answer outranks both the file name and the scenes, so it is
   * stored rather than inferred — as an entry in the story's audio library,
   * which is the source the gallery already trusts first.
   */
  const handleSetAudioCategory = useCallback((item: StoryMediaItem, category: AudioCategory) => {
    if (!storyId) return;
    const current = useAppStore.getState().audioLibraries[storyId] ?? [];
    const next = setAudioCategoryInLibrary(current, item, category);
    if (next !== current) setAudioLibrary(storyId, next);
  }, [setAudioLibrary, storyId]);

  const handleOpenScene = useCallback((targetSceneId: string) => {
    if (!storyId) return;
    router.push({ pathname: '/document-editor', params: { storyId, sceneId: targetSceneId } });
  }, [router, storyId]);

  /**
   * Ownership is additive: the character gets its own sprite pointing at the
   * same file, and no scene is touched. Nothing has to be added to the story's
   * image membership either — the file is already in this grid, and hydration
   * re-derives membership from sprite URIs anyway.
   */
  const handleAttachToCharacter = useCallback((item: StoryMediaItem, characterId: string) => {
    if (!storyId) return;
    // Every write here replaces the whole library, so it has to start from the
    // library as it is now: a sprite the editor or the assistant added since
    // this screen rendered would otherwise be deleted by an unrelated action.
    const latestCharacters = useAppStore.getState().characterLibraries[storyId] ?? [];
    const character = latestCharacters.find((candidate) => candidate.id === characterId);
    if (!character) return;
    const next = attachSpriteToCharacter({
      characters: latestCharacters,
      characterId,
      // The asset id outlives the URI, so it is the better reference of the two.
      ref: item.assetId ?? item.uri,
      name: spriteNameFromFileName(item.name),
      now: Date.now(),
    });
    if (next === latestCharacters) return;
    setCharacterLibrary(storyId, next);
    showToast(t('mediaLibrary.attach.done', { name: character.name }), 'success');
  }, [setCharacterLibrary, storyId, t]);

  /**
   * Detaching is the only irreversible action here: story membership comes back
   * on the next hydration, a sprite does not, and every timeline step naming
   * `${characterId}:${spriteId}` would be left pointing at nothing.
   *
   * So the button being visible is not enough. The store is read again at the
   * moment of the write, the gallery is rebuilt from it, and the owner has to
   * still be unreferenced in that fresh view — which is what catches a scene
   * that finished loading, or another screen's edit, after this one rendered.
   */
  const handleDetachFromCharacter = useCallback((item: StoryMediaItem, owner: MediaOwner) => {
    if (!storyId) return;
    const state = useAppStore.getState();
    const latestCharacters = state.characterLibraries[storyId] ?? [];
    const latestScenes = selectSceneRecordsForStory(storyId)(state);
    // The same completeness question, asked again of the store rather than of
    // the render: scenes can still be missing at the moment of the write.
    if (!usageIsKnowable(sceneLoad === 'loaded', latestScenes, selectStoryMetadata(storyId)(state))) {
      showToast(t('mediaLibrary.detach.refused', { name: owner.characterName }), 'error');
      return;
    }
    const latestOwner = findOwnerInGallery(
      {
        storyId,
        mediaLibrary: state.mediaLibrary,
        imageAssetIdsByStory: state.imageAssetIdsByStory,
        mediaAssetIdsByStory: state.mediaAssetIdsByStory,
        characters: latestCharacters,
        scenes: latestScenes,
      },
      item.key,
      owner.usageAssetId,
    );
    if (!latestOwner || !canDetachOwner(latestOwner)) {
      showToast(t('mediaLibrary.detach.refused', { name: owner.characterName }), 'error');
      return;
    }

    const next = detachSpriteFromCharacter(latestCharacters, owner.characterId, owner.spriteId);
    if (next === latestCharacters) return;
    setCharacterLibrary(storyId, next);
    showToast(t('mediaLibrary.detach.done', { name: owner.characterName }), 'success');
  }, [sceneLoad, setCharacterLibrary, storyId, t]);

  const handleMakeDefaultSprite = useCallback((item: StoryMediaItem, owner: MediaOwner) => {
    if (!storyId) return;
    const latestCharacters = useAppStore.getState().characterLibraries[storyId] ?? [];
    const next = setDefaultSprite(latestCharacters, owner.characterId, owner.spriteId);
    if (next === latestCharacters) return;
    setCharacterLibrary(storyId, next);
    showToast(t('mediaLibrary.makeDefault.done', { name: owner.characterName }), 'success');
  }, [setCharacterLibrary, storyId, t]);

  const isPhone = width < PHONE_MAX_WIDTH;
  const railWidth = isPhone
    ? 0
    : width < RAIL_LABELS_WIDTH ? MEDIA_RAIL_COLLAPSED_WIDTH : MEDIA_RAIL_WIDTH;
  // The panel is the overview until a file is selected, and only where the
  // grid can spare the width for it to stand open.
  const showOverview = !isPhone && width >= OVERVIEW_MIN_WIDTH;
  const panelDocked = !isPhone && (selected !== null || showOverview);
  const reservedWidth = railWidth + (panelDocked ? MEDIA_INSPECTOR_WIDTH : 0);

  /**
   * Headers only earn their space in the unfiltered view. Under a filter or a
   * search they name a group holding every visible row, or split a handful of
   * matches into two lists of one — and a date header is a lie under any order
   * but the one it was built from.
   */
  const grouped = filter.kind === 'all'
    && !query.trim()
    && (view === 'audio' || sort === 'date');

  // Each empty state has to say why it is empty. Telling an author with six
  // images that the story has none, just because none are used yet, reads as a
  // bug in the library rather than an answer to the filter they picked.
  const emptyLabel = query.trim()
    ? t('mediaLibrary.search.empty', { query: query.trim() })
    : filter.kind === 'character'
      ? t('mediaLibrary.empty.character', {
          name: characterFilters.find((item) => item.characterId === filter.characterId)?.name ?? '',
        })
      : filter.kind === 'audioCategory'
        ? t(`mediaLibrary.empty.${filter.category}`)
        : filter.kind === 'used' || filter.kind === 'unused'
          ? t(`mediaLibrary.empty.${filter.kind}`)
          : t(`mediaLibrary.empty.${view === 'image' ? 'images' : view === 'video' ? 'videos' : view === 'audio' ? 'audio' : 'all'}`);

  const browser = (
    <MediaBrowser
      view={view}
      images={images}
      videos={videos}
      audios={audios}
      colors={colors}
      selectedKey={selectedKey}
      grouped={grouped}
      now={Date.now()}
      emptyLabel={emptyLabel}
      usageState={usageState}
      onSelect={(item) => setSelectedKey(item.key)}
      reservedWidth={reservedWidth}
      dense={dense}
      onTogglePlayback={handleTogglePlayback}
      activeAudioKey={preview.activeKey}
      previewState={preview.state}
      progress={preview.progress}
    />
  );

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        {isPhone ? null : (
          <MediaRail
            colors={colors}
            view={view}
            viewCounts={{
              all: gallery.counts.images + gallery.counts.videos + gallery.counts.audios,
              images: gallery.counts.images,
              videos: gallery.counts.videos,
              audios: gallery.counts.audios,
            }}
            onChangeView={handleSwitchView}
            filter={filter}
            filterCounts={filterCounts}
            onChangeFilter={(next) => { setFilter(next); setSelectedKey(null); }}
            characters={characterFilters}
            audioCategories={audioCategories}
            usageReady={usageReady}
            totalBytes={summary.bytes.total}
            unsizedCount={summary.unsizedCount}
            collapsed={width < RAIL_LABELS_WIDTH}
          />
        )}

        <View style={styles.main}>
          <MediaToolbar
            colors={colors}
            storyTitle={story?.title}
            query={query}
            onChangeQuery={setQuery}
            sort={sort}
            onChangeSort={setSort}
            dense={dense}
            onToggleDense={() => setDense((current) => !current)}
            onBack={() => (sceneId && storyId
              ? router.push({ pathname: '/document-editor', params: { storyId, sceneId } })
              : router.back())}
            onAdd={handleAdd}
            compact={isPhone}
          />

          {isPhone ? (
            <>
              <MediaTypeTabs
                colors={colors}
                kind={view}
                counts={{
                  all: gallery.counts.images + gallery.counts.videos + gallery.counts.audios,
                  images: gallery.counts.images,
                  videos: gallery.counts.videos,
                  audios: gallery.counts.audios,
                }}
                onChange={handleSwitchView}
              />
              <MediaFilterRail
                colors={colors}
                filter={filter}
                counts={filterCounts}
                usageReady={usageReady}
                characters={characterFilters}
                audioCategories={audioCategories}
                onChange={(next) => { setFilter(next); setSelectedKey(null); }}
              />
            </>
          ) : null}

          {browser}
        </View>

        {selected ? (
          <MediaInspector
            item={selected}
            colors={colors}
            asSheet={isPhone}
            canRemoveBackground={isBackgroundRemovalSupported()}
            removingBackground={removingBackgroundKey === selected.key}
            characters={gallery.characterFilters}
            currentSceneId={sceneId}
            usageState={usageState}
            onClose={() => setSelectedKey(null)}
            onOpenScene={handleOpenScene}
            onRemoveBackground={handleRemoveBackground}
            onRemoveFromStory={setPendingRemoval}
            onAttachToCharacter={handleAttachToCharacter}
            onDetachFromCharacter={handleDetachFromCharacter}
            onMakeDefaultSprite={handleMakeDefaultSprite}
            onTogglePlayback={selected.kind === 'audio' ? handleTogglePlayback : undefined}
            onSeek={preview.activeKey === selected.key ? preview.seekTo : undefined}
            previewState={preview.activeKey === selected.key ? preview.state : null}
            positionSeconds={preview.positionSeconds}
            durationSeconds={preview.durationSeconds}
            playbackFailed={preview.failedKey === selected.key}
            onSetAudioCategory={selected.kind === 'audio' ? handleSetAudioCategory : undefined}
          />
        ) : showOverview ? (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors['surface-1'], borderLeftColor: colors['border-subtle'] },
            ]}
          >
            <MediaOverviewPanel
              summary={summary}
              colors={colors}
              usageState={usageState}
              onAdd={handleAdd}
              onShowUnused={() => { setFilter({ kind: 'unused' }); setSelectedKey(null); }}
              onSelect={(item) => setSelectedKey(item.key)}
            />
          </View>
        ) : null}
      </View>

      <MediaMenu
        visible={addMenuOpen}
        title={t('mediaLibrary.add.which')}
        colors={colors}
        options={[
          { key: 'image', label: t('mediaLibrary.tab.images'), icon: 'image' },
          { key: 'video', label: t('mediaLibrary.tab.videos'), icon: 'movie' },
          { key: 'audio', label: t('mediaLibrary.tab.audio'), icon: 'music' },
        ]}
        onPick={(key) => {
          setAddMenuOpen(false);
          void addByKind(key as MediaKind);
        }}
        onClose={() => setAddMenuOpen(false)}
      />

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
  main: { flex: 1, minWidth: 0, paddingHorizontal: spacing.lg, gap: spacing.sm },
  panel: { width: MEDIA_INSPECTOR_WIDTH, borderLeftWidth: 1 },
});
