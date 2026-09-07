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

import { MediaBatchBar } from '@/components/media-library/MediaBatchBar';
import { MediaBrowser, mediaBrowserColumns } from '@/components/media-library/MediaBrowser';
import { MediaDropZone } from '@/components/media-library/MediaDropZone';
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
import { ConfirmDialog, PromptDialog } from '@/components/ui';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { useFolderDrag } from '@/hooks/use-folder-drag';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
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
import { classifyDroppedFiles } from '@/lib/media-drop';
import {
  MAX_FOLDER_NAME_LENGTH,
  MAX_TAGS_PER_FILE,
  MAX_TAG_LENGTH,
  sameLabel,
  folderForMedia,
  organizationForStory,
  summarizeOrganization,
  tagsForMedia,
} from '@/lib/media-organization';
import { sortMediaItems, type MediaSort, type MediaView } from '@/lib/media-browser-rows';
import { summarizeStoryMedia } from '@/lib/media-library-overview';
import { describePickedAudioFile, pickAudioFromDevice, type PickAudioResult } from '@/lib/pick-audio';
import { describePickedImageFile, pickImageFromDevice, type PickedImage } from '@/lib/pick-image';
import { describePickedVideoFile, pickVideoFromDevice, type PickVideoResult } from '@/lib/pick-video';
import { isBackgroundRemovalSupported, removeImageBackground } from '@/lib/remove-background';
import {
  buildStoryMediaGallery,
  canDetachOwner,
  canRemoveFromStory,
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
  const mediaOrganizationByStory = useAppStore((state) => state.mediaOrganizationByStory);
  const createMediaFolder = useAppStore((state) => state.createMediaFolder);
  const renameMediaFolder = useAppStore((state) => state.renameMediaFolder);
  const deleteMediaFolder = useAppStore((state) => state.deleteMediaFolder);
  const moveMediaToFolder = useAppStore((state) => state.moveMediaToFolder);
  const addMediaTag = useAppStore((state) => state.addMediaTag);
  const removeMediaTag = useAppStore((state) => state.removeMediaTag);

  // The library opens on everything it holds. Three kind-tabs made a story with
  // a handful of files look like three empty rooms; the combined view is the
  // answer to "what does this story have", which is why the screen is opened.
  const [view, setView] = useState<MediaView>('all');
  const [filter, setFilter] = useState<ImageFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MediaSort>('date');
  const [dense, setDense] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Files the author has ticked, and whether ticking is what a press does. */
  const [checked, setChecked] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchAttachOpen, setBatchAttachOpen] = useState(false);
  /** Removal is confirmed for a list, so one dialog serves one file or twelve. */
  const [pendingRemoval, setPendingRemoval] = useState<StoryMediaItem[]>([]);
  const [removingBackgroundKey, setRemovingBackgroundKey] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  /**
   * Filing, which is the one part of this screen the story cannot answer for
   * itself. `folderPrompt` covers both naming a new folder and renaming one;
   * `tagTarget` is the files a typed tag will land on.
   */
  const [folderPrompt, setFolderPrompt] = useState<
    { folderId: string | null; moveKeys?: string[] } | null
  >(null);
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);
  const [pendingFolderDeletion, setPendingFolderDeletion] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<string[] | null>(null);
  const [moveTarget, setMoveTarget] = useState<string[] | null>(null);
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

  const organization = useMemo(
    () => organizationForStory(mediaOrganizationByStory, storyId ?? ''),
    [mediaOrganizationByStory, storyId],
  );

  const shown = useMemo(() => {
    const kept = filterMediaItems(source, filter, query, organization);
    return sortMediaItems(kept, sort);
  }, [filter, organization, query, sort, source]);

  /**
   * Counted over the open view rather than the whole story: a 12 beside a
   * folder holding one of the clips on screen reads as a filter that is broken.
   */
  const organizationSummary = useMemo(
    () => summarizeOrganization(source, organization),
    [organization, source],
  );

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
   * Persisting one picked file, whichever way it was picked. The dialog and a
   * drop hand over the same three shapes, so the store writes and the toasts
   * live here and both callers reuse them.
   */
  const applyPickedImage = useCallback(async (picked: PickedImage | null) => {
    if (!storyId || !picked) return false;
    try {
      const asset = await addAssetToLibrary(picked.uri, picked.name, 'image');
      addImage(storyId, asset.id);
      return true;
    } catch {
      showToast(t('storyHome.imageAddFailed'), 'error');
      return false;
    }
  }, [addImage, storyId, t]);

  const applyPickedVideo = useCallback(async (picked: PickVideoResult) => {
    if (!storyId || picked.status === 'cancelled') return false;
    if (picked.status !== 'picked') {
      showToast(t(`mediaLibrary.video.${picked.status}`), 'error');
      return false;
    }
    try {
      const asset = await addAssetToLibrary(picked.video.uri, picked.video.name, 'video', {
        mimeType: picked.video.mimeType,
        size: picked.video.size,
        durationSeconds: picked.video.durationSeconds,
      });
      addMedia(storyId, asset.id);
      return true;
    } catch {
      showToast(t('mediaLibrary.video.addFailed'), 'error');
      return false;
    } finally {
      // The object URL only had to survive the copy into storage.
      picked.video.release?.();
    }
  }, [addMedia, storyId, t]);

  const applyPickedAudio = useCallback(async (picked: PickAudioResult) => {
    if (!storyId || picked.status === 'cancelled') return false;
    if (picked.status !== 'picked') {
      showToast(t(`mediaLibrary.audio.${picked.status}`), 'error');
      return false;
    }
    try {
      const asset = await addAssetToLibrary(picked.audio.uri, picked.audio.name, 'audio', {
        mimeType: picked.audio.mimeType,
        size: picked.audio.size,
        durationSeconds: picked.audio.durationSeconds,
      });
      addMedia(storyId, asset.id);
      return true;
    } catch {
      showToast(t('mediaLibrary.audio.addFailed'), 'error');
      return false;
    } finally {
      picked.audio.release?.();
    }
  }, [addMedia, storyId, t]);

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
        if (await applyPickedImage(picked)) showToast(t('storyHome.imageAdded'), 'success');
      } catch {
        showToast(t('storyHome.imageAddFailed'), 'error');
      }
      return;
    }
    if (kind === 'audio') {
      if (await applyPickedAudio(await pickAudioFromDevice())) {
        showToast(t('mediaLibrary.audio.added'), 'success');
      }
      return;
    }
    if (await applyPickedVideo(await pickVideoFromDevice())) {
      showToast(t('mediaLibrary.video.added'), 'success');
    }
  }, [applyPickedAudio, applyPickedImage, applyPickedVideo, storyId, t]);

  /**
   * Files dropped onto the library. One gesture can carry a background, a clip
   * and two sounds, so each is sorted to its own path — and a file of a kind
   * the library has no place for is said out loud rather than dropped silently.
   */
  const handleDropFiles = useCallback(async (files: File[]) => {
    if (!storyId || !files.length) return;
    const groups = classifyDroppedFiles(files);
    let added = 0;

    for (const file of groups.image) {
      if (await applyPickedImage(await describePickedImageFile(file))) added += 1;
    }
    for (const file of groups.video) {
      if (await applyPickedVideo(await describePickedVideoFile(file))) added += 1;
    }
    for (const file of groups.audio) {
      if (await applyPickedAudio(await describePickedAudioFile(file))) added += 1;
    }

    if (added) showToast(t('mediaLibrary.drop.added', { count: added }), 'success');
    if (groups.rejected.length) showToast(t('mediaLibrary.drop.rejected'), 'error');
  }, [applyPickedAudio, applyPickedImage, applyPickedVideo, storyId, t]);

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

  /**
   * Removing one file from the story. Images have their own membership list;
   * video and audio share `mediaAssetIdsByStory`.
   */
  const removeOne = useCallback((item: StoryMediaItem) => {
    if (!storyId || !item.assetId) return;
    if (item.kind === 'image') removeImage(storyId, item.assetId);
    else removeMedia(storyId, item.assetId);

    if (item.kind === 'audio') {
      // The story's audio library is re-read into membership on every
      // hydration, so a leftover entry would quietly bring the file back on
      // the next launch. The entry describes a file of this story, and the
      // file is the thing being removed.
      const entries = useAppStore.getState().audioLibraries[storyId] ?? [];
      const remaining = entries.filter(
        (entry) => entry.id !== item.assetId && entry.uri !== item.uri,
      );
      if (remaining.length !== entries.length) setAudioLibrary(storyId, remaining);
    }
  }, [removeImage, removeMedia, setAudioLibrary, storyId]);

  const handleConfirmRemoval = useCallback(() => {
    pendingRemoval.forEach(removeOne);
    if (pendingRemoval.length > 1) {
      showToast(t('mediaLibrary.batch.removed', { count: pendingRemoval.length }), 'success');
    }
    setSelectedKey(null);
    setChecked([]);
    setPickMode(false);
    setPendingRemoval([]);
  }, [pendingRemoval, removeOne, t]);

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

  // ── Picking files ────────────────────────────────────────────────────
  const picking = pickMode || checked.length > 0;
  const checkedKeys = useMemo(() => new Set(checked), [checked]);
  const checkedItems = useMemo(
    () => shown.filter((item) => checkedKeys.has(item.key)),
    [checkedKeys, shown],
  );
  /**
   * What "delete" would actually do. Story membership is re-derived from scene
   * references on every hydration, so removing a file a scene still names does
   * not survive a restart — and until the scenes are read, nothing is known to
   * be safe.
   */
  const removableChecked = useMemo(
    () => (usageReady ? checkedItems.filter(canRemoveFromStory) : []),
    [checkedItems, usageReady],
  );
  const checkedImagesOnly = checkedItems.length > 0
    && checkedItems.every((item) => item.kind === 'image');

  const clearPicking = useCallback(() => {
    setChecked([]);
    setPickMode(false);
  }, []);

  const toggleChecked = useCallback((item: StoryMediaItem) => {
    setChecked((current) => (current.includes(item.key)
      ? current.filter((key) => key !== item.key)
      : [...current, item.key]));
  }, []);

  /** A press means "tick this" while picking, and "open this" otherwise. */
  const handlePressItem = useCallback((item: StoryMediaItem) => {
    if (picking) toggleChecked(item);
    else setSelectedKey(item.key);
  }, [picking, toggleChecked]);

  /** Holding a file is the other way into select mode, with that file ticked. */
  const handleLongPressItem = useCallback((item: StoryMediaItem) => {
    setPickMode(true);
    setSelectedKey(null);
    setChecked((current) => (current.includes(item.key) ? current : [...current, item.key]));
  }, []);

  // A file that leaves the view — through a filter, a search, a removal — is no
  // longer something the batch actions can act on, so it stops being ticked.
  useEffect(() => {
    setChecked((current) => {
      const visible = current.filter((key) => shown.some((item) => item.key === key));
      return visible.length === current.length ? current : visible;
    });
  }, [shown]);

  const handleBatchAttach = useCallback((characterId: string) => {
    if (!storyId) return;
    const latestCharacters = useAppStore.getState().characterLibraries[storyId] ?? [];
    const character = latestCharacters.find((candidate) => candidate.id === characterId);
    if (!character) return;

    // One write for the whole batch: every attach replaces the entire library,
    // so applying them one at a time would have each overwrite the last.
    let next = latestCharacters;
    let added = 0;
    for (const item of checkedItems) {
      if (item.kind !== 'image') continue;
      const applied = attachSpriteToCharacter({
        characters: next,
        characterId,
        // The asset id outlives the URI, so it is the better reference.
        ref: item.assetId ?? item.uri,
        name: spriteNameFromFileName(item.name),
        now: Date.now(),
      });
      if (applied !== next) {
        next = applied;
        added += 1;
      }
    }
    if (!added) return;
    setCharacterLibrary(storyId, next);
    showToast(t('mediaLibrary.batch.attached', { count: added, name: character.name }), 'success');
    clearPicking();
  }, [checkedItems, clearPicking, setCharacterLibrary, storyId, t]);

  const handleBatchRemoveBackground = useCallback(async () => {
    if (!storyId || batchBusy) return;
    setBatchBusy(true);
    let made = 0;
    try {
      for (const item of checkedItems) {
        if (item.kind !== 'image') continue;
        try {
          const resolved = await resolveAssetUri(item.uri);
          if (typeof resolved !== 'string') continue;
          const uri = await removeImageBackground(resolved);
          const name = item.name.replace(/\.(png|jpe?g|webp)$/i, '');
          const created = await addAssetToLibrary(uri, `${name} (cutout).png`, 'image');
          addImage(storyId, created.id);
          made += 1;
        } catch {
          // One image that will not cut out must not abandon the rest; the
          // count at the end is what the author is told.
        }
      }
    } finally {
      setBatchBusy(false);
    }
    if (made) {
      showToast(t('mediaLibrary.batch.cutouts', { count: made }), 'success');
      clearPicking();
    } else {
      showToast(t('storyHome.backgroundRemoveFailed'), 'error');
    }
  }, [addImage, batchBusy, checkedItems, clearPicking, storyId, t]);

  const isPhone = width < PHONE_MAX_WIDTH;
  const railWidth = isPhone
    ? 0
    : width < RAIL_LABELS_WIDTH ? MEDIA_RAIL_COLLAPSED_WIDTH : MEDIA_RAIL_WIDTH;
  // The panel is the overview until a file is selected, and only where the
  // grid can spare the width for it to stand open.
  const showOverview = !isPhone && width >= OVERVIEW_MIN_WIDTH;
  const panelDocked = !isPhone && (selected !== null || showOverview);
  const reservedWidth = railWidth + (panelDocked ? MEDIA_INSPECTOR_WIDTH : 0);

  // ── Filing ───────────────────────────────────────────────────────────
  /**
   * Naming a folder and renaming one are the same dialog; which it is depends
   * only on whether an id came with it.
   */
  const submitFolderName = useCallback((name: string) => {
    if (!storyId || !folderPrompt) return;
    const taken = organization.folders.some(
      (folder) => folder.id !== folderPrompt.folderId && sameLabel(folder.name, name),
    );
    if (taken) {
      // The model would refuse this silently; silence looks like a dialog that
      // did nothing.
      showToast(t('mediaLibrary.folder.taken', { name }), 'error');
      return;
    }
    if (folderPrompt.folderId) {
      renameMediaFolder(storyId, folderPrompt.folderId, name);
    } else {
      const folderId = createMediaFolder(storyId, name);
      // Reached from the move menu: the files go in rather than the author
      // being sent back to find the folder they just named.
      if (folderId && folderPrompt.moveKeys?.length) {
        moveMediaToFolder(storyId, folderPrompt.moveKeys, folderId);
        showToast(
          t('mediaLibrary.folder.moved', { count: folderPrompt.moveKeys.length, name }),
          'success',
        );
        if (folderPrompt.moveKeys.length > 1) clearPicking();
      }
    }
    setFolderPrompt(null);
  }, [
    clearPicking,
    createMediaFolder,
    folderPrompt,
    moveMediaToFolder,
    organization.folders,
    renameMediaFolder,
    storyId,
    t,
  ]);

  const confirmFolderDeletion = useCallback(() => {
    if (!storyId || !pendingFolderDeletion) return;
    deleteMediaFolder(storyId, pendingFolderDeletion);
    // The filter would otherwise keep hiding everything on the strength of a
    // folder that is gone.
    setFilter((current) => (current.kind === 'folder' && current.folderId === pendingFolderDeletion
      ? { kind: 'all' }
      : current));
    setPendingFolderDeletion(null);
  }, [deleteMediaFolder, pendingFolderDeletion, storyId]);

  const submitMove = useCallback((folderId: string | null) => {
    if (!storyId || !moveTarget) return;
    moveMediaToFolder(storyId, moveTarget, folderId);
    const folder = organization.folders.find((entry) => entry.id === folderId);
    showToast(
      folder
        ? t('mediaLibrary.folder.moved', { count: moveTarget.length, name: folder.name })
        : t('mediaLibrary.folder.removedFrom'),
      'success',
    );
    setMoveTarget(null);
    if (moveTarget.length > 1) clearPicking();
  }, [clearPicking, moveMediaToFolder, moveTarget, organization.folders, storyId, t]);

  const submitTag = useCallback((tag: string) => {
    if (!storyId || !tagTarget) return;
    // One file already carrying its dozen would take the tag nowhere, and the
    // dialog closing on nothing is the least honest thing this screen could do.
    const full = tagTarget.length === 1
      && tagsForMedia(organization, tagTarget[0]).length >= MAX_TAGS_PER_FILE;
    if (full) {
      showToast(t('mediaLibrary.tag.full', { count: MAX_TAGS_PER_FILE }), 'error');
      return;
    }
    addMediaTag(storyId, tagTarget, tag);
    showToast(t('mediaLibrary.tag.added', { count: tagTarget.length, tag }), 'success');
    setTagTarget(null);
    if (tagTarget.length > 1) clearPicking();
  }, [addMediaTag, clearPicking, organization, storyId, t, tagTarget]);

  const handleRemoveTag = useCallback((item: StoryMediaItem, tag: string) => {
    if (!storyId) return;
    removeMediaTag(storyId, [item.key], tag);
  }, [removeMediaTag, storyId]);

  /** Dropping a tile on a folder row is the same move the menu makes. */
  const handleDropOnFolder = useCallback((keys: string[], folderId: string | null) => {
    if (!storyId || !keys.length) return;
    moveMediaToFolder(storyId, keys, folderId);
    const folder = organization.folders.find((entry) => entry.id === folderId);
    showToast(
      folder
        ? t('mediaLibrary.folder.moved', { count: keys.length, name: folder.name })
        : t('mediaLibrary.folder.removedFrom'),
      'success',
    );
  }, [moveMediaToFolder, organization.folders, storyId, t]);

  /**
   * Dragging a tile sideways onto a folder. Only where there is a rail to drop
   * onto: a phone files through the inspector and the batch bar instead.
   */
  const folderDrag = useFolderDrag(handleDropOnFolder, width >= PHONE_MAX_WIDTH);

  /** A drag from a ticked tile carries everything ticked; otherwise, just it. */
  const keysForDrag = useCallback(
    (item: StoryMediaItem) => (checked.includes(item.key) ? checked : [item.key]),
    [checked],
  );

  // ── Keyboard ─────────────────────────────────────────────────────────
  /**
   * Selection is the cursor here: the arrows move it, and the panel follows,
   * so there is nothing to explain about a focus ring that means something
   * different from the file that is open.
   */
  const moveSelection = useCallback((delta: number) => {
    if (!shown.length) return;
    const current = shown.findIndex((item) => item.key === selectedKey);
    // Nothing selected yet: an arrow starts at the first file rather than
    // scrolling the page, which is what the browser would otherwise do.
    const next = current < 0
      ? (delta > 0 ? 0 : shown.length - 1)
      : Math.min(shown.length - 1, Math.max(0, current + delta));
    setSelectedKey(shown[next].key);
  }, [selectedKey, shown]);

  // One row is however many tiles the grid actually drew. Sounds are rows of
  // one, so in the audio view up and down move by a single file.
  const columns = mediaBrowserColumns(width, reservedWidth, dense);
  const verticalStep = view === 'audio' ? 1 : columns;

  useKeyboardShortcuts({
    shortcuts: {
      previous: { key: 'arrowleft', handler: () => moveSelection(-1) },
      next: { key: 'arrowright', handler: () => moveSelection(1) },
      rowUp: { key: 'arrowup', handler: () => moveSelection(-verticalStep) },
      rowDown: { key: 'arrowdown', handler: () => moveSelection(verticalStep) },
      play: {
        key: ' ',
        handler: () => { if (selected?.kind === 'audio') handleTogglePlayback(selected); },
      },
      tick: {
        key: 'enter',
        handler: () => { if (selected) toggleChecked(selected); },
      },
      remove: {
        key: 'delete',
        handler: () => {
          // The same gate the button is behind: a file a scene still names
          // would come back on the next hydration.
          if (selected && usageReady && canRemoveFromStory(selected)) setPendingRemoval([selected]);
        },
      },
      dismiss: {
        key: 'escape',
        handler: () => {
          if (picking) clearPicking();
          else setSelectedKey(null);
        },
      },
    },
  });

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
        : filter.kind === 'folder'
          ? t('mediaLibrary.empty.folder', {
              name: organizationSummary.folders.find((folder) => folder.id === filter.folderId)?.name ?? '',
            })
          : filter.kind === 'tag'
            ? t('mediaLibrary.empty.tag', { tag: filter.tag })
            : filter.kind === 'used' || filter.kind === 'unused' || filter.kind === 'unfiled'
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
      onSelect={handlePressItem}
      onLongPress={handleLongPressItem}
      picking={picking}
      checkedKeys={checkedKeys}
      reservedWidth={reservedWidth}
      dense={dense}
      onTogglePlayback={handleTogglePlayback}
      activeAudioKey={preview.activeKey}
      previewState={preview.state}
      progress={preview.progress}
      drag={folderDrag}
      keysForDrag={keysForDrag}
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
            organization={organizationSummary}
            onCreateFolder={() => setFolderPrompt({ folderId: null })}
            onEditFolder={setFolderMenuFor}
            drag={folderDrag}
            collapsed={width < RAIL_LABELS_WIDTH}
          />
        )}

        <MediaDropZone colors={colors} onDropFiles={handleDropFiles} style={styles.main}>
          <MediaToolbar
            colors={colors}
            storyTitle={story?.title}
            query={query}
            onChangeQuery={setQuery}
            sort={sort}
            onChangeSort={setSort}
            dense={dense}
            onToggleDense={() => setDense((current) => !current)}
            picking={picking}
            onTogglePicking={() => (picking ? clearPicking() : setPickMode(true))}
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
                organization={organizationSummary}
                onChange={(next) => { setFilter(next); setSelectedKey(null); }}
              />
            </>
          ) : null}

          {picking && checked.length ? (
            <MediaBatchBar
              colors={colors}
              count={checkedItems.length}
              removableCount={removableChecked.length}
              imagesOnly={checkedImagesOnly}
              canRemoveBackground={isBackgroundRemovalSupported()}
              usageReady={usageReady}
              busy={batchBusy}
              onMoveToFolder={() => setMoveTarget(checked)}
              onAddTag={() => setTagTarget(checked)}
              onAttachToCharacter={() => setBatchAttachOpen(true)}
              onRemoveBackground={() => { void handleBatchRemoveBackground(); }}
              onRemove={() => setPendingRemoval(removableChecked)}
              onClear={clearPicking}
            />
          ) : null}

          {browser}
        </MediaDropZone>

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
            onRemoveFromStory={(item) => setPendingRemoval([item])}
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
            folderName={folderForMedia(organization, selected.key)?.name ?? null}
            tags={tagsForMedia(organization, selected.key)}
            onMoveToFolder={(item) => setMoveTarget([item.key])}
            onAddTag={(item) => setTagTarget([item.key])}
            onRemoveTag={handleRemoveTag}
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

      <MediaMenu
        visible={batchAttachOpen}
        title={t('mediaLibrary.action.addToCharacter')}
        colors={colors}
        options={gallery.characterFilters.map((character) => ({
          key: character.characterId,
          label: t('mediaLibrary.attach.option', { name: character.name }),
          icon: 'character' as const,
        }))}
        onPick={(key) => {
          setBatchAttachOpen(false);
          handleBatchAttach(key);
        }}
        onClose={() => setBatchAttachOpen(false)}
      />

      <PromptDialog
        visible={folderPrompt !== null}
        title={t(folderPrompt?.folderId ? 'mediaLibrary.folder.rename' : 'mediaLibrary.folder.createTitle')}
        initialValue={folderPrompt?.folderId
          ? organization.folders.find((folder) => folder.id === folderPrompt.folderId)?.name ?? ''
          : ''}
        placeholder={t('mediaLibrary.folder.namePlaceholder')}
        maxLength={MAX_FOLDER_NAME_LENGTH}
        onConfirm={submitFolderName}
        onCancel={() => setFolderPrompt(null)}
      />

      <PromptDialog
        visible={tagTarget !== null}
        title={t('mediaLibrary.tag.addTitle')}
        placeholder={t('mediaLibrary.tag.placeholder')}
        maxLength={MAX_TAG_LENGTH}
        onConfirm={submitTag}
        onCancel={() => setTagTarget(null)}
      />

      <MediaMenu
        visible={folderMenuFor !== null}
        title={organization.folders.find((folder) => folder.id === folderMenuFor)?.name ?? ''}
        colors={colors}
        options={[
          { key: 'rename', label: t('mediaLibrary.folder.rename'), icon: 'editor' as const },
          { key: 'delete', label: t('mediaLibrary.folder.delete'), icon: 'delete' as const },
        ]}
        onPick={(key) => {
          const folderId = folderMenuFor;
          setFolderMenuFor(null);
          if (!folderId) return;
          if (key === 'rename') setFolderPrompt({ folderId });
          else setPendingFolderDeletion(folderId);
        }}
        onClose={() => setFolderMenuFor(null)}
      />

      <MediaMenu
        visible={moveTarget !== null}
        title={t('mediaLibrary.folder.move')}
        colors={colors}
        options={[
          ...organization.folders.map((folder) => ({
            key: folder.id,
            label: folder.name,
            icon: 'files' as const,
          })),
          { key: '', label: t('mediaLibrary.folder.none'), icon: 'question' as const },
          { key: 'new', label: t('mediaLibrary.folder.create'), icon: 'add' as const },
        ]}
        onPick={(key) => {
          if (key === 'new') {
            // The files follow the name into the folder it makes.
            setFolderPrompt({ folderId: null, moveKeys: moveTarget ?? [] });
            setMoveTarget(null);
            return;
          }
          submitMove(key || null);
        }}
        onClose={() => setMoveTarget(null)}
      />

      <ConfirmDialog
        visible={pendingFolderDeletion !== null}
        title={t('mediaLibrary.folder.deleteTitle')}
        message={t('mediaLibrary.folder.deleteMessage', {
          name: organization.folders.find((folder) => folder.id === pendingFolderDeletion)?.name ?? '',
          count: organizationSummary.folders.find((folder) => folder.id === pendingFolderDeletion)?.count ?? 0,
        })}
        confirmLabel={t('common.delete')}
        onConfirm={confirmFolderDeletion}
        onCancel={() => setPendingFolderDeletion(null)}
        destructive
      />

      <ConfirmDialog
        visible={pendingRemoval.length > 0}
        title={t('mediaLibrary.remove.confirmTitle')}
        message={pendingRemoval.length === 1
          ? t('mediaLibrary.remove.confirmMessage', { name: pendingRemoval[0]?.name ?? '' })
          : t('mediaLibrary.remove.confirmManyMessage', { count: pendingRemoval.length })}
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval([])}
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
