import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import type { ColorScheme } from '@/constants/theme';
import type { VNPlateFormatCommand, VNPlateFormatState } from '@/lib/vn-plate-editor/types';

interface DocumentEditorHeaderProps {
  activeTitle: string;
  colorScheme?: ColorScheme;
  isPhone: boolean;
  isSaving: boolean;
  safeTop: number;
  sceneIndex: number;
  sceneCount: number;
  onBack: () => void;
  onPreview: () => void;
  onSave: () => void;
  onSaveAndPlay: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  formatState: VNPlateFormatState;
  onFormatText: (command: VNPlateFormatCommand, value?: string) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
}

export function DocumentEditorHeader({
  activeTitle,
  colorScheme,
  isPhone,
  isSaving,
  safeTop,
  sceneIndex,
  sceneCount,
  onBack,
  onPreview,
  onSave,
  onSaveAndPlay,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  formatState,
  onFormatText,
  focusMode,
  onToggleFocusMode,
}: DocumentEditorHeaderProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [showColors, setShowColors] = useState(false);
  const textColors = ['#111827', '#dc2626', '#d97706', '#2563eb', '#7c3aed', '#059669'];
  const toolSize = isPhone ? 34 : 36;
  // Header groups: back+title (flex) · center tools · actions (flex) — centered toolbar.

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
        flexWrap: isPhone ? 'wrap' : 'nowrap',
        alignItems: 'center',
        gap: isPhone ? 14 : 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: isPhone ? 14 : 10 }}>
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
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('menu.back')}
            style={{
              height: 36,
              paddingHorizontal: 12,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(colors.primary, 0.08),
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{t('menu.back')}</Text>
          </Pressable>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: isPhone ? 20 : 16, fontWeight: '800' }}>
            {activeTitle}
          </Text>
          {isPhone ? (
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 2 }}>
              {t('document.sceneCounter', { current: sceneIndex + 1, total: Math.max(sceneCount, 1) })}
            </Text>
          ) : null}
        </View>
      </View>

      {!focusMode ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          accessibilityRole="button"
          accessibilityLabel={t('editor.undo')}
          accessibilityHint="Ctrl+Z"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canUndo ? 1 : 0.35 }}
        >
          <IconSymbol name="undo" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={onRedo}
          disabled={!canRedo}
          accessibilityRole="button"
          accessibilityLabel={t('editor.redo')}
          accessibilityHint="Ctrl+Y"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canRedo ? 1 : 0.35 }}
        >
          <IconSymbol name="redo" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      ) : null}

      {!focusMode ? (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: isPhone ? 'center' : 'flex-start',
        gap: 2,
        padding: 3,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        flexBasis: isPhone ? '100%' : undefined,
        ...(isPhone ? ({ order: 2 } as any) : {}),
        position: 'relative',
      }}>
        {([
          ['bold', 'B', t('editor.format.bold')],
          ['italic', 'I', t('editor.format.italic')],
          ['underline', 'U', t('editor.format.underline')],
          ['strikethrough', 'S', t('editor.format.strikethrough')],
          ['alignLeft', '', t('editor.format.alignLeft')],
          ['alignCenter', '', t('editor.format.alignCenter')],
          ['alignRight', '', t('editor.format.alignRight')],
          ['clear', '', t('editor.format.clear')],
        ] as const).map(([command, label, accessibilityLabel]) => {
          const active = command === 'alignLeft' ? formatState.alignment === 'left'
            : command === 'alignCenter' ? formatState.alignment === 'center'
            : command === 'alignRight' ? formatState.alignment === 'right'
            : command !== 'clear' && formatState[command];
          return (
            <Pressable
              key={command}
              onPress={() => onFormatText(command)}
              disabled={!formatState.canFormat}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={{ disabled: !formatState.canFormat, selected: active }}
              style={{
                width: toolSize,
                height: toolSize,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors['surface-2'] : 'transparent',
                opacity: formatState.canFormat ? 1 : 0.35,
              }}
            >
              {command === 'alignLeft' || command === 'alignCenter' || command === 'alignRight' || command === 'clear' ? (
                <IconSymbol
                  name={command === 'alignLeft' ? 'format.align.left' : command === 'alignCenter' ? 'format.align.center' : command === 'alignRight' ? 'format.align.right' : 'format.clear'}
                  size={19}
                  color={colors.foreground}
                />
              ) : <Text style={{
                color: colors.foreground,
                fontSize: 16,
                fontWeight: command === 'bold' ? '800' : '600',
                fontStyle: command === 'italic' ? 'italic' : 'normal',
                textDecorationLine: command === 'underline' ? 'underline' : command === 'strikethrough' ? 'line-through' : 'none',
              }}>
                {label}
              </Text>}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setShowColors((current) => !current)}
          disabled={!formatState.canFormat}
          accessibilityRole="button"
          accessibilityLabel={t('editor.format.color')}
          accessibilityState={{ disabled: !formatState.canFormat, expanded: showColors }}
          style={{ width: toolSize, height: toolSize, borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: formatState.canFormat ? 1 : 0.35 }}
        >
          <Text style={{ color: formatState.color ?? colors.foreground, fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' }}>A</Text>
        </Pressable>
        {showColors && formatState.canFormat ? (
          <View style={{ position: 'absolute', top: toolSize + 10, right: 0, zIndex: 20, flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors['surface-1'] }}>
            {textColors.map((color) => (
              <Pressable
                key={color}
                onPress={() => { onFormatText('color', color); setShowColors(false); }}
                accessibilityRole="button"
                accessibilityLabel={t('editor.format.colorValue', { color })}
                accessibilityState={{ selected: formatState.color === color }}
                style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, borderWidth: formatState.color === color ? 3 : 1, borderColor: formatState.color === color ? colors.primary : colors.border }}
              />
            ))}
          </View>
        ) : null}
      </View>
      ) : null}

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
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <Pressable
            onPress={onToggleFocusMode}
            accessibilityRole="button"
            accessibilityLabel={focusMode ? t('editor.exitFocus') : t('editor.focusMode')}
            accessibilityState={{ selected: focusMode }}
            style={{
              height: 36,
              paddingHorizontal: 12,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: focusMode ? withAlpha(colors.primary, 0.1) : colors['surface-1'],
            }}
          >
            <Text style={{ color: focusMode ? colors.primary : colors.foreground, fontSize: 13, fontWeight: '600' }}>
              {focusMode ? t('editor.exitFocus') : t('editor.focusMode')}
            </Text>
          </Pressable>
          <Button variant="secondary" size="sm" onPress={onPreview}>
            {t('editor.preview')}
          </Button>
          <Button variant="primary" size="sm" onPress={onSave} loading={isSaving}>{t('common.save')}</Button>
        </View>
      )}
    </View>
  );
}
