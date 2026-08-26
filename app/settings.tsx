import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useAppStore } from '@/stores/use-app-store';
import {
  normalizeUserSettings,
  readerFontScaleOptions,
  readerLineHeightScaleOptions,
} from '@/lib/user-settings';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { LanguageSelector } from '@/components/LanguageSelector';
import { StorageDurabilitySection } from '@/components/settings/StorageDurabilitySection';
import {
  SETTINGS_CONTENT_MAX_WIDTH,
  SettingsFooter,
  SettingsGroup,
  SettingsRow,
  SettingsSliderRow,
} from '@/components/settings/list';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { getSwitchActiveThumbProps } from '@/lib/switch-platform';

const APP_VERSION = '1.0.0';

/** Wide enough for the longest of the three volume labels. */
const AUDIO_LABEL_WIDTH = 76;

const textSizes = ['small', 'medium', 'large'] as const;

/** The size preview shows its own size, the way a type ramp does. */
const textSizeFontSizes: Record<(typeof textSizes)[number], number> = {
  small: 11,
  medium: 14,
  large: 17,
};

export default function SettingsScreen() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      return () => {
        void stopReaderPlayback();
      };
    }, []),
  );
  const colors = useColors();
  const rawSettings = useAppStore((state) => state.settings);
  const settings = useMemo(() => normalizeUserSettings(rawSettings), [rawSettings]);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useI18n();

  const textSizeOptions = useMemo(
    () =>
      textSizes.map((size) => ({
        value: size,
        label: 'A',
        accessibilityLabel: t(`settings.${size}`),
        fontSize: textSizeFontSizes[size],
      })),
    [t],
  );

  const fontScaleOptions = useMemo(
    () =>
      readerFontScaleOptions.map((scale) => ({
        value: scale,
        label: String(Math.round(scale * 100)),
        accessibilityLabel: `${Math.round(scale * 100)}%`,
      })),
    [],
  );

  const lineHeightOptions = useMemo(
    () =>
      readerLineHeightScaleOptions.map((scale) => ({
        value: scale,
        label: scale.toFixed(1),
        accessibilityLabel: `${Math.round(scale * 100)}%`,
      })),
    [],
  );

  if (!settings) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <Text style={{ color: colors.foreground }}>{t('common.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const toggle = (value: boolean, onValueChange: (next: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors['surface-2'], true: colors.primary }}
      thumbColor={colors['control-knob']}
      {...getSwitchActiveThumbProps(Platform.OS, colors['control-knob'])}
      accessibilityRole="switch"
      accessibilityLabel={label}
    />
  );

  return (
    <ScreenContainer>
      <View style={styles.nav}>
        <View style={styles.navInner}>
          <View style={styles.navSide} />
          <Text style={[styles.navTitle, { color: colors.foreground }]}>{t('settings.title')}</Text>
          <View style={[styles.navSide, styles.navSideEnd]}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.navAction, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.navActionText, { color: colors.primary }]}>
                {t('settings.done')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <SettingsGroup footer={t('settings.cloudFooter')}>
          <SettingsRow icon="globe" label={t('settings.language')} right={<LanguageSelector compact />} />
          <SettingsRow
            icon="cloud"
            label={t('cloudBackup.title')}
            chevron
            onPress={() => router.push('/cloud-backup')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.audio')}>
          <SettingsSliderRow
            icon="music"
            label={t('settings.music')}
            labelWidth={AUDIO_LABEL_WIDTH}
            value={settings.bgmVolume}
            onValueChange={(bgmVolume) => updateSettings({ bgmVolume })}
          />
          <SettingsSliderRow
            icon="voice"
            label={t('settings.voice')}
            labelWidth={AUDIO_LABEL_WIDTH}
            value={settings.voiceVolume}
            onValueChange={(voiceVolume) => updateSettings({ voiceVolume })}
          />
          <SettingsSliderRow
            icon="sound"
            label={t('settings.effects')}
            labelWidth={AUDIO_LABEL_WIDTH}
            value={settings.sfxVolume}
            onValueChange={(sfxVolume) => updateSettings({ sfxVolume })}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.textSection')} footer={t('settings.textFooter')}>
          <SettingsSliderRow
            icon="lightning"
            label={t('settings.speed')}
            labelWidth={90}
            value={settings.textSpeed}
            onValueChange={(textSpeed) => updateSettings({ textSpeed })}
          />
          <SettingsRow
            icon="text"
            label={t('settings.textSize')}
            right={
              <SegmentedControl
                accessibilityLabel={t('settings.textSize')}
                value={settings.textSize}
                options={textSizeOptions}
                onChange={(textSize) => updateSettings({ textSize })}
                segmentMinWidth={34}
              />
            }
          />
          <SettingsRow
            icon="manuscript"
            label={t('settings.readerFont')}
            right={
              <SegmentedControl
                accessibilityLabel={t('settings.readerFontScale')}
                value={settings.readerFontScale}
                options={fontScaleOptions}
                onChange={(readerFontScale) => updateSettings({ readerFontScale })}
                segmentMinWidth={32}
              />
            }
          />
          <SettingsRow
            icon="list"
            label={t('settings.lineHeight')}
            right={
              <SegmentedControl
                accessibilityLabel={t('settings.readerLineHeightScale')}
                value={settings.readerLineHeightScale}
                options={lineHeightOptions}
                onChange={(readerLineHeightScale) => updateSettings({ readerLineHeightScale })}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.playbackSection')} footer={t('settings.playbackFooter')}>
          <SettingsRow
            icon="play"
            label={t('settings.autoPlay')}
            description={t('settings.autoPlayDescription')}
            right={toggle(
              settings.autoPlay,
              (autoPlay) => updateSettings({ autoPlay }),
              t('settings.autoPlay'),
            )}
          />
          <SettingsRow
            icon="image"
            label={t('settings.parallax')}
            description={t('settings.parallaxShort')}
            right={toggle(
              settings.parallaxEnabled,
              (parallaxEnabled) => updateSettings({ parallaxEnabled }),
              t('settings.parallax'),
            )}
          />
          <SettingsRow
            icon="movie"
            label={t('settings.backgroundVideo')}
            description={t('settings.backgroundVideoShort')}
            right={toggle(
              settings.backgroundVideoEnabled,
              (backgroundVideoEnabled) => updateSettings({ backgroundVideoEnabled }),
              t('settings.backgroundVideo'),
            )}
          />
        </SettingsGroup>

        <StorageDurabilitySection />

        <SettingsFooter>
          {t('app.name')} {APP_VERSION}
          {'\n'}
          {t('settings.aboutShort')}
        </SettingsFooter>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    height: 44,
    justifyContent: 'center',
  },
  navInner: {
    width: '100%',
    maxWidth: SETTINGS_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navSide: {
    flex: 1,
  },
  navSideEnd: {
    alignItems: 'flex-end',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  navAction: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  navActionText: {
    fontSize: 17,
  },
  content: {
    width: '100%',
    maxWidth: SETTINGS_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
});
