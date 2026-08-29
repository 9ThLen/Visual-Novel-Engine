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
import { ReleaseCard, type PublishRequest } from '@/components/story-home/ReleaseCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ReleaseChecklistCard } from '@/components/story-home/ReleaseChecklistCard';
import { StoryHealthCard } from '@/components/story-home/StoryHealthCard';
import { StorySnapshotsCard } from '@/components/story-home/StorySnapshotsCard';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { formatDate, SHORT_DATE } from '@/lib/format-date';
import { formatNumber } from '@/lib/format-number';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
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
import type { StoryMetadata } from '@/lib/story-domain';
import {
  CONTENT_RATINGS,
  sanitizeStoryLanguages,
  type ContentRating,
} from '@/lib/story-publication';
import type { SceneRecord } from '@/lib/engine/types';
import { selectSceneRecordsForStory, useAppStore } from '@/stores/use-app-store';

/** Stable identity so the store selector cannot loop by returning a new []. */
const EMPTY_RELEASES: ReleaseMeta[] = [];

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

type ActionTone = 'solid' | 'outline' | 'soft';

interface ActionButtonProps {
  colors: ThemeColorPalette;
  label: string;
  iconName?: IconSymbolName;
  tone?: ActionTone;
  accent?: 'primary' | 'secondary';
  size?: 'base' | 'sm';
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: object;
}

