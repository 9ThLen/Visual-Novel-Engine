import { usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ScenePreview } from '@/components/theme-studio/ScenePreview';
import { ColorRow } from '@/components/theme-studio/ColorRow';
import { ScreenContainer } from '@/components/screen-container';
import { SettingsGroup, SettingsRow } from '@/components/settings/list';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { parseColorToHex } from '@/lib/color-picker';
import {
  mergeReaderColors,
  sanitizeReaderLayoutPreset,
  sanitizeStoryTheme,
  STORY_READER_LAYOUT_PRESETS,
  STORY_THEME_PRESETS,
  type StoryReaderLayoutPreset,
  type StoryReaderTheme,
} from '@/lib/story-theme';
import { evaluateThemeContrast, type ThemeContrastPair } from '@/lib/theme-contrast';
import { useAppStore } from '@/stores/use-app-store';

type ThemeColorKey = keyof StoryReaderTheme;

/** Each group of the list, and the colours it owns. */
const GROUPS: { titleKey: string; pair: ThemeContrastPair; keys: { key: ThemeColorKey; labelKey: string; alpha?: boolean }[] }[] = [
  {
    titleKey: 'themeStudio.dialogue',
    pair: 'dialogue',
    keys: [
      { key: 'dialogueBg', labelKey: 'themeStudio.dialogueBg', alpha: true },
      { key: 'dialogueText', labelKey: 'themeStudio.dialogueText' },
      { key: 'dialogueBorder', labelKey: 'themeStudio.dialogueBorder' },
    ],
  },
  {
    titleKey: 'themeStudio.name',
    pair: 'name',
    keys: [
      { key: 'nameBg', labelKey: 'themeStudio.nameBg' },
      { key: 'nameText', labelKey: 'themeStudio.nameText' },
    ],
  },
  {
    titleKey: 'themeStudio.choices',
    pair: 'choice',
    keys: [
      { key: 'choiceBg', labelKey: 'themeStudio.choiceBg', alpha: true },
      { key: 'choiceBorder', labelKey: 'themeStudio.choiceBorder' },
      { key: 'choiceText', labelKey: 'themeStudio.choiceText' },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((group) => group.keys.map((entry) => entry.key));

function serializeTheme(theme: StoryReaderTheme | undefined) {
  return JSON.stringify(sanitizeStoryTheme(theme) ?? {});
}

export default function ThemeStudioScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const { width } = useWindowDimensions();
  const colors = useColors();
  const { t } = useI18n();
  const wide = width >= 900;

  const story = useAppStore((state) => state.storiesMetadata.find((item) => item.id === storyId));
  const updateStoryMetadata = useAppStore((state) => state.updateStoryMetadata);

  const savedTheme = story?.theme;
  const savedThemeKey = serializeTheme(savedTheme);
  const savedLayout = sanitizeReaderLayoutPreset(story?.readerLayoutPreset);

  const [draftTheme, setDraftTheme] = useState<StoryReaderTheme>(() => ({ ...savedTheme }));
  const [draftLayout, setDraftLayout] = useState<StoryReaderLayoutPreset>(savedLayout);
  const [expandedKey, setExpandedKey] = useState<ThemeColorKey | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setDraftTheme({ ...savedTheme });
    setDraftLayout(savedLayout);
    setExpandedKey(null);
  }, [story?.id, savedTheme, savedThemeKey, savedLayout]);

  const draftThemeKey = serializeTheme(draftTheme);
  const isDirty = draftThemeKey !== savedThemeKey || draftLayout !== savedLayout;

  const previewColors = useMemo(
    () => mergeReaderColors(colors, sanitizeStoryTheme(draftTheme)),
    [colors, draftTheme],
  );

  /**
   * What each colour actually is right now, always as hex — the draft already
   * merged over the theme's defaults. Those defaults arrive as `rgba(...)`,
   * which both the contrast checker and the picker need converted first.
   */
  const effective = useMemo(() => {
    const resolved = {} as Record<ThemeColorKey, string>;
    for (const key of ALL_KEYS) {
      resolved[key] = parseColorToHex(previewColors[key]) ?? '#000000';
    }
    return resolved;
  }, [previewColors]);

  const failedPairs = useMemo(() => {
    const issues = evaluateThemeContrast(effective);
    return new Map(issues.map((issue) => [issue.pair, issue]));
  }, [effective]);

  /** Colours already in play, so the picker offers this theme rather than a fixed palette. */
  const palette = useMemo(
    () => Array.from(new Set(ALL_KEYS.map((key) => effective[key]))),
    [effective],
  );

  const updateColor = useCallback((key: ThemeColorKey, value: string) => {
    setDraftTheme((current) => ({ ...current, [key]: value }));
  }, []);

  const discardAndContinue = useCallback((action: () => void) => {
    const discard = () => {
      setDraftTheme({ ...savedTheme });
      setDraftLayout(savedLayout);
      setTimeout(action, 0);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('themeStudio.unsavedMessage'))) discard();
      return;
    }
    Alert.alert(t('themeStudio.unsavedTitle'), t('themeStudio.unsavedMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('themeStudio.discard'), style: 'destructive', onPress: discard },
    ]);
  }, [savedTheme, savedLayout, t]);

  usePreventRemove(isDirty, ({ data }) => {
    discardAndContinue(() => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSave = () => {
    if (!story) return;
    updateStoryMetadata(story.id, {
      theme: sanitizeStoryTheme(draftTheme),
      readerLayoutPreset: draftLayout,
    });
  };

  const handleReset = () => {
    if (!story) return;
    updateStoryMetadata(story.id, { theme: undefined });
    setDraftTheme({});
    setShowResetConfirm(false);
  };

  if (!story) {
    return (
      <ScreenContainer>
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.foreground }]}>
            {t('themeStudio.notFound')}
          </Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button">
            <Text style={{ color: colors.primary, fontSize: 17 }}>{t('menu.back')}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const layoutOptions = STORY_READER_LAYOUT_PRESETS.map((preset) => ({
    value: preset,
    label: t(`themeStudio.layout.${preset}`),
  }));

  const controls = (
    <View style={styles.controls}>
      <SettingsGroup title={t('themeStudio.presets')}>
        <View style={styles.presetGrid}>
          {STORY_THEME_PRESETS.map((preset) => {
            const selected = draftThemeKey === serializeTheme(preset.theme);
            return (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={t(preset.nameKey)}
                accessibilityState={{ selected }}
                aria-checked={selected}
                onPress={() => setDraftTheme({ ...preset.theme })}
                style={({ pressed }) => [
                  styles.presetCard,
                  {
                    borderColor: selected ? colors.primary : colors['border-subtle'],
                    borderWidth: selected ? 2 : 1,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View style={[styles.presetPanel, { backgroundColor: preset.theme.dialogueBg, borderColor: preset.theme.dialogueBorder }]}>
                  <View style={[styles.presetChip, { backgroundColor: preset.theme.nameBg }]}>
                    <Text style={[styles.presetChipText, { color: preset.theme.nameText }]}>Aa</Text>
                  </View>
                  <View style={[styles.presetChoice, { backgroundColor: preset.theme.choiceBg, borderColor: preset.theme.choiceBorder }]} />
                </View>
                <Text style={[styles.presetName, { color: colors.foreground }]}>{t(preset.nameKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('themeStudio.layout')} footer={t('themeStudio.layoutFooter')} plain>
        <SettingsRow
          label={t('themeStudio.layoutLabel')}
          right={
            <SegmentedControl
              accessibilityLabel={t('themeStudio.layoutLabel')}
              value={draftLayout}
              options={layoutOptions}
              onChange={setDraftLayout}
              segmentMinWidth={30}
            />
          }
        />
      </SettingsGroup>

      {GROUPS.map((group) => {
        const issue = failedPairs.get(group.pair);
        return (
          <SettingsGroup
            key={group.titleKey}
            title={t(group.titleKey)}
            plain
            footerTone={issue ? 'warning' : 'default'}
            footer={
              issue
                ? t('themeStudio.contrastFailed', { ratio: issue.ratio.toFixed(1) })
                : t('themeStudio.contrastOk')
            }
          >
            {group.keys.map(({ key, labelKey, alpha }) => (
              <ColorRow
                key={key}
                label={t(labelKey)}
                value={effective[key]}
                allowAlpha={alpha}
                palette={palette}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey((current) => (current === key ? null : key))}
                onChange={(hex) => updateColor(key, hex)}
              />
            ))}
          </SettingsGroup>
        );
      })}

      <SettingsGroup footer={t('themeStudio.resetFooter')} plain>
        <SettingsRow
          label={t('themeStudio.reset')}
          tone="action"
          onPress={() => setShowResetConfirm(true)}
        />
      </SettingsGroup>
    </View>
  );

  return (
    <ScreenContainer>
      <View style={[styles.nav, wide ? styles.navWide : styles.navNarrow]}>
        <View style={styles.navSide}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.navBack, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.navTitleWrap}>
          <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
            {t('themeStudio.title')}
          </Text>
          <Text style={[styles.navSubtitle, { color: colors['foreground-tertiary'] }]} numberOfLines={1}>
            {story.title}
          </Text>
        </View>
        <View style={[styles.navSide, styles.navSideEnd]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !isDirty }}
            disabled={!isDirty}
            onPress={handleSave}
            style={({ pressed }) => [styles.navAction, { opacity: !isDirty ? 0.4 : pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.navActionText, { color: colors.primary }]}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={wide ? styles.wide : styles.narrow}>
          <View style={wide ? styles.previewColumn : undefined}>
            <ScenePreview
              previewColors={previewColors}
              backdropUri={story.thumbnailUri}
              layoutPreset={draftLayout}
            />
          </View>
          <View style={wide ? styles.controlsColumn : undefined}>{controls}</View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showResetConfirm}
        title={t('themeStudio.resetTitle')}
        message={t('themeStudio.resetMessage')}
        confirmLabel={t('themeStudio.reset')}
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    width: '100%',
    alignSelf: 'center',
  },
  navWide: {
    maxWidth: 988,
  },
  navNarrow: {
    maxWidth: 592,
  },
  navSide: {
    flex: 1,
    minWidth: 60,
  },
  navSideEnd: {
    alignItems: 'flex-end',
  },
  navBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleWrap: {
    alignItems: 'center',
    flexShrink: 1,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  navSubtitle: {
    fontSize: 11,
  },
  navAction: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  navActionText: {
    fontSize: 17,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  wide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
    width: '100%',
    // Preview (560) + gap + controls (372): capped so the pair stays centred
    // instead of leaving dead space beside a preview that cannot grow.
    maxWidth: 956,
    alignSelf: 'center',
  },
  narrow: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  previewColumn: {
    flex: 1,
    minWidth: 0,
    paddingTop: 8,
    // A reader is never as wide as a desktop window, so neither is its preview.
    maxWidth: 560,
  },
  controlsColumn: {
    width: 372,
  },
  controls: {
    paddingBottom: 8,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
  },
  presetCard: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  presetPanel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  presetChip: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  presetChoice: {
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetName: {
    fontSize: 13,
    fontWeight: '500',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  notFoundText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
