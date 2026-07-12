import Slider from '@react-native-community/slider';
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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ReaderDialoguePanel } from '@/components/reader/ReaderDialoguePanel';
import { ScreenContainer } from '@/components/screen-container';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import {
  mergeReaderColors,
  sanitizeStoryTheme,
  STORY_THEME_PRESETS,
  type StoryReaderTheme,
} from '@/lib/story-theme';
import { useAppStore } from '@/stores/use-app-store';

const COLOR_SWATCHES = [
  '#070d1a', '#111827', '#374151', '#ffffff', '#f9fafb', '#d1d5db',
  '#2563eb', '#7c3aed', '#e8def8', '#f6dce1', '#ffbf4d', '#b8741a',
];

type ThemeColorKey = keyof StoryReaderTheme;

function serializeTheme(theme: StoryReaderTheme | undefined) {
  return JSON.stringify(sanitizeStoryTheme(theme) ?? {});
}

function getAlpha(color: string | undefined) {
  const normalized = sanitizeStoryTheme({ dialogueBg: color })?.dialogueBg;
  if (!normalized || normalized.length !== 9) return 1;
  return parseInt(normalized.slice(7, 9), 16) / 255;
}

interface ColorControlProps {
  label: string;
  themeKey: ThemeColorKey;
  value: string | undefined;
  fallback: string;
  onChange: (key: ThemeColorKey, value: string) => void;
}

