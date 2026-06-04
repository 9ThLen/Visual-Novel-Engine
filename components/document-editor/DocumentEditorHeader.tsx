import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';

interface DocumentEditorHeaderProps {
  activeTitle: string;
  isPhone: boolean;
  isSaving: boolean;
  safeTop: number;
  sceneIndex: number;
  sceneCount: number;
  onBack: () => void;
  onPreview: () => void;
  onSave: () => void;
  onSaveAndPlay: () => void;
}

export function DocumentEditorHeader({
  activeTitle,
  isPhone,
  isSaving,
  safeTop,
  sceneIndex,
  sceneCount,
  onBack,
  onPreview,
  onSave,
  onSaveAndPlay,
}: DocumentEditorHeaderProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <View
      style={{
        minHeight: isPhone ? safeTop + 76 : 56,
        paddingHorizontal: isPhone ? 18 : 18,
        paddingTop: isPhone ? safeTop + 12 : 10,
        paddingBottom: isPhone ? 12 : 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors['surface-1'],
        flexDirection: 'row',
        alignItems: 'center',
        gap: isPhone ? 14 : 10,
      }}
    >
      {isPhone ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('menu.back')}
          style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <IconSymbol name="chevron.left" size={34} color={colors.foreground} />
        </Pressable>
      ) : (
        <Button variant="ghost" size="sm" onPress={onBack}>{t('menu.back')}</Button>
      )}

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: isPhone ? 20 : 16, fontWeight: '800' }}>
          {activeTitle}
        </Text>
        {isPhone ? (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 2 }}>
            {t('document.sceneCounter', { current: sceneIndex + 1, total: Math.max(sceneCount, 1) })}
          </Text>
        ) : null}
      </View>

      {isPhone ? (
        <>
          <Pressable
            onPress={onPreview}
            accessibilityRole="button"
            accessibilityLabel={t('editor.preview')}
            style={{ alignItems: 'center', justifyContent: 'center', minWidth: 62 }}
          >
            <IconSymbol name="book.fill" size={30} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 13, textAlign: 'center', marginTop: 2 }}>
              {t('editor.preview')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onSaveAndPlay}
            accessibilityRole="button"
            accessibilityLabel={t('common.play')}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconSymbol name="play" size={34} color={colors['text-inverse']} />
          </Pressable>
        </>
      ) : (
        <>
          <Button variant="secondary" size="sm" onPress={onPreview}>
            {t('editor.preview')}
          </Button>
          <Button variant="primary" size="sm" onPress={onSave} loading={isSaving}>{t('common.save')}</Button>
        </>
      )}
    </View>
  );
}
