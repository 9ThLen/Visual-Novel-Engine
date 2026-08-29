import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { AssetUsageCard } from '@/components/story-home/AssetUsageCard';
import { ChoiceStatisticsCard } from '@/components/story-home/ChoiceStatisticsCard';
import { PlaytestCoverageCard } from '@/components/story-home/PlaytestCoverageCard';
import { ReleaseCard, type PublishRequest } from '@/components/story-home/ReleaseCard';
import { ReleaseChecklistCard } from '@/components/story-home/ReleaseChecklistCard';
import { StoryHealthCard } from '@/components/story-home/StoryHealthCard';
import { StorySnapshotsCard } from '@/components/story-home/StorySnapshotsCard';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha } from '@/lib/_core/theme';
import { navigateWithViewTransition } from '@/lib/navigation-transition';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { showToast } from '@/lib/toast-store';
import { pickImageFromDevice } from '@/lib/pick-image';
import { saveStoryExport } from '@/lib/export-story-file';
import { exportStory, MAX_STORY_TAGS, MAX_STORY_TAG_LENGTH, sanitizeStoryTags } from '@/lib/story-hooks';
import {
  exportFullStoryBackup,
  type StoryBackupProgress,
} from '@/lib/story-backup/service';
import { computeStoryStats } from '@/lib/story-stats';
import { runStoryDoctor } from '@/lib/story-doctor';
import { runReleasePreflight } from '@/lib/release/preflight';
import { highestReleaseVersion, type ReleaseMeta } from '@/lib/release/release-storage';
import { publishStoryRelease } from '@/lib/release/service';
import { createPersistentStorage } from '@/lib/persistent-storage';
import {
  EMPTY_STORY_COVERAGE,
  computeCoverageReport,
  getChoiceStats,
  loadCoverage,
  saveCoverage,
  type StoryCoverage,
} from '@/lib/story-coverage';
import { getPlaybackAudioLibraryPure } from '@/lib/audio-library';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { getStoryGalleryImageAssets } from '@/lib/story-image-library';
import { buildStoryAssetUsageReport } from '@/lib/story-home/asset-report';
import {
  buildOverviewState,
  verdictTone,
  type OverviewTileKey,
  type OverviewTone,
} from '@/lib/story-home/overview-state';
import type { StoryMetadata } from '@/lib/story-domain';
import { CONTENT_RATINGS, sanitizeStoryLanguages, type ContentRating } from '@/lib/story-publication';
import { formatNumber } from '@/lib/format-number';
import type { SceneRecord } from '@/lib/engine/types';
import { selectSceneRecordsForStory, useAppStore } from '@/stores/use-app-store';

/** Stable identity so the store selector cannot loop by returning a new []. */
const EMPTY_RELEASES: ReleaseMeta[] = [];

/**
 * Keyed by the app's language, not the browser's: «Updated» in English beside a
 * date in the OS locale reads as two different products.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatterFor(language: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(language);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  dateFormatters.set(language, formatter);
  return formatter;
}

/** One reading column; the paper pattern frames it on either side. */
const COLUMN_MAX_WIDTH = 920;
/** Thumbnails before the strip turns into «+N». */
const GALLERY_PREVIEW_COUNT = 6;

const rabbitsPattern = require('../assets/background/bg-rabbits-pattern-soft.png');
const rabbitsPatternAsset = Asset.fromModule(rabbitsPattern);
const rabbitsPatternUri = rabbitsPatternAsset.localUri ?? rabbitsPatternAsset.uri;
const rabbitsPatternBackground = Platform.select({
  web: {
    backgroundImage: rabbitsPatternUri ? `url("${rabbitsPatternUri}")` : undefined,
    backgroundPosition: 'top center',
    backgroundRepeat: 'repeat',
    backgroundSize: '560px 560px',
  },
  default: {},
}) as object;

// Soft elevation for the light "paper" surfaces. Web gets a crisp layered
// box-shadow; native falls back to platform shadow props.
const shadowCard = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(17, 17, 26, 0.04), 0 6px 20px rgba(17, 17, 26, 0.05)' },
  default: {
    shadowColor: '#0b0b12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
}) as object;

