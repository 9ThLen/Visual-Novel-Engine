/**
 * The scene page's "Auto / Always comic / Always novel" switch
 * (docs/plans/COMIC-MODE-PLAN.md, section 9.4). A pill names the scene's
 * setting; pressing it opens the three choices. A scene that holds what a
 * comic page cannot show yet is read as the novel whatever it is set to, and
 * the switch says why. A scene with comic edits can have them all reset here,
 * once the author confirms.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import type { NovelOnlyReason } from '@/lib/comic/comic-presentation';
import type { ScenePresentation } from '@/lib/engine/types';

const PRESENTATIONS: ScenePresentation[] = ['auto', 'comic', 'novel'];

const LABEL_KEYS: Record<ScenePresentation, string> = {
  auto: 'document.comic.auto',
  comic: 'document.comic.comic',
  novel: 'document.comic.novel',
};

const PILL_KEYS: Record<ScenePresentation, string> = {
  auto: 'document.comic.pillAuto',
  comic: 'document.comic.pillComic',
  novel: 'document.comic.pillNovel',
};

const HINT_KEYS: Record<ScenePresentation, string> = {
  auto: 'document.comic.autoHint',
  comic: 'document.comic.comicHint',
  novel: 'document.comic.novelHint',
};

const NOVEL_ONLY_KEYS: Record<NovelOnlyReason, string> = {
  video: 'document.comic.novelOnlyVideo',
  interactive_object: 'document.comic.novelOnlyInteractive',
};

interface SceneComicSwitchProps {
  presentation: ScenePresentation;
  /** Why the scene can only be read as the novel, or null. */
  novelOnly: NovelOnlyReason | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (presentation: ScenePresentation) => void;
  /** How many comic edits the scene has. */
  editCount?: number;
  /** Takes every comic edit of the scene away; left out, the menu offers no reset. */
  onResetEdits?: () => void;
}

export function SceneComicSwitch({
  presentation,
  novelOnly,
  open,
  onOpenChange,
  onChange,
  editCount = 0,
  onResetEdits,
}: SceneComicSwitchProps) {
  const colors = useColors('light');
  const { t } = useI18n();
  // The reset asks once more before it acts; closing the menu forgets the question.
  const [confirming, setConfirming] = useState(false);
  const setOpen = (next: boolean) => {
    setConfirming(false);
    onOpenChange(next);
  };
  // Set to be a comic, read as the novel: the pill warns.
  const overruled = presentation === 'comic' && novelOnly !== null;
  const tint = overruled ? colors.warning : presentation === 'auto' ? colors.muted : colors.primary;

  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('document.comic.switchLabel', { setting: t(LABEL_KEYS[presentation]) })}
        accessibilityState={{ expanded: open }}
        testID="scene-comic-switch"
        hitSlop={6}
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          height: 26,
          paddingHorizontal: 9,
          borderRadius: 13,
          borderWidth: 1,
          borderColor: presentation === 'auto' ? colors.border : withAlpha(tint, 0.5),
          backgroundColor: presentation === 'auto' ? 'transparent' : withAlpha(tint, 0.1),
        }}
      >
        <Text style={{ color: tint, fontSize: 12, fontWeight: '800' }}>{overruled ? '⚠' : '▦'}</Text>
        <Text style={{ color: presentation === 'auto' ? colors.muted : tint, fontSize: 12, fontWeight: '700' }}>
          {t(PILL_KEYS[presentation])}
        </Text>
      </Pressable>
      {open ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('document.comic.title')}
          style={{
            position: 'absolute',
            top: 32,
            right: 0,
            width: 280,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: colors['surface-container'],
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 5,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 12, paddingVertical: 6 }}>
            {t('document.comic.title')}
          </Text>
          {PRESENTATIONS.map((item) => {
            const selected = item === presentation;
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                testID={`scene-comic-${item}`}
                onPress={() => {
                  setOpen(false);
                  if (!selected) onChange(item);
                }}
                style={{
                  flexDirection: 'row',
                  gap: 9,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: selected ? withAlpha(colors.primary, 0.08) : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    marginTop: 2,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{t(LABEL_KEYS[item])}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{t(HINT_KEYS[item])}</Text>
                </View>
              </Pressable>
            );
          })}
          {novelOnly ? (
            <Text
              testID="scene-comic-novel-only"
              style={{
                marginHorizontal: 12,
                marginTop: 6,
                marginBottom: 4,
                padding: 8,
                borderRadius: 6,
                color: colors.foreground,
                fontSize: 12,
                lineHeight: 17,
                backgroundColor: withAlpha(colors.warning, 0.12),
              }}
            >
              {t(NOVEL_ONLY_KEYS[novelOnly])}
            </Text>
          ) : null}
          {editCount > 0 && onResetEdits ? (
            <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              {confirming ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{t('document.comic.resetQuestion')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      accessibilityRole="button"
                      testID="scene-comic-reset-confirm"
                      onPress={() => {
                        setOpen(false);
                        onResetEdits();
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.error }}
                    >
                      <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>{t('document.comic.resetConfirm')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      testID="scene-comic-reset-cancel"
                      onPress={() => setConfirming(false)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>{t('document.comic.resetCancel')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  testID="scene-comic-reset"
                  onPress={() => setConfirming(true)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>{t('document.comic.resetEdits')}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                    {t('document.comic.resetEditsHint', { count: editCount })}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