function ColorControl({ label, themeKey, value, fallback, onChange }: ColorControlProps) {
  const colors = useColors();
  const { t } = useI18n();
  const displayedValue = value ?? fallback;
  const [input, setInput] = useState(displayedValue);

  useEffect(() => setInput(displayedValue), [displayedValue]);

  const commitInput = () => {
    const sanitized = sanitizeStoryTheme({ [themeKey]: input })?.[themeKey];
    if (sanitized) onChange(themeKey, sanitized);
    else setInput(displayedValue);
  };

  return (
    <View style={styles.colorControl}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.swatchRow}>
        {COLOR_SWATCHES.map((swatch) => (
          <Pressable
            key={swatch}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${swatch}`}
            onPress={() => onChange(themeKey, swatch)}
            style={[
              styles.swatch,
              { backgroundColor: swatch, borderColor: colors.border },
              displayedValue.slice(0, 7).toLowerCase() === swatch && {
                borderColor: colors.primary,
                borderWidth: 3,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.hexRow}>
        <View style={[styles.currentColor, { backgroundColor: displayedValue, borderColor: colors.border }]} />
        <TextInput
          value={input}
          onChangeText={setInput}
          onBlur={commitInput}
          onSubmitEditing={commitInput}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel={t('themeStudio.hexValue', { label })}
          style={[
            styles.hexInput,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        />
      </View>
    </View>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors['surface-container'], borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  primary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const backgroundColor = primary ? colors.primary : danger ? withAlpha(colors.danger, 0.12) : colors.surface;
  const textColor = primary ? colors['text-inverse'] : danger ? colors.danger : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor, borderColor: primary ? colors.primary : colors.border },
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.actionButtonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
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
  const [draftTheme, setDraftTheme] = useState<StoryReaderTheme>(() => ({ ...savedTheme }));
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setDraftTheme({ ...savedTheme });
  }, [story?.id, savedThemeKey]);

  const draftThemeKey = serializeTheme(draftTheme);
  const isDirty = draftThemeKey !== savedThemeKey;
  const previewColors = useMemo(
    () => mergeReaderColors(colors, sanitizeStoryTheme(draftTheme)),
    [colors, draftThemeKey],
  );

  const updateColor = useCallback((key: ThemeColorKey, value: string) => {
    setDraftTheme((current) => ({ ...current, [key]: value }));
  }, []);

  const discardAndContinue = useCallback((action: () => void) => {
    const discard = () => {
      setDraftTheme({ ...savedTheme });
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
  }, [savedTheme, t]);

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
    updateStoryMetadata(story.id, { theme: sanitizeStoryTheme(draftTheme) });
  };

  const handleReset = () => {
    if (!story) return;
    updateStoryMetadata(story.id, { theme: undefined });
    setDraftTheme({});
    setShowResetConfirm(false);
  };

  if (!story) {
    return (
      <ScreenContainer className="p-4">
        <View style={styles.notFound}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t('themeStudio.notFound')}</Text>
          <ActionButton label={t('menu.back')} onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  const dialogueAlpha = getAlpha(draftTheme.dialogueBg);
  const preview = (
    <View style={[styles.previewCard, { borderColor: colors.border, backgroundColor: '#172033' }]}>
      <View style={[styles.previewGlow, styles.previewGlowOne]} />
      <View style={[styles.previewGlow, styles.previewGlowTwo]} />
      <View style={styles.previewLabelWrap}>
        <Text style={styles.previewLabel}>{t('themeStudio.preview')}</Text>
      </View>
      <View style={styles.previewPanelWrap}>
        <ReaderDialoguePanel
          colors={previewColors}
          speaker={t('themeStudio.previewSpeaker')}
          speakerTextStyle={{ color: previewColors.nameText, fontSize: 13 }}
          displayedText={t('themeStudio.previewDialogue')}
          isTyping={false}
          dialogueTextStyle={{ color: previewColors.dialogueText, fontSize: 17, lineHeight: 25 }}
          cursorStyle={{ color: previewColors.dialogueText }}
          choices={[
            { id: 'choice-1', text: t('themeStudio.previewChoiceOne'), nextSceneId: '', targetSceneId: null, index: 0 },
            { id: 'choice-2', text: t('themeStudio.previewChoiceTwo'), nextSceneId: '', targetSceneId: null, index: 1 },
          ]}
          choicesFontSize={15}
          getChoiceAccessibilityLabel={(text) => text}
          onSelectChoice={() => {}}
          onTap={() => {}}
          pagesLength={1}
          pageIndex={0}
          readerControls={null}
        />
      </View>
    </View>
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.content, wide && styles.contentWide]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('menu.back')}
              onPress={() => router.back()}
              style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <IconSymbol name="arrow.left" size={20} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>{t('themeStudio.title')}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>{story.title}</Text>
            </View>
            <View style={styles.headerActions}>
              <ActionButton label={t('common.cancel')} onPress={() => setDraftTheme({ ...savedTheme })} disabled={!isDirty} />
              <ActionButton label={t('common.save')} onPress={handleSave} primary disabled={!isDirty} />
            </View>
          </View>

          <View style={wide ? styles.mainRow : styles.mainColumn}>
            <View style={wide ? styles.previewColumn : undefined}>{preview}</View>
            <View style={styles.settingsColumn}>
              <SettingsSection title={t('themeStudio.presets')}>
                <View style={styles.presetGrid}>
                  {STORY_THEME_PRESETS.map((preset) => {
                    const selected = draftThemeKey === serializeTheme(preset.theme);
                    return (
                      <Pressable
                        key={preset.id}
                        accessibilityRole="button"
                        accessibilityLabel={t(preset.nameKey)}
                        accessibilityState={{ selected }}
                        onPress={() => setDraftTheme({ ...preset.theme })}
                        style={({ pressed }) => [
                          styles.presetCard,
                          { borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <View style={styles.presetColors}>
                          {(['dialogueBg', 'nameBg', 'choiceBg', 'choiceText'] as const).map((key) => (
                            <View key={key} style={[styles.presetColor, { backgroundColor: preset.theme[key] }]} />
                          ))}
                        </View>
                        <Text style={[styles.presetName, { color: colors.foreground }]}>{t(preset.nameKey)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SettingsSection>

              <SettingsSection title={t('themeStudio.dialogue')}>
                <ColorControl label={t('themeStudio.dialogueBg')} themeKey="dialogueBg" value={draftTheme.dialogueBg} fallback={colors.dialogueBg} onChange={updateColor} />
                <View style={styles.sliderHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('themeStudio.opacity')}</Text>
                  <Text style={[styles.opacityValue, { color: colors.muted }]}>{Math.round(dialogueAlpha * 100)}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  value={dialogueAlpha}
                  onValueChange={(value) => updateColor('dialogueBg', withAlpha(draftTheme.dialogueBg ?? colors.dialogueBg, value))}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                  accessibilityLabel={t('themeStudio.opacity')}
                />
                <ColorControl label={t('themeStudio.dialogueText')} themeKey="dialogueText" value={draftTheme.dialogueText} fallback={colors.dialogueText} onChange={updateColor} />
                <ColorControl label={t('themeStudio.dialogueBorder')} themeKey="dialogueBorder" value={draftTheme.dialogueBorder} fallback={colors.dialogueBorder} onChange={updateColor} />
              </SettingsSection>

              <SettingsSection title={t('themeStudio.name')}>
                <ColorControl label={t('themeStudio.nameBg')} themeKey="nameBg" value={draftTheme.nameBg} fallback={colors.nameBg} onChange={updateColor} />
                <ColorControl label={t('themeStudio.nameText')} themeKey="nameText" value={draftTheme.nameText} fallback={colors.nameText} onChange={updateColor} />
              </SettingsSection>

              <SettingsSection title={t('themeStudio.choices')}>
                <ColorControl label={t('themeStudio.choiceBg')} themeKey="choiceBg" value={draftTheme.choiceBg} fallback={colors.choiceBg} onChange={updateColor} />
                <ColorControl label={t('themeStudio.choiceBorder')} themeKey="choiceBorder" value={draftTheme.choiceBorder} fallback={colors.choiceBorder} onChange={updateColor} />
                <ColorControl label={t('themeStudio.choiceText')} themeKey="choiceText" value={draftTheme.choiceText} fallback={colors.choiceText} onChange={updateColor} />
              </SettingsSection>

              <View style={styles.resetWrap}>
                <ActionButton label={t('themeStudio.reset')} onPress={() => setShowResetConfirm(true)} danger />
              </View>
            </View>
          </View>
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
  scrollContent: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  content: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: spacing.xl },
  contentWide: { paddingHorizontal: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 180 },
  pageTitle: { ...typeScale.pageTitle },
  subtitle: { ...typeScale.label },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { minHeight: 42, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { ...typeScale.label, fontWeight: '700' },
  mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  mainColumn: { gap: spacing.xl },
  previewColumn: { flex: 1, minWidth: 0 },
  settingsColumn: { flex: 1.15, minWidth: 0, gap: spacing.lg },
  previewCard: { minHeight: 560, borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  previewGlow: { position: 'absolute', borderRadius: radius.full, opacity: 0.35 },
  previewGlowOne: { width: 340, height: 340, backgroundColor: '#7c3aed', top: -90, right: -70 },
  previewGlowTwo: { width: 260, height: 260, backgroundColor: '#2563eb', bottom: 80, left: -100 },
  previewLabelWrap: { position: 'absolute', top: spacing.lg, left: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: '#00000066' },
  previewLabel: { ...typeScale.caption, color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewPanelWrap: { paddingTop: 160 },
  section: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typeScale.sectionTitle },
  colorControl: { gap: spacing.sm },
  fieldLabel: { ...typeScale.label },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 30, height: 30, borderRadius: radius.full, borderWidth: 1 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  currentColor: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1 },
  hexInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15 },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -spacing.sm },
  opacityValue: { ...typeScale.label },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetCard: { width: 132, borderWidth: 2, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm },
  presetColors: { height: 34, flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden' },
  presetColor: { flex: 1 },
  presetName: { ...typeScale.label },
  resetWrap: { alignItems: 'flex-start' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
});