const shadowCover = Platform.select({
  web: { boxShadow: '0 14px 32px rgba(17, 17, 26, 0.20)' },
  default: {
    shadowColor: '#0b0b12',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
}) as object;

/**
 * Pick the scene the document editor should open for this story: the declared
 * start scene when it still exists, otherwise the flagged start, otherwise the
 * first scene available. Mirrors the resolution used by the editor list.
 */
function getPaperEditorSceneId(
  story: StoryMetadata,
  scenesById: Record<string, SceneRecord> | undefined,
): string | null {
  if (story.startSceneId && scenesById?.[story.startSceneId]) {
    return story.startSceneId;
  }
  const scenes = Object.values(scenesById ?? {});
  return scenes.find((scene) => scene.isStart)?.id ?? scenes[0]?.id ?? null;
}

export default function StoryHomeScreen() {
  const router = useRouter();
  // This hub is a deliberately light "studio" surface, independent of the app
  // theme — a calm bright space between the dark editor and the dark reader.
  const colors = useColors('light');
  const { t, pluralize, language } = useI18n();
  const { width } = useWindowDimensions();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  // The passport lays cover and fields side by side once there is room for both.
  const passportWide = width >= 700;
  // Four tiles in a row need about 130 px each before the labels start to clip.
  const tilesTwoUp = width < 560;

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
  const isLoaded = useAppStore((state) => state.isLoaded);
  const hydrateSceneRecordsForStory = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const updateStoryMetadata = useAppStore((state) => state.updateStoryMetadata);
  const [hydrated, setHydrated] = useState(false);
  const coverageStorageRef = useRef<ReturnType<typeof createPersistentStorage> | null>(null);
  if (!coverageStorageRef.current) coverageStorageRef.current = createPersistentStorage();
  const [coverage, setCoverage] = useState<StoryCoverage>(EMPTY_STORY_COVERAGE);

  const story = useMemo(
    () => storiesMetadata.find((item) => item.id === storyId) ?? null,
    [storiesMetadata, storyId],
  );

  // Local drafts for free-text fields; committed to the store on blur so we do
  // not thrash `updatedAt` and re-render on every keystroke.
  const [titleDraft, setTitleDraft] = useState('');
  const [authorDraft, setAuthorDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    setTitleDraft(story?.title ?? '');
    setAuthorDraft(story?.author ?? '');
    setDescriptionDraft(story?.description ?? '');
  }, [story?.id, story?.title, story?.author, story?.description]);

  const tags = useMemo(() => story?.tags ?? [], [story?.tags]);

  const commitTitle = useCallback(() => {
    if (!story) return;
    const next = titleDraft.trim();
    if (next && next !== story.title) updateStoryMetadata(story.id, { title: next });
    else if (!next) setTitleDraft(story.title ?? '');
  }, [story, titleDraft, updateStoryMetadata]);

  const commitAuthor = useCallback(() => {
    if (!story) return;
    const next = authorDraft.trim();
    if (next !== (story.author ?? '')) updateStoryMetadata(story.id, { author: next });
  }, [story, authorDraft, updateStoryMetadata]);

  const [languagesDraft, setLanguagesDraft] = useState('');
  useEffect(() => {
    setLanguagesDraft((story?.languages ?? []).join(', '));
  }, [story?.languages]);

  const commitLanguages = useCallback(() => {
    if (!story) return;
    // Sanitized on blur rather than on every keystroke, so a half-typed "u"
    // does not vanish under the author.
    const next = sanitizeStoryLanguages(languagesDraft.split(','));
    setLanguagesDraft((next ?? []).join(', '));
    if ((next ?? []).join(',') !== (story.languages ?? []).join(',')) {
      updateStoryMetadata(story.id, { languages: next });
    }
  }, [languagesDraft, story, updateStoryMetadata]);

  const commitContentRating = useCallback((rating: ContentRating) => {
    if (story) updateStoryMetadata(story.id, { contentRating: rating });
  }, [story, updateStoryMetadata]);

  const commitDescription = useCallback(() => {
    if (!story) return;
    const next = descriptionDraft.trim();
    if (next !== (story.description ?? '')) updateStoryMetadata(story.id, { description: next });
  }, [story, descriptionDraft, updateStoryMetadata]);

  const handleAddTag = useCallback(() => {
    if (!story) return;
    const candidate = sanitizeStoryTags([...tags, tagInput]);
    if (!candidate) {
      setTagInput('');
      return;
    }
    if (candidate.length === tags.length) {
      // Nothing new (duplicate or empty) — or the cap was already reached.
      if (tags.length >= MAX_STORY_TAGS) {
        showToast(t('storyHome.tagLimitReached', { max: MAX_STORY_TAGS }), 'error');
      }
      setTagInput('');
      return;
    }
    updateStoryMetadata(story.id, { tags: candidate });
    setTagInput('');
  }, [story, tags, tagInput, updateStoryMetadata, t]);

  const handleRemoveTag = useCallback((tag: string) => {
    if (!story) return;
    const next = tags.filter((item) => item !== tag);
    updateStoryMetadata(story.id, { tags: next.length > 0 ? next : undefined });
  }, [story, tags, updateStoryMetadata]);

  const handlePickCover = useCallback(async () => {
    if (!story) return;
    try {
      const picked = await pickImageFromDevice();
      if (!picked) return;
      const asset = await addAssetToLibrary(picked.uri, picked.name, 'image');
      useAppStore.getState().addImageAssetToStory(story.id, asset.id);
      updateStoryMetadata(story.id, { thumbnailUri: asset.uri });
      showToast(t('storyHome.coverUpdated'), 'success');
    } catch {
      showToast(t('storyHome.coverFailed'), 'error');
    }
  }, [story, updateStoryMetadata, t]);

  const handleRemoveCover = useCallback(() => {
    if (!story) return;
    updateStoryMetadata(story.id, { thumbnailUri: undefined });
  }, [story, updateStoryMetadata]);

  const [showExportWarning, setShowExportWarning] = useState(false);
  const [showResetCoverage, setShowResetCoverage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState<StoryBackupProgress | null>(null);

  const handleFullBackup = useCallback(async () => {
    if (!story || backingUp) return;
    setBackingUp(true);
    try {
      await exportFullStoryBackup(story.id, story.title || 'story', setBackupProgress);
      showToast(t('storyHome.fullBackupSuccess'), 'success');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        showToast(`${t('storyHome.fullBackupFailed')}${detail}`, 'error');
      }
    } finally {
      setBackupProgress(null);
      setBackingUp(false);
    }
  }, [story, backingUp, t]);

  const handleExport = useCallback(async () => {
    if (!story) return;
    setShowExportWarning(false);
    setExporting(true);
    try {
      // Hydrate first: exportStory reads only the current store, and scenes may
      // be only partially loaded until the full window is pulled in.
      await hydrateSceneRecordsForStory(story.id);
      const json = await exportStory(story.id, useAppStore.getState());
      await saveStoryExport(story.title || 'story', json);
      showToast(t('storyHome.exportSuccess'), 'success');
    } catch {
      showToast(t('storyHome.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  }, [story, hydrateSceneRecordsForStory, t]);

  // Statistics and readiness derive from the (hydrated) scene graph.
  const sceneRecords = useAppStore(
    useMemo(() => (storyId ? selectSceneRecordsForStory(storyId) : () => [] as SceneRecord[]), [storyId]),
  );
  const characterCount = useAppStore((state) =>
    storyId ? state.characterLibraries[storyId]?.length ?? 0 : 0,
  );
  const characterLibrary = useAppStore((state) =>
    storyId ? state.characterLibraries[storyId] ?? [] : [],
  );
  const releases = useAppStore((state) => (storyId ? state.releasesByStory[storyId] ?? EMPTY_RELEASES : EMPTY_RELEASES));
  const loadReleasesForStory = useAppStore((state) => state.loadReleasesForStory);
  const setReleasePublished = useAppStore((state) => state.setReleasePublished);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    if (!storyId) return;
    void loadReleasesForStory(storyId).catch(() => undefined);
  }, [loadReleasesForStory, storyId]);

  const handlePublish = useCallback(async (request: PublishRequest) => {
    if (!storyId) return;
    setReleasing(true);
    try {
      // Through the service, not a store action: compiling reads the store, so
      // a store action that compiled would close an import cycle.
      const meta = await publishStoryRelease({ storyId, ...request });
      await loadReleasesForStory(storyId);
      showToast(t('release.published', { version: meta.version }), 'success');
    } catch (error) {
      showToast(
        t('release.failed', { reason: error instanceof Error ? error.message : String(error) }),
        'error',
      );
    } finally {
      setReleasing(false);
    }
  }, [loadReleasesForStory, storyId, t]);

  const handleSetPublished = useCallback((releaseId: string, published: boolean) => {
    if (!storyId) return;
    void setReleasePublished(storyId, releaseId, published).catch(() => undefined);
  }, [setReleasePublished, storyId]);

  const audioLibraries = useAppStore((state) => state.audioLibraries);
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const imageAssetIdsByStory = useAppStore((state) => state.imageAssetIdsByStory);

  const stats = useMemo(() => computeStoryStats(sceneRecords), [sceneRecords]);
  const storyImageAssets = useMemo(
    () => storyId ? getStoryGalleryImageAssets(storyId, imageAssetIdsByStory, mediaLibrary, sceneRecords) : [],
    [imageAssetIdsByStory, mediaLibrary, sceneRecords, storyId],
  );
  const storyDoctorAudioAssets = useMemo(
    () => storyId ? getPlaybackAudioLibraryPure(storyId, audioLibraries, mediaLibrary) : [],
    [audioLibraries, mediaLibrary, storyId],
  );
  const storyDoctorReport = useMemo(
    () => runStoryDoctor({
      scenes: sceneRecords,
      mediaAssets: storyImageAssets,
      audioAssets: storyDoctorAudioAssets,
      characters: characterLibrary,
      metadata: story ?? undefined,
    }),
    [characterLibrary, sceneRecords, story, storyDoctorAudioAssets, storyImageAssets],
  );
  const coverageReport = useMemo(
    () => computeCoverageReport(sceneRecords, coverage),
    [coverage, sceneRecords],
  );
  const choiceStatsReport = useMemo(
    () => getChoiceStats(sceneRecords, coverage),
    [coverage, sceneRecords],
  );
  // The release gate replaces the old five-check readiness list: two readiness
  // answers on one page could only disagree, and the gate is the strict
  // superset (STORY-HOME-PLAN.md §2.4).
  const releasePreflight = useMemo(
    () => story
      ? runReleasePreflight({
          metadata: story,
          scenes: sceneRecords,
          mediaAssets: storyImageAssets,
          audioAssets: storyDoctorAudioAssets,
          characters: characterLibrary,
          channel: 'both',
          previousVersion: highestReleaseVersion(releases),
        })
      : null,
    [characterLibrary, releases, sceneRecords, story, storyDoctorAudioAssets, storyImageAssets],
  );

  /**
   * What «still to do» lists: the blockers the story doctor did not raise.
   * The doctor's own findings already have their own verdict line and tile, so
   * repeating them here would say the same thing twice.
   */
  const releaseGate = useMemo(() => {
    if (!hydrated || !releasePreflight) return null;
    return {
      blockers: releasePreflight.blockers.length,
      warnings: releasePreflight.warnings.length,
      missing: releasePreflight.blockers
        .filter((finding) => !finding.fromStoryDoctor)
        .map((finding) => finding.messageKey),
    };
  }, [hydrated, releasePreflight]);

  // The «assets» tile and the panel it opens read the same report, so they can
  // never contradict each other.
  const assetReport = useMemo(
    () => (storyId
      ? buildStoryAssetUsageReport({
          storyId,
          scenes: sceneRecords,
          mediaLibrary,
          imageAssetIdsByStory,
          storyAudioLibrary: audioLibraries[storyId] ?? [],
          characters: characterLibrary,
        })
      : null),
    [audioLibraries, characterLibrary, imageAssetIdsByStory, mediaLibrary, sceneRecords, storyId],
  );

  const overview = useMemo(
    () => buildOverviewState({
      hydrated,
      readiness: releaseGate,
      doctor: storyDoctorReport.summary,
      coverage: {
        scenesSeen: coverageReport.visitedReachableScenes,
        scenesTotal: coverageReport.totalReachableScenes,
      },
      assets: {
        total: assetReport?.assets.length ?? 0,
        unused: assetReport?.unusedAssets.length ?? 0,
        broken: assetReport?.brokenReferences.length ?? 0,
      },
    }),
    [assetReport, coverageReport, hydrated, releaseGate, storyDoctorReport.summary],
  );

  const [openTile, setOpenTile] = useState<OverviewTileKey | null>(null);

  const unusedImageCount = useMemo(() => {
    if (!assetReport) return 0;
    const galleryIds = new Set(storyImageAssets.map((asset) => asset.id));
    return assetReport.unusedAssets.filter((asset) => galleryIds.has(asset.id)).length;
  }, [assetReport, storyImageAssets]);

  // What a full backup would carry. The bytes are already in the media library;
  // only the sum was missing.
  const mediaAssetIdsByStory = useAppStore((state) => state.mediaAssetIdsByStory);
  const backupPayload = useMemo(() => {
    if (!storyId) return { files: 0, bytes: 0 };
    const ids = new Set([
      ...(mediaAssetIdsByStory[storyId] ?? []),
      ...(imageAssetIdsByStory[storyId] ?? []),
    ]);
    let bytes = 0;
    let files = 0;
    for (const asset of mediaLibrary) {
      if (!ids.has(asset.id)) continue;
      files += 1;
      bytes += asset.size ?? 0;
    }
    return { files, bytes };
  }, [imageAssetIdsByStory, mediaAssetIdsByStory, mediaLibrary, storyId]);
  // Waits for `isLoaded`, and not out of politeness: persist rehydrates a beat
  // after mount, and any store write before that makes the middleware save the
  // still-empty initial state over the real one. Opening this route directly
  // used to do exactly that and take every story's metadata with it.
  useEffect(() => {
    let cancelled = false;
    if (!storyId || !isLoaded) return;
    void hydrateSceneRecordsForStory(storyId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, isLoaded, hydrateSceneRecordsForStory]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!storyId) {
        setCoverage(EMPTY_STORY_COVERAGE);
        return undefined;
      }
      void loadCoverage(coverageStorageRef.current, storyId)
        .then((loaded) => {
          if (!cancelled) setCoverage(loaded);
        });
      return () => {
        cancelled = true;
      };
    }, [storyId]),
  );

  const handleBack = useCallback(() => {
    navigateWithViewTransition(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/editor');
    }, 'surface-shift');
  }, [router]);

  const handleEditText = useCallback(() => {
    if (!story) return;
    const scenesById = useAppStore.getState().sceneRecordsByStory[story.id];
    const sceneId = getPaperEditorSceneId(story, scenesById);
    if (!sceneId) {
      showToast(t('document.invalidRoute'), 'error');
      return;
    }
    navigateWithViewTransition(() =>
      router.push({ pathname: '/document-editor', params: { storyId: story.id, sceneId } }),
    );
  }, [story, router, t]);

  const handleCustomizeTheme = useCallback(() => {
    if (!story) return;
    navigateWithViewTransition(() =>
      router.push({ pathname: '/theme-studio', params: { storyId: story.id } }),
    );
  }, [story, router]);

  const handleOpenHealthScene = useCallback((sceneId: string) => {
    if (!story) return;
    const scenesById = useAppStore.getState().sceneRecordsByStory[story.id];
    if (!scenesById?.[sceneId]) {
      showToast(t('document.invalidRoute'), 'error');
      return;
    }
    navigateWithViewTransition(() =>
      router.push({ pathname: '/document-editor', params: { storyId: story.id, sceneId } }),
    );
  }, [story, router, t]);

  const handlePlay = useCallback(() => {
    if (!story) return;
    navigateWithViewTransition(() =>
      router.push({ pathname: '/reader', params: { storyId: story.id, resume: '0' } }),
    );
  }, [story, router]);

  const handleResetCoverage = useCallback(() => {
    if (!story) return;
    setShowResetCoverage(false);
    setCoverage(EMPTY_STORY_COVERAGE);
    void saveCoverage(coverageStorageRef.current!, story.id, EMPTY_STORY_COVERAGE)
      .then(() => showToast(t('storyCoverage.resetSuccess'), 'success'))
      .catch(() => showToast(t('storyCoverage.resetFailed'), 'error'));
  }, [story, t]);

  const formatBytes = useCallback(
    (bytes: number): string => {
      if (bytes >= 1024 * 1024) {
        const mb = bytes / (1024 * 1024);
        return t('storyHome.sizeMb', { value: mb >= 10 ? Math.round(mb) : mb.toFixed(1) });
      }
      return t('storyHome.sizeKb', { value: Math.max(1, Math.round(bytes / 1024)) });
    },
    [t],
  );

  const toneColor = useCallback(
    (tone: OverviewTone): string => {
      switch (tone) {
        case 'ok':
          return colors.success;
        case 'warning':
          return colors.warning;
        case 'danger':
          return colors.danger;
        case 'neutral':
          return colors.foreground;
        default:
          return colors['foreground-disabled'];
      }
    },
    [colors],
  );

  if (!story) {
    return (
      <ScreenContainer
        edges={['top', 'left', 'right', 'bottom']}
        style={{ backgroundColor: colors.background }}
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFillObject, styles.rabbitsPattern, rabbitsPatternBackground]}
        />
        {/* Stories arrive from IndexedDB a beat after the first paint, and
            «Story not found» is a cruel thing to flash at somebody whose story
            is merely still loading. */}
        {!isLoaded ? (
          <View style={styles.notFoundWrap}>
            <Text style={[styles.notFoundHint, { color: colors['foreground-tertiary'] }]}>
              {t('home.preparingLibrary')}
            </Text>
          </View>
        ) : (
        <View style={styles.notFoundWrap}>
          <View style={[styles.notFound, { backgroundColor: colors['surface-1'], borderColor: colors['border-subtle'] }, shadowCard]}>
            <View style={[styles.notFoundIcon, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
              <IconSymbol name="question" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>{t('storyHome.notFound')}</Text>
            <Text style={[styles.notFoundHint, { color: colors.muted }]}>{t('storyHome.notFoundHint')}</Text>
            <Pressable
              onPress={() => router.replace('/editor')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.primaryActionText, { color: colors['foreground-on-primary'] }]}>
                {t('common.back')}
              </Text>
            </Pressable>
          </View>
        </View>
        )}
      </ScreenContainer>
    );
  }

  const bandSurface = {
    backgroundColor: colors['surface-1'],
    borderColor: colors['border-subtle'],
  };
  const fieldStyle = (field: string) => [
    styles.field,
    focusedField === field
      ? { borderColor: colors.primary, backgroundColor: colors.background }
      : { borderColor: 'transparent', backgroundColor: 'transparent' },
  ];
  const coverInitial = (story.title || '?').trim().charAt(0).toUpperCase();
  const statsLine = t('storyHome.statsLine', {
    scenes: stats.scenes,
    scenesLabel: pluralize(stats.scenes, t('editor.sceneOne'), t('editor.sceneFew'), t('editor.sceneMany')),
    words: formatNumber(stats.words, language),
    wordsLabel: pluralize(stats.words, t('editor.wordOne'), t('editor.wordFew'), t('editor.wordMany')),
    choices: stats.choices,
    choicesLabel: pluralize(stats.choices, t('editor.choiceOne'), t('editor.choiceFew'), t('editor.choiceMany')),
    characters: characterCount,
    charactersLabel: pluralize(
      characterCount,
      t('storyHome.characterOne'),
      t('storyHome.characterFew'),
      t('storyHome.characterMany'),
    ),
  });

  // Sizes are only known for media the library actually measured, so a zero is
  // «not measured», not «weightless» — leave that part out rather than lie.
  const backupSummary = [
    `${story.sceneCount ?? stats.scenes} ${pluralize(
      story.sceneCount ?? stats.scenes,
      t('editor.sceneOne'),
      t('editor.sceneFew'),
      t('editor.sceneMany'),
    )}`,
    `${backupPayload.files} ${pluralize(
      backupPayload.files,
      t('storyHome.fileOne'),
      t('storyHome.fileFew'),
      t('storyHome.fileMany'),
    )}`,
    backupPayload.bytes > 0 ? formatBytes(backupPayload.bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const verdictText = (() => {
    switch (overview.verdict.kind) {
      case 'errors':
        return t('storyHome.verdictErrors', {
          count: overview.verdict.count,
          label: pluralize(
            overview.verdict.count,
            t('storyHome.errorOne'),
            t('storyHome.errorFew'),
            t('storyHome.errorMany'),
          ),
        });
      case 'warnings':
        return t('storyHome.verdictWarnings', {
          count: overview.verdict.count,
          label: pluralize(
            overview.verdict.count,
            t('storyHome.warningOne'),
            t('storyHome.warningFew'),
            t('storyHome.warningMany'),
          ),
        });
      case 'incomplete':
        return t('storyHome.verdictIncomplete', {
          items: overview.verdict.missing.map((key) => t(key)).join(' '),
        });
      case 'ready':
        return t('storyHome.verdictReady');
      default:
        return t('storyHome.verdictPending');
    }
  })();

  const tileLabels: Record<OverviewTileKey, string> = {
    readiness: t('storyHome.tileReadiness'),
    health: t('storyHome.tileHealth'),
    coverage: t('storyHome.tileCoverage'),
    assets: t('storyHome.tileAssets'),
  };

  const tileSub = (key: OverviewTileKey): string => {
    if (!hydrated) return t('storyHome.tileEmpty');
    switch (key) {
      case 'readiness':
        if (!releaseGate) return t('storyHome.tileEmpty');
        if (releaseGate.blockers > 0) return t('storyHome.tileReadinessLeft', { count: releaseGate.blockers });
        if (releaseGate.warnings > 0) return t('storyHome.tileReadinessWarnings', { count: releaseGate.warnings });
        return t('storyHome.tileReadinessDone');
      case 'health': {
        const { errors, warnings } = storyDoctorReport.summary;
        if (errors > 0 && warnings > 0) {
          return t('storyHome.tileHealthWarnings', {
            count: warnings,
            label: pluralize(warnings, t('storyHome.warningOne'), t('storyHome.warningFew'), t('storyHome.warningMany')),
          });
        }
        if (errors === 0 && warnings === 0) return t('storyHome.tileHealthClean');
        return '';
      }
      case 'coverage':
        // «Nobody has played» must key off visits, not picks: a linear story
        // has no choices to pick and would read as unplayed after every read.
        return coverageReport.visitedReachableScenes > 0
          ? t('storyHome.tileCoverageSeen')
          : t('storyHome.tileCoverageIdle');
      default:
        if (!assetReport || assetReport.assets.length === 0) return t('storyHome.tileEmpty');
        return assetReport.brokenReferences.length > 0
          ? t('storyHome.tileAssetsBroken')
          : t('storyHome.tileAssetsLibrary');
    }
  };

  const openPanel = () => {
    switch (openTile) {
      case 'readiness':
        return releasePreflight ? (
          <ReleaseChecklistCard
            embedded
            colors={colors}
            report={releasePreflight}
            onOpenScene={handleOpenHealthScene}
          />
        ) : null;
      case 'health':
        return (
          <StoryHealthCard
            embedded
            colors={colors}
            report={storyDoctorReport}
            scenes={sceneRecords}
            onOpenScene={handleOpenHealthScene}
          />
        );
      case 'coverage':
        // Coverage answers to this tile and no other: what a playthrough has
        // reached, and — once somebody has actually played — how the picks fell.
        return (
          <View style={styles.panelStack}>
            <PlaytestCoverageCard
              embedded
              colors={colors}
              report={coverageReport}
              onOpenScene={handleOpenHealthScene}
              onReset={() => setShowResetCoverage(true)}
            />
            <ChoiceStatisticsCard
              embedded
              colors={colors}
              report={choiceStatsReport}
              onReset={() => setShowResetCoverage(true)}
            />
          </View>
        );
      case 'assets':
        return (
          <AssetUsageCard
            embedded
            colors={colors}
            storyId={story.id}
            scenes={sceneRecords}
            onOpenScene={handleOpenHealthScene}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScreenContainer
      edges={['top', 'left', 'right', 'bottom']}
      style={{ backgroundColor: colors.background }}
    >
      {/* The paper texture the whole studio sits on. It stays behind everything,
          never scrolls, and is invisible to assistive tech. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFillObject, styles.rabbitsPattern, rabbitsPatternBackground]}
      />

      <View style={[styles.nav, { borderBottomColor: colors['border-subtle'] }]}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('storyHome.backToStudio')}
          style={({ pressed }) => [styles.navBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.navBackText, { color: colors.primary }]}>{t('storyHome.backToStudio')}</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
          {story.title || t('storyHome.untitled')}
        </Text>
        <View style={styles.navSide} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>

          {/* ── A · passport: the identity and the form are the same thing ── */}
          <View style={[styles.band, bandSurface, shadowCard]}>
            <View style={[styles.passport, passportWide ? styles.passportRow : styles.passportColumn]}>
              <View>
                <Pressable
                  onPress={handlePickCover}
                  accessibilityRole="button"
                  accessibilityLabel={story.thumbnailUri ? t('storyHome.changeCover') : t('storyHome.addCover')}
                  style={[styles.coverFrame, shadowCover]}
                >
                  {story.thumbnailUri ? (
                    <ResolvedAssetImage uri={story.thumbnailUri} style={styles.cover} resizeMode="cover" />
                  ) : (
                    <View style={[styles.coverPlaceholder, { backgroundColor: withAlpha(colors.primary, 0.12) }]}>
                      <Text style={[styles.coverInitial, { color: colors.primary }]}>{coverInitial}</Text>
                    </View>
                  )}
                  <View style={[styles.coverBadge, { backgroundColor: colors.primary }]}>
                    <IconSymbol name="image" size={15} color={colors['foreground-on-primary']} />
                  </View>
                </Pressable>
                {story.thumbnailUri ? (
                  <Pressable
                    onPress={handleRemoveCover}
                    accessibilityRole="button"
                    accessibilityLabel={t('storyHome.removeCover')}
                    style={styles.removeCoverBtn}
                  >
                    <Text style={[styles.removeCoverText, { color: colors.muted }]}>{t('storyHome.removeCover')}</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.fields}>
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  onFocus={() => setFocusedField('title')}
                  onBlur={() => {
                    setFocusedField(null);
                    commitTitle();
                  }}
                  placeholder={t('storyHome.titlePlaceholder')}
                  placeholderTextColor={colors['foreground-disabled']}
                  accessibilityLabel={t('storyHome.titleLabel')}
                  style={[fieldStyle('title'), styles.titleField, { color: colors.foreground }]}
                />
                <TextInput
                  value={authorDraft}
                  onChangeText={setAuthorDraft}
                  onFocus={() => setFocusedField('author')}
                  onBlur={() => {
                    setFocusedField(null);
                    commitAuthor();
                  }}
                  placeholder={t('storyHome.authorPlaceholder')}
                  placeholderTextColor={colors['foreground-disabled']}
                  accessibilityLabel={t('storyHome.authorLabel')}
                  style={[fieldStyle('author'), styles.authorField, { color: colors['foreground-secondary'] }]}
                />
                <TextInput
                  value={descriptionDraft}
                  onChangeText={setDescriptionDraft}
                  onFocus={() => setFocusedField('description')}
                  onBlur={() => {
                    setFocusedField(null);
                    commitDescription();
                  }}
                  placeholder={t('storyHome.descriptionPlaceholder')}
                  placeholderTextColor={colors['foreground-disabled']}
                  accessibilityLabel={t('storyHome.descriptionLabel')}
                  multiline
                  numberOfLines={3}
                  style={[fieldStyle('description'), styles.aboutField, { color: colors['foreground-secondary'] }]}
                />

                <View style={styles.publication}>
                  <SegmentedControl<ContentRating>
                    options={CONTENT_RATINGS.map((rating) => ({
                      value: rating,
                      label: t(`storyHome.contentRating.${rating}`),
                    }))}
                    value={story.contentRating ?? 'everyone'}
                    onChange={commitContentRating}
                    accessibilityLabel={t('storyHome.contentRatingLabel')}
                    segmentMinWidth={78}
                  />
                  <TextInput
                    value={languagesDraft}
                    onChangeText={setLanguagesDraft}
                    onFocus={() => setFocusedField('languages')}
                    onBlur={() => {
                      setFocusedField(null);
                      commitLanguages();
                    }}
                    autoCapitalize="none"
                    placeholder={t('storyHome.languagesPlaceholder')}
                    placeholderTextColor={colors['foreground-disabled']}
                    accessibilityLabel={t('storyHome.languagesLabel')}
                    style={[
                      styles.tagInput,
                      {
                        borderColor: focusedField === 'languages' ? colors.primary : colors['border-subtle'],
                        color: colors.foreground,
                      },
                    ]}
                  />
                </View>

                <View style={styles.tagRow}>
                  {tags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => handleRemoveTag(tag)}
                      accessibilityRole="button"
                      accessibilityLabel={t('storyHome.removeTag', { tag })}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: withAlpha(colors.primary, 0.09),
                          borderColor: withAlpha(colors.primary, 0.25),
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: colors.primary }]}>{tag}</Text>
                      <IconSymbol name="xmark" size={12} color={colors.primary} />
                    </Pressable>
                  ))}
                  <TextInput
                    value={tagInput}
                    onChangeText={setTagInput}
                    onFocus={() => setFocusedField('tag')}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={handleAddTag}
                    placeholder={t('storyHome.tagPlaceholder')}
                    placeholderTextColor={colors['foreground-disabled']}
                    accessibilityLabel={t('storyHome.addTag')}
                    maxLength={MAX_STORY_TAG_LENGTH}
                    returnKeyType="done"
                    style={[
                      styles.tagInput,
                      {
                        borderColor: focusedField === 'tag' ? colors.primary : colors['border-subtle'],
                        color: colors.foreground,
                      },
                    ]}
                  />
                </View>

                <Text style={[styles.statsLine, { color: colors['foreground-tertiary'] }]}>
                  {hydrated ? `${statsLine} · ` : ''}
                  {t('common.updated')} {dateFormatterFor(language).format(new Date(story.updatedAt))}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    onPress={handleEditText}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.primaryAction,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.primaryActionText, { color: colors['foreground-on-primary'] }]}>
                      {t('storyHome.editText')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handlePlay}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.ghostAction,
                      { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                      {t('storyHome.playNovel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCustomizeTheme}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.ghostAction,
                      { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                      {t('storyHome.customizeTheme')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* ── B · state: one verdict, four tiles, one panel at a time ── */}
          <View style={[styles.band, bandSurface, shadowCard]}>
            <View style={styles.verdictRow}>
              <View style={[styles.verdictDot, { backgroundColor: toneColor(verdictTone(overview.verdict)) }]} />
              <Text style={[styles.verdictText, { color: colors.foreground }]}>{verdictText}</Text>
              {overview.verdict.kind === 'ready' ? (
                <Text style={[styles.verdictHint, { color: colors['foreground-tertiary'] }]}>
                  {t('storyHome.verdictHintReady')}
                </Text>
              ) : null}
            </View>

            <View style={[styles.tiles, tilesTwoUp && styles.tilesWrap, { borderTopColor: colors['border-subtle'] }]}>
              {overview.tiles.map((tile, index) => {
                const open = openTile === tile.key;
                // Two up on a phone, four across on a desktop — the hairlines
                // follow whichever grid is in play.
                const showLeft = tilesTwoUp ? index % 2 === 1 : index > 0;
                const showTop = tilesTwoUp && index >= 2;
                return (
                  <Pressable
                    key={tile.key}
                    onPress={tile.expandable ? () => setOpenTile(open ? null : tile.key) : undefined}
                    disabled={!tile.expandable}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open, disabled: !tile.expandable }}
                    accessibilityLabel={`${tileLabels[tile.key]}: ${tile.value ?? '—'}`}
                    style={({ pressed }) => [
                      styles.tile,
                      tilesTwoUp && styles.tileHalf,
                      showLeft && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors['border-subtle'] },
                      showTop && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors['border-subtle'] },
                      open && { backgroundColor: colors['surface-2'] },
                      pressed && tile.expandable && !open && { backgroundColor: colors.hover },
                    ]}
                  >
                    <Text style={[styles.tileKey, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
                      {tileLabels[tile.key]}
                    </Text>
                    <Text style={[styles.tileValue, { color: toneColor(tile.tone) }]}>
                      {tile.value ?? '—'}
                    </Text>
                    <Text style={[styles.tileSub, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
                      {tileSub(tile.key)}
                    </Text>
                    {open ? (
                      <View style={[styles.tileMarker, { backgroundColor: colors.primary }]} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {openTile ? (
              <View
                style={[
                  styles.panel,
                  { backgroundColor: colors['surface-2'], borderTopColor: colors['border-subtle'] },
                ]}
              >
                {openPanel()}
              </View>
            ) : null}
          </View>

          {/* ── B2 · release: the door out, right under the verdict ── */}
          <ReleaseCard
            colors={colors}
            story={story}
            releases={releases}
            preflight={releasePreflight}
            busy={releasing}
            onPublish={handlePublish}
            onSetPublished={handleSetPublished}
            style={[styles.band, bandSurface, shadowCard]}
          />

          {/* ── C · media library: a preview, not a link ── */}
          <View style={[styles.band, bandSurface, shadowCard]}>
            <View style={styles.bandHead}>
              <Text style={[styles.bandTitle, { color: colors.foreground }]}>{t('mediaLibrary.title')}</Text>
              <Text style={[styles.bandMeta, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
                {t('storyHome.galleryCount', {
                  count: storyImageAssets.length,
                  label: pluralize(
                    storyImageAssets.length,
                    t('storyHome.imageOne'),
                    t('storyHome.imageFew'),
                    t('storyHome.imageMany'),
                  ),
                })}
                {unusedImageCount > 0 ? ` · ${t('storyHome.galleryUnused', { count: unusedImageCount })}` : ''}
              </Text>
            </View>

            {storyImageAssets.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.strip}
              >
                {storyImageAssets.slice(0, GALLERY_PREVIEW_COUNT).map((asset) => (
                  <View key={asset.id} style={[styles.thumb, { borderColor: colors['border-subtle'] }]}>
                    <ResolvedAssetImage uri={asset.uri} style={styles.thumbImage} resizeMode="cover" />
                  </View>
                ))}
                {storyImageAssets.length > GALLERY_PREVIEW_COUNT ? (
                  <View style={[styles.thumbMore, { borderColor: colors.border }]}>
                    <Text style={[styles.thumbMoreText, { color: colors['foreground-tertiary'] }]}>
                      {t('storyHome.galleryMore', { count: storyImageAssets.length - GALLERY_PREVIEW_COUNT })}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : (
              <Text style={[styles.bandBody, { color: colors['foreground-tertiary'] }]}>
                {t('storyHome.galleryEmpty')}
              </Text>
            )}

            <View style={styles.bandFoot}>
              <Pressable
                onPress={() => router.push({ pathname: '/story-gallery', params: { storyId: story.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.ghostAction,
                  { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                  {t('storyHome.gallery.open')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ── D · version snapshots: a working panel, not a row ── */}
          <StorySnapshotsCard
            colors={colors}
            storyId={story.id}
            style={[styles.snapshotsBand, { borderColor: colors['border-subtle'] }, shadowCard]}
          />

          {/* ── E · backups: explained before the tap, not warned about after ── */}
          <View style={[styles.band, bandSurface, shadowCard]}>
            <View style={styles.bandHead}>
              <Text style={[styles.bandTitle, { color: colors.foreground }]}>{t('storyHome.backups')}</Text>
              <Text style={[styles.bandMeta, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
                {backupSummary}
              </Text>
            </View>

            <View style={[styles.option, { borderTopColor: colors['border-subtle'] }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.foreground }]}>
                  {t('storyHome.backupFullTitle')}
                </Text>
                <Text style={[styles.optionBody, { color: colors['foreground-secondary'] }]}>
                  {t('storyHome.backupFullBody')}
                </Text>
              </View>
              <Pressable
                onPress={handleFullBackup}
                disabled={backingUp || exporting}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryAction,
                  {
                    backgroundColor: colors.primary,
                    opacity: backingUp || exporting ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.primaryActionText, { color: colors['foreground-on-primary'] }]}>
                  {backingUp && backupProgress
                    ? t(`storyHome.backupProgress.${backupProgress}`)
                    : t('storyHome.backupFullAction')}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.option, { borderTopColor: colors['border-subtle'] }]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.foreground }]}>
                  {t('storyHome.backupTextTitle')}
                </Text>
                <Text style={[styles.optionBody, { color: colors['foreground-secondary'] }]}>
                  {t('storyHome.backupTextBody')}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowExportWarning(true)}
                disabled={exporting || backingUp}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.ghostAction,
                  {
                    borderColor: colors.border,
                    opacity: exporting || backingUp ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                  {t('storyHome.backupTextAction')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showExportWarning}
        title={t('storyHome.exportTitle')}
        message={t('storyHome.exportWarning')}
        confirmLabel={t('storyHome.export')}
        onConfirm={handleExport}
        onCancel={() => setShowExportWarning(false)}
      />
      <ConfirmDialog
        visible={showResetCoverage}
        title={t('storyCoverage.resetTitle')}
        message={t('storyCoverage.resetMessage')}
        confirmLabel={t('storyCoverage.reset')}
        onConfirm={handleResetCoverage}
        onCancel={() => setShowResetCoverage(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  rabbitsPattern: {
    opacity: 0.72,
  },

  // ── Navigation ──────────────────────────────────────────────────────
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 104,
  },
  navBackText: {
    ...typeScale.label,
    fontWeight: '600',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  navSide: {
    minWidth: 104,
  },

  // ── Page ────────────────────────────────────────────────────────────
  content: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  column: {
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  band: {
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  bandHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  bandTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  bandMeta: {
    ...typeScale.caption,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  bandBody: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  bandFoot: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // ── A · passport ────────────────────────────────────────────────────
  passport: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  passportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  passportColumn: {
    flexDirection: 'column',
  },
  coverFrame: {
    width: 148,
    height: 222,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverInitial: {
    fontSize: 62,
    fontFamily: Fonts.serif,
    fontWeight: '700',
  },
  coverBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeCoverBtn: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  removeCoverText: {
    ...typeScale.micro,
  },
  fields: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  // Fields carry no frame until you enter them: the passport reads as a page,
  // not as a form, and the title is not printed twice.
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: -spacing.sm,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  titleField: {
    fontFamily: Fonts.serif,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
  },
  authorField: {
    ...typeScale.label,
    fontWeight: '500',
  },
  aboutField: {
    fontSize: 14.5,
    lineHeight: 22,
    minHeight: 66,
    textAlignVertical: 'top',
  },
  publication: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  chipText: {
    ...typeScale.caption,
  },
  tagInput: {
    minWidth: 116,
    height: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    fontSize: typeScale.caption.fontSize,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  statsLine: {
    ...typeScale.caption,
    paddingTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  primaryAction: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  primaryActionText: {
    ...typeScale.label,
    fontWeight: '800',
  },
  ghostAction: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  ghostActionText: {
    ...typeScale.label,
    fontWeight: '700',
  },

  // ── B · state ───────────────────────────────────────────────────────
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  verdictDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  verdictText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    flexShrink: 1,
  },
  verdictHint: {
    ...typeScale.caption,
    marginLeft: 'auto',
  },
  tiles: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tilesWrap: {
    flexWrap: 'wrap',
  },
  tileHalf: {
    flexGrow: 0,
    flexBasis: '50%',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md + 2,
    position: 'relative',
  },
  tileKey: {
    ...typeScale.caption,
    fontWeight: '600',
  },
  tileValue: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
  },
  tileSub: {
    ...typeScale.micro,
  },
  tileMarker: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    height: 2,
  },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  panelStack: {
    gap: spacing.lg,
  },
  checkList: {
    gap: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    ...typeScale.label,
    fontWeight: '500',
    flexShrink: 1,
  },

  // ── C · media ───────────────────────────────────────────────────────
  strip: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  thumb: {
    width: 108,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbMore: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMoreText: {
    ...typeScale.label,
    fontWeight: '700',
  },

  // ── D · snapshots ───────────────────────────────────────────────────
  snapshotsBand: {
    flexGrow: 0,
    flexBasis: 'auto',
    borderRadius: radius.xl,
  },

  // ── E · backups ─────────────────────────────────────────────────────
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  optionTitle: {
    ...typeScale.label,
    fontWeight: '700',
  },
  optionBody: {
    fontSize: 13,
    lineHeight: 19.5,
  },

  // ── Not found ───────────────────────────────────────────────────────
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  notFound: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  notFoundIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  notFoundHint: {
    ...typeScale.label,
    fontWeight: '400',
    textAlign: 'center',
  },
});
