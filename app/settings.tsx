import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { stopReaderPlayback } from '@/hooks/useReaderAudio';
import { ScreenContainer } from '@/components/screen-container';
import { useStoryState, useStoryActions } from '@/lib/story-hooks';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui';

export default function SettingsScreen() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void stopReaderPlayback();
      return () => {
        void stopReaderPlayback();
      };
    }, []),
  );
  const colors = useColors();
  const { settings } = useStoryState();
  const { updateSettings } = useStoryActions();
  const { t } = useI18n();

  // ── Toggle row ───────────────────────────────────────────────────────────
  const ToggleRow = ({
    label,
    value,
    onValueChange,
    emoji,
    description,
  }: { label: string; value: boolean; onValueChange: (v: boolean) => void; emoji?: string; description?: string }) => (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>
            {emoji ? `${emoji}  ` : ''}{label}
          </Text>
          {description && (
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{description}</Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
          accessibilityRole="switch"
          accessibilityLabel={label}
        />
      </View>
    </View>
  );

  if (!settings) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.foreground }}>{t('common.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  // ── Reusable section wrapper ─────────────────────────────────────────────
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </Text>
      {children}
    </View>
  );

  const Divider = () => <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />;

  // ── Slider row ───────────────────────────────────────────────────────────
  const SliderRow = ({
    label,
    value,
    onValueChange,
    emoji,
  }: { label: string; value: number; onValueChange: (v: number) => void; emoji?: string }) => (
    <View style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500' }}>
          {emoji ? `${emoji}  ` : ''}{label}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '600' }}>
          {Math.round(value * 100)}%
        </Text>
      </View>
      <Slider
        style={{ height: 36, marginHorizontal: -4 }}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.primary}
        accessibilityLabel={label}
      />
    </View>
  );

  // ── Text size selector ───────────────────────────────────────────────────
  const sizes = ['small', 'medium', 'large'] as const;

  return (
    <ScreenContainer className="p-4">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.foreground }}>{t('settings.title')}</Text>
        <Button
          variant="primary"
          size="sm"
          onPress={() => router.back()}
          accessibilityLabel={t('common.close')}
        >
          {t('common.ok')}
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Language */}
        <Section title={`🌐  ${t('settings.language')}`}>
          <LanguageSelector />
        </Section>

        {/* Audio */}
        <Section title={`🔊  ${t('settings.audio')}`}>
          <SliderRow label={t('settings.bgmVolume')} emoji="🎵" value={settings.bgmVolume}
            onValueChange={(v) => updateSettings({ bgmVolume: v })} />
          <Divider />
          <SliderRow label={t('settings.voiceVolume')} emoji="🗣" value={settings.voiceVolume}
            onValueChange={(v) => updateSettings({ voiceVolume: v })} />
          <Divider />
          <SliderRow label={t('settings.sfxVolume')} emoji="🔔" value={settings.sfxVolume}
            onValueChange={(v) => updateSettings({ sfxVolume: v })} />
        </Section>

        {/* Text */}
        <Section title={`✏️  ${t('settings.textSection')}`}>
          <SliderRow label={t('settings.textSpeed')} emoji="⚡" value={settings.textSpeed}
            onValueChange={(v) => updateSettings({ textSpeed: v })} />
          <Divider />
          <View>
            <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '500', marginBottom: 10 }}>
              🔡  {t('settings.textSize')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sizes.map((size) => (
                <Pressable
                  key={size}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    backgroundColor: settings.textSize === size ? colors.primary : 'transparent',
                    borderColor: settings.textSize === size ? colors.primary : colors.border,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                  onPress={() => updateSettings({ textSize: size })}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.textSize')}
                  accessibilityState={{ selected: settings.textSize === size }}
                >
                  <Text style={{ color: settings.textSize === size ? colors['text-inverse'] : colors.foreground, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>
                    {t(`settings.${size}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>

        {/* Playback */}
        <Section title={`▶️  ${t('settings.playbackSection')}`}>
          <ToggleRow
            label={t('settings.autoPlay')}
            emoji="⏯"
            value={settings.autoPlay}
            onValueChange={(v) => updateSettings({ autoPlay: v })}
            description={t('settings.autoPlayDescription')}
          />
        </Section>

        {/* About */}
        <Section title={`ℹ️  ${t('settings.aboutSection')}`}>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
            {t('app.name')} v1.0.0{'\n'}
            {t('settings.aboutDescription')}
          </Text>
        </Section>

      </ScrollView>
    </ScreenContainer>
  );
}