function ActionButton({
  colors,
  label,
  iconName,
  tone = 'solid',
  accent = 'primary',
  size = 'base',
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: ActionButtonProps) {
  const solid = tone === 'solid';
  const outline = tone === 'outline';
  const accentColor = colors[accent];
  const bg = solid ? accentColor : outline ? 'transparent' : withAlpha(accentColor, 0.1);
  const fg = solid ? colors['text-inverse'] : accentColor;
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.action,
        size === 'sm' && styles.actionSm,
        {
          backgroundColor: bg,
          borderWidth: outline ? 1.5 : 0,
          borderColor: outline ? accentColor : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {iconName ? <IconSymbol name={iconName} size={iconSize} color={fg} /> : null}
      <Text style={[styles.actionLabel, size === 'sm' && styles.actionLabelSm, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({
  colors,
  iconName,
  title,
  right,
}: {
  colors: ThemeColorPalette;
  iconName: IconSymbolName;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
        <IconSymbol name={iconName} size={15} color={colors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={styles.sectionSpacer} />
      {right}
    </View>
  );
}

function StatTile({
  colors,
  iconName,
  value,
  label,
}: {
  colors: ThemeColorPalette;
  iconName: IconSymbolName;
  value: number;
  label: string;
}) {
  const { language } = useI18n();

  return (
    <View style={[styles.statCard, { backgroundColor: withAlpha(colors.primary, 0.06) }]}>
      <View style={[styles.statIcon, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
        <IconSymbol name={iconName} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{formatNumber(value, language)}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function StoryHomeScreen() {
  const router = useRouter();
  // This hub is a deliberately light "studio" surface, independent of the app
  // theme — a calm bright space between the dark editor and the dark reader.
  const colors = useColors('light');
  const { t, language } = useI18n();
  const { width } = useWindowDimensions();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  const wide = Platform.OS === 'web' && width >= 900;
  const heroWide = width >= 620;

  const storiesMetadata = useAppStore((state) => state.storiesMetadata);
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
    // Sanitizing here rather than on every keystroke lets the author type
    // "uk, en" without the half-finished "u" vanishing under them.
    const next = sanitizeStoryLanguages(languagesDraft.split(','));
    setLanguagesDraft((next ?? []).join(', '));
    if ((next ?? []).join(',') !== (story.languages ?? []).join(',')) {
      updateStoryMetadata(story.id, { languages: next });
    }
  }, [languagesDraft, story, updateStoryMetadata]);

  const commitContentRating = useCallback((rating: ContentRating) => {
    if (!story) return;
    updateStoryMetadata(story.id, { contentRating: rating });
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
      // Publishing goes through the service rather than the store: compiling
      // reads the store, so a store action that compiled would close a cycle.
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
  // Preflight runs the story doctor itself, so it is memoized on the same
  // inputs rather than handed the report above: the two must never disagree
  // about which story they described.
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
  const coverageReport = useMemo(
    () => computeCoverageReport(sceneRecords, coverage),
    [coverage, sceneRecords],
  );
  const choiceStatsReport = useMemo(
    () => getChoiceStats(sceneRecords, coverage),
    [coverage, sceneRecords],
  );
  useEffect(() => {
    let cancelled = false;
    if (!storyId) return;
    void hydrateSceneRecordsForStory(storyId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, hydrateSceneRecordsForStory]);

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

  if (!story) {
    return (
      <ScreenContainer
        className="px-4 py-5"
        edges={['top', 'left', 'right', 'bottom']}
        style={{ backgroundColor: colors.background }}
      >
        <View style={styles.notFoundWrap}>
          <View style={[styles.notFound, { backgroundColor: colors['surface-1'], borderColor: colors.border }, shadowCard]}>
            <View style={[styles.notFoundIcon, { backgroundColor: withAlpha(colors.primary, 0.1) }]}>
              <IconSymbol name="question" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>{t('storyHome.notFound')}</Text>
            <Text style={[styles.notFoundHint, { color: colors.muted }]}>{t('storyHome.notFoundHint')}</Text>
            <ActionButton
              colors={colors}
              label={t('common.back')}
              iconName="chevron.left"
              onPress={() => router.replace('/editor')}
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const cardBase = { backgroundColor: colors['surface-1'], borderColor: colors.border };
  const inputBorder = (field: string) => (focusedField === field ? colors.primary : colors.border);
  const coverInitial = (story.title || '?').trim().charAt(0).toUpperCase();

  const detailsCard = (
    <View style={[styles.card, cardBase, shadowCard]}>
      <SectionHeader colors={colors} iconName="editor" title={t('storyHome.details')} />

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.titleLabel')}</Text>
      <TextInput
        value={titleDraft}
        onChangeText={setTitleDraft}
        onFocus={() => setFocusedField('title')}
        onBlur={() => {
          setFocusedField(null);
          commitTitle();
        }}
        placeholder={t('storyHome.titlePlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, { backgroundColor: colors.background, borderColor: inputBorder('title'), color: colors.foreground }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.authorLabel')}</Text>
      <TextInput
        value={authorDraft}
        onChangeText={setAuthorDraft}
        onFocus={() => setFocusedField('author')}
        onBlur={() => {
          setFocusedField(null);
          commitAuthor();
        }}
        placeholder={t('storyHome.authorPlaceholder')}
        placeholderTextColor={colors.muted}
        style={[styles.input, { backgroundColor: colors.background, borderColor: inputBorder('author'), color: colors.foreground }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.descriptionLabel')}</Text>
      <TextInput
        value={descriptionDraft}
        onChangeText={setDescriptionDraft}
        onFocus={() => setFocusedField('description')}
        onBlur={() => {
          setFocusedField(null);
          commitDescription();
        }}
        placeholder={t('storyHome.descriptionPlaceholder')}
        placeholderTextColor={colors.muted}
        multiline
        numberOfLines={4}
        style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: inputBorder('description'), color: colors.foreground }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.contentRatingLabel')}</Text>
      <SegmentedControl<ContentRating>
        options={CONTENT_RATINGS.map((rating) => ({
          value: rating,
          label: t(`storyHome.contentRating.${rating}`),
        }))}
        value={story.contentRating ?? 'everyone'}
        onChange={commitContentRating}
        accessibilityLabel={t('storyHome.contentRatingLabel')}
        segmentMinWidth={80}
      />
      {story.contentRating ? null : (
        <Text style={[styles.emptyHint, { color: colors.muted }]}>{t('storyHome.contentRatingUnset')}</Text>
      )}

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.languagesLabel')}</Text>
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
        placeholderTextColor={colors.muted}
        style={[styles.input, { backgroundColor: colors.background, borderColor: inputBorder('languages'), color: colors.foreground }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{t('storyHome.tagsLabel')}</Text>
      {tags.length > 0 ? (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => handleRemoveTag(tag)}
              accessibilityRole="button"
              accessibilityLabel={t('storyHome.removeTag', { tag })}
              style={[styles.chip, { backgroundColor: withAlpha(colors.primary, 0.09), borderColor: withAlpha(colors.primary, 0.25) }]}
            >
              <Text style={[styles.chipText, { color: colors.primary }]}>{tag}</Text>
              <IconSymbol name="xmark" size={13} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyHint, { color: colors.muted }]}>{t('storyHome.noTags')}</Text>
      )}
      <View style={styles.tagInputRow}>
        <TextInput
          value={tagInput}
          onChangeText={setTagInput}
          onFocus={() => setFocusedField('tag')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={handleAddTag}
          placeholder={t('storyHome.tagPlaceholder')}
          placeholderTextColor={colors.muted}
          maxLength={MAX_STORY_TAG_LENGTH}
          returnKeyType="done"
          style={[styles.input, styles.tagInput, { backgroundColor: colors.background, borderColor: inputBorder('tag'), color: colors.foreground }]}
        />
        <ActionButton
          colors={colors}
          label={t('storyHome.addTag')}
          iconName="add"
          tone="soft"
          onPress={handleAddTag}
          accessibilityLabel={t('storyHome.addTag')}
        />
      </View>
    </View>
  );

  // One readiness surface, and it is the release gate: the old five-item
  // checklist asked a strict subset of the same questions, so two cards on one
  // screen could only disagree in confusing ways.
  const releaseCard = hydrated ? (
    <ReleaseCard
      colors={colors}
      story={story}
      releases={releases}
      preflight={releasePreflight}
      busy={releasing}
      onPublish={handlePublish}
      onSetPublished={handleSetPublished}
      style={[styles.card, cardBase, shadowCard]}
    />
  ) : null;

  const readinessCard = hydrated && releasePreflight ? (
    <ReleaseChecklistCard
      colors={colors}
      report={releasePreflight}
      onOpenScene={handleOpenHealthScene}
      style={[styles.card, cardBase, shadowCard]}
    />
  ) : null;

  const imageLibraryCard = <View style={[styles.card, cardBase, shadowCard]}><SectionHeader colors={colors} iconName="gallery" title={t('mediaLibrary.title')} /><Text style={[styles.emptyHint, { color: colors.muted }]}>{t('storyHome.gallery.openHint')}</Text><ActionButton colors={colors} label={t('storyHome.gallery.open')} iconName="gallery" accent="secondary" onPress={() => router.push({ pathname: '/story-gallery', params: { storyId: story.id } })} /></View>;

  const backupCard = (
    <View style={[styles.card, cardBase, shadowCard]}>
      <SectionHeader colors={colors} iconName="save" title={t('storyHome.backup')} />
      <Text style={[styles.emptyHint, { color: colors.muted }]}>{t('storyHome.fullBackupHint')}</Text>
      <ActionButton
        colors={colors}
        label={backingUp && backupProgress
          ? t(`storyHome.backupProgress.${backupProgress}`)
          : t('storyHome.fullBackup')}
        iconName="save"
        onPress={handleFullBackup}
        disabled={backingUp || exporting}
        style={styles.backupButton}
      />
      <ActionButton
        colors={colors}
        label={t('storyHome.exportJson')}
        iconName="square.and.arrow.up"
        tone="outline"
        onPress={() => setShowExportWarning(true)}
        disabled={exporting || backingUp}
        style={styles.backupButton}
      />
    </View>
  );

  return (
    <ScreenContainer
      className="px-4 py-5"
      edges={['top', 'left', 'right', 'bottom']}
      style={{ backgroundColor: colors.background }}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFillObject, styles.rabbitsPattern, rabbitsPatternBackground]}
      />
      <ScrollView
        contentContainerStyle={[styles.content, Platform.OS === 'web' && styles.webContent]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar: back + breadcrumb */}
        <View style={styles.topBar}>
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors['surface-1'], borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              shadowCard,
            ]}
          >
            <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={handleBack} accessibilityRole="button" accessibilityLabel={t('editor.title')}>
            <Text style={[styles.breadcrumbRoot, { color: colors.primary }]}>{t('editor.title')}</Text>
          </Pressable>
          <Text style={[styles.breadcrumbSep, { color: colors.muted }]}>/</Text>
          <Text style={[styles.breadcrumbCurrent, { color: colors.foreground }]} numberOfLines={1}>
            {story.title || t('storyHome.untitled')}
          </Text>
        </View>

        {/* Hero: cover + identity + primary journeys */}
        <View style={[styles.hero, cardBase, shadowCard]}>
          <View style={[styles.heroAccent, { backgroundColor: colors.secondary }]} />
          <View style={[styles.heroInner, heroWide ? styles.heroRow : styles.heroColumn]}>
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
                  <IconSymbol name="image" size={15} color={colors['text-inverse']} />
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

            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: colors.foreground }]} numberOfLines={3}>
                {story.title || t('storyHome.untitled')}
              </Text>
              {story.author ? (
                <Text style={[styles.heroByline, { color: colors['foreground-secondary'] }]} numberOfLines={1}>
                  {t('storyHome.byAuthor', { author: story.author })}
                </Text>
              ) : null}
              <Text style={[styles.heroDescription, { color: colors['foreground-secondary'] }]} numberOfLines={3}>
                {story.description?.trim() || t('storyHome.descriptionEmpty')}
              </Text>
              <View style={styles.heroMetaRow}>
                <IconSymbol name="manuscript" size={14} color={colors.muted} />
                <Text style={[styles.heroMeta, { color: colors.muted }]}>
                  {t('editor.sceneCount', { count: story.sceneCount ?? 0 })}
                </Text>
                <Text style={[styles.heroMetaDot, { color: colors.muted }]}>·</Text>
                <Text style={[styles.heroMeta, { color: colors.muted }]}>
                  {t('common.updated')} {formatDate(story.updatedAt, language, SHORT_DATE)}
                </Text>
              </View>
              {hydrated ? (
                <View style={styles.heroStats}>
                  <StatTile colors={colors} iconName="manuscript" value={stats.scenes} label={t('storyHome.statScenes')} />
                  <StatTile colors={colors} iconName="text" value={stats.words} label={t('storyHome.statWords')} />
                  <StatTile colors={colors} iconName="list" value={stats.choices} label={t('storyHome.statChoices')} />
                  <StatTile colors={colors} iconName="character" value={characterCount} label={t('storyHome.statCharacters')} />
                </View>
              ) : null}
              <View style={styles.heroActions}>
                <ActionButton
                  colors={colors}
                  label={t('storyHome.playNovel')}
                  iconName="play"
                  tone="solid"
                  accent="secondary"
                  onPress={handlePlay}
                />
                <ActionButton
                  colors={colors}
                  label={t('storyHome.editText')}
                  iconName="editor"
                  tone="outline"
                  onPress={handleEditText}
                />
                <ActionButton
                  colors={colors}
                  label={t('storyHome.customizeTheme')}
                  iconName="palette"
                  tone="outline"
                  onPress={handleCustomizeTheme}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Editable story details stay close to the story identity. */}
        <View style={wide ? styles.mainGridRow : styles.mainGridColumn}>
          <View style={wide ? styles.mainLeft : undefined}>{detailsCard}</View>
          <View style={[wide ? styles.mainRight : undefined, styles.rightStack]}>
            {releaseCard}
            {readinessCard}
            {imageLibraryCard}
          </View>
        </View>

        {/* Recovery actions belong together and keep independent heights. */}
        <View style={wide ? styles.mainGridRow : styles.mainGridColumn}>
          <View style={wide ? styles.mainLeft : undefined}>
            <StorySnapshotsCard colors={colors} storyId={story.id} style={[styles.standaloneCard, shadowCard]} />
          </View>
          <View style={wide ? styles.mainRight : undefined}>{backupCard}</View>
        </View>

        {/* Variable-length reports use independent columns so expanding one
            report never stretches or displaces cards in the other columns. */}
        {hydrated ? (
          <View style={wide ? styles.analyticsRow : styles.analyticsColumn}>
            <View style={styles.analyticsLane}>
              <ChoiceStatisticsCard
                colors={colors}
                report={choiceStatsReport}
                onReset={() => setShowResetCoverage(true)}
                style={[styles.standaloneCard, shadowCard]}
              />
            </View>
            <View style={styles.analyticsLane}>
              <StoryHealthCard
                colors={colors}
                report={storyDoctorReport}
                coverageReport={coverageReport}
                scenes={sceneRecords}
                onOpenScene={handleOpenHealthScene}
                onResetCoverage={() => setShowResetCoverage(true)}
                style={[styles.standaloneCard, shadowCard]}
              />
            </View>
            <View style={styles.analyticsLane}>
              <AssetUsageCard
                colors={colors}
                storyId={story.id}
                scenes={sceneRecords}
                onOpenScene={handleOpenHealthScene}
                style={[styles.standaloneCard, shadowCard]}
              />
            </View>
          </View>
        ) : null}
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
  content: {
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  webContent: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  breadcrumbRoot: {
    ...typeScale.label,
    fontWeight: '700',
  },
  breadcrumbSep: {
    ...typeScale.label,
  },
  breadcrumbCurrent: {
    flex: 1,
    ...typeScale.label,
    fontWeight: '700',
  },

  // Hero
  hero: {
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  heroAccent: {
    height: 4,
    width: '100%',
  },
  heroInner: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroColumn: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  coverFrame: {
    width: 132,
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  cover: {
    width: 132,
    height: 180,
  },
  coverPlaceholder: {
    width: 132,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverInitial: {
    fontSize: 52,
    fontWeight: '800',
  },
  coverBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeCoverBtn: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  removeCoverText: {
    ...typeScale.caption,
    fontWeight: '600',
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontFamily: Fonts.serif,
  },
  heroByline: {
    ...typeScale.body,
    fontStyle: 'italic',
  },
  heroDescription: {
    ...typeScale.body,
    marginTop: spacing.xs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  heroMeta: {
    ...typeScale.caption,
  },
  heroMetaDot: {
    ...typeScale.caption,
    marginHorizontal: 2,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },

  // Action buttons
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  actionSm: {
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  actionLabel: {
    ...typeScale.label,
    fontWeight: '700',
  },
  actionLabelSm: {
    ...typeScale.caption,
    fontWeight: '700',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
  },
  sectionSpacer: {
    flex: 1,
  },

  // Cards
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },

  // Fields
  fieldLabel: {
    ...typeScale.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typeScale.body,
  },
  textArea: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  chipText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  emptyHint: {
    ...typeScale.label,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  tagInput: {
    flex: 1,
  },
  backupButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },

  // Compact story metrics are part of the hero instead of separate cards.
  statCard: {
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
  },
  statLabel: {
    ...typeScale.caption,
    flexShrink: 1,
  },

  // Main responsive grid
  mainGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  mainGridColumn: {
    flexDirection: 'column',
    gap: spacing.lg,
  },
  mainLeft: {
    flex: 1.5,
  },
  mainRight: {
    flex: 1,
  },
  rightStack: {
    gap: spacing.lg,
  },
  analyticsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  analyticsColumn: {
    gap: spacing.lg,
  },
  analyticsLane: {
    flex: 1,
    minWidth: 0,
    gap: spacing.lg,
  },
  standaloneCard: {
    flexGrow: 0,
    flexBasis: 'auto',
    minWidth: 0,
  },

  // Not found
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  notFoundIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  notFoundTitle: {
    ...typeScale.sectionTitle,
    fontWeight: '800',
    textAlign: 'center',
  },
  notFoundHint: {
    ...typeScale.label,
    textAlign: 'center',
  },
});
