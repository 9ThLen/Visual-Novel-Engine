/**
 * components/editor/PropertiesPanel.tsx — Right panel with form fields
 * Shows properties for all 12 block types with full type safety.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import {
  BLOCK_TYPE_INFO,
  type TimelineStep,
  type BlockData,
  type BlockType,
  BackgroundBlockData,
  CharacterBlockData,
  TextBlockData,
  DialogueBlockData,
  ChoiceBlockData,
  EffectBlockData,
  MusicBlockData,
  SoundBlockData,
  InteractiveObjectBlockData,
  CameraBlockData,
  VariableBlockData,
  TransitionBlockData,
} from '@/lib/engine/types';
import { getBlockEmptyFields, type BlockDataByType } from '@/lib/editor/block-validation';
import type { ThemeColorPalette } from '@/constants/theme';
import { AssetPicker, type AssetCategory } from './modals/AssetPicker';
import { useI18n } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getBlockIconName } from '@/lib/editor/block-icon';

interface Props {
  block: TimelineStep;
  onUpdate: (updates: Partial<TimelineStep>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

/**
 * Helper: narrow block data + updater by block type.
 * Yields `{ data: BlockDataByType[T], upd }` where `upd` is constrained
 * to the fields of that specific block data interface.
 */
function useTypedBlock<T extends BlockType>(
  blockType: T,
  data: BlockData,
  onUpdate: (updates: Partial<TimelineStep>) => void,
) {
  const typedData = data as BlockDataByType[T];
  const upd = <K extends keyof BlockDataByType[T]>(field: K, value: BlockDataByType[T][K]) =>
    onUpdate({ data: { ...typedData, [field]: value } });
  return { data: typedData, upd };
}

export function PropertiesPanel({ block, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const colors = useColors();
  const { t } = useI18n();
  const info = BLOCK_TYPE_INFO[block.blockType];
  const { data, upd } = useTypedBlock(block.blockType, block.data, onUpdate);

  const missingFields = useMemo(
    () => new Set(getBlockEmptyFields(block.blockType, data)),
    [block.blockType, data],
  );

  const [picker, setPicker] = useState<{
    visible: boolean;
    category: AssetCategory;
    onSelect: (id: string) => void;
  }>({ visible: false, category: 'backgrounds', onSelect: () => { } });

  const openPicker = (
    category: AssetCategory,
    _currentValue: string | null,
    onChange: (id: string) => void,
  ) => {
    setPicker({
      visible: true,
      category,
      onSelect: (id: string) => {
        onChange(id);
        setPicker((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  const renderAssetField = (
    label: string,
    category: AssetCategory,
    value: string | null,
    onChange: (v: string) => void,
  ) => (
    <Field t={t} label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput
          value={value || ''}
          onChangeText={onChange}
          placeholder={`Select ${category}...`}
          placeholderTextColor={colors.muted}
          style={[S(colors), { flex: 1 }]}
        />
        <Pressable
          onPress={() => openPicker(category, value, onChange)}
          style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
          accessibilityRole="button"
          accessibilityLabel={t('common.search')}
        >
          <Text style={{ fontSize: 12, color: colors['text-inverse'], fontWeight: '600' }}>
            {t('common.search')}
          </Text>
        </Pressable>
      </View>
    </Field>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          borderLeftWidth: 4,
          borderLeftColor: info.color,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <IconSymbol
            name={getBlockIconName(block.blockType)}
            size={18}
            color={info.color}
            style={{ marginRight: 6 }}
          />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
            {info.label}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={{ padding: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.closePanel')}
        >
          <IconSymbol name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {renderForm(
          block.blockType,
          data,
          upd,
          colors,
          missingFields,
          t,
          openPicker,
          renderAssetField,
        )}
      </ScrollView>

      {picker.visible && (
        <AssetPicker
          visible
          category={picker.category}
          onSelect={picker.onSelect}
          onClose={() => setPicker((prev) => ({ ...prev, visible: false }))}
        />
      )}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={onDuplicate}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.duplicate')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconSymbol name="duplicate" size={14} color={colors.foreground} />
            <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600' }}>
              {t('common.duplicate')}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: `${colors.error}20`,
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconSymbol name="delete" size={14} color={colors.error} />
            <Text style={{ fontSize: 12, color: colors.error, fontWeight: '600' }}>
              {t('common.delete')}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

type TypedUpdater<T extends BlockType> = <K extends keyof BlockDataByType[T]>(
  field: K,
  value: BlockDataByType[T][K],
) => void;

const S = (c: ThemeColorPalette, error?: boolean) =>
  ({
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: error ? c.error : c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: c.foreground,
  }) as const;

function Field({
  label,
  children,
  colors,
  error,
  t: tFn,
}: {
  label: string;
  children: React.ReactNode;
  colors: ThemeColorPalette;
  error?: boolean;
  t?: (key: string) => string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: error ? colors.error : colors.muted,
          }}
        >
          {label}
        </Text>
        {error && (
          <Text style={{ fontSize: 9, color: colors.error, fontWeight: '600' }}>
            {tFn ? tFn('editor.properties.required') : 'REQUIRED'}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function OptBtns({
  options,
  value,
  onChange,
  colors,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColorPalette;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: value === o ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: value === o ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={o}
        >
          <Text
            style={{
              fontSize: 11,
              color: value === o ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
  colors,
  t: tFn,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ThemeColorPalette;
  t: (key: string) => string;
}) {
  return (
    <Field t={tFn} label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          onPress={() => onChange(true)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: value ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: value ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={tFn('common.yes')}
        >
          <Text
            style={{
              fontSize: 11,
              color: value ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {tFn('common.yes')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: !value ? colors.primary : colors.background,
            borderWidth: 1,
            borderColor: !value ? colors.primary : colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel={tFn('common.no')}
        >
          <Text
            style={{
              fontSize: 11,
              color: !value ? colors['text-inverse'] : colors.foreground,
              fontWeight: '500',
            }}
          >
            {tFn('common.no')}
          </Text>
        </Pressable>
      </View>
    </Field>
  );
}

// ── Form renderer ──────────────────────────────────────────────────────────

function renderForm<T extends BlockType>(
  blockType: T,
  data: BlockDataByType[T],
  upd: TypedUpdater<T>,
  colors: ThemeColorPalette,
  missingFields: Set<string>,
  t: (key: string, params?: Record<string, string | number>) => string,
  openPicker?: (
    category: AssetCategory,
    current: string | null,
    onChange: (id: string) => void,
  ) => void,
  assetField?: (
    label: string,
    category: AssetCategory,
    value: string | null,
    onChange: (v: string) => void,
  ) => React.ReactNode,
) {
  switch (blockType) {
    case 'background': {
      const d = data as BackgroundBlockData;
      const u = upd as TypedUpdater<'background'>;
      return (
        <>
          {assetField
            ? assetField(t('editor.properties.asset'), 'backgrounds', d.assetId, (v) =>
              u('assetId', v),
            )
            : (
              <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
                <TextInput
                  value={d.assetId || ''}
                  onChangeText={(v) => u('assetId', v)}
                  placeholder={t('editor.properties.selectBackground')}
                  placeholderTextColor={colors.muted}
                  style={S(colors, missingFields.has('Asset'))}
                />
              </Field>
            )}
          <Field t={t} label={t('editor.properties.transition')} colors={colors}>
            <OptBtns
              options={['fade', 'dissolve', 'instant', 'wipe']}
              value={d.transition}
              onChange={(v) => u('transition', v as BackgroundBlockData['transition'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.durationMs')} colors={colors}>
            <TextInput
              value={String(d.duration || 500)}
              onChangeText={(v) => u('duration', parseInt(v) || 500)}
              placeholder="500"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'character': {
      const d = data as CharacterBlockData;
      const u = upd as TypedUpdater<'character'>;
      return (
        <>
          {assetField
            ? assetField(t('editor.properties.character'), 'characters', d.characterId, (v) =>
              u('characterId', v),
            )
            : (
              <Field t={t} label={t('editor.properties.character')} colors={colors} error={missingFields.has('Character')}>
                <TextInput
                  value={d.characterId || ''}
                  onChangeText={(v) => u('characterId', v)}
                  placeholder={t('editor.properties.selectCharacter')}
                  placeholderTextColor={colors.muted}
                  style={S(colors, missingFields.has('Character'))}
                />
              </Field>
            )}
          {assetField
            ? assetField(t('editor.properties.sprite'), 'sprites', d.spriteId, (v) =>
              u('spriteId', v),
            )
            : (
              <Field t={t} label={t('editor.properties.sprite')} colors={colors}>
                <TextInput
                  value={d.spriteId || ''}
                  onChangeText={(v) => u('spriteId', v)}
                  placeholder={t('editor.properties.selectSprite')}
                  placeholderTextColor={colors.muted}
                  style={S(colors)}
                />
              </Field>
            )}
          <Field t={t} label={t('editor.properties.position')} colors={colors}>
            <OptBtns
              options={['far-left', 'left', 'center', 'right', 'far-right']}
              value={d.position}
              onChange={(v) => u('position', v as CharacterBlockData['position'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.entrance')} colors={colors}>
            <OptBtns
              options={['instant', 'fade', 'slide-left', 'slide-right', 'zoom']}
              value={d.transition}
              onChange={(v) => u('transition', v as CharacterBlockData['transition'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.delaySeconds')} colors={colors}>
            <TextInput
              value={String(d.delay || 0)}
              onChangeText={(v) => u('delay', parseFloat(v) || 0)}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
            <TextInput
              value={d.duration ? String(d.duration) : ''}
              onChangeText={(v) => u('duration', v ? parseFloat(v) : null)}
              placeholder={t('editor.properties.emptyPermanent')}
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'text': {
      const d = data as TextBlockData;
      const u = upd as TypedUpdater<'text'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.content')} colors={colors} error={missingFields.has('Content')}>
            <TextInput
              value={d.content || ''}
              onChangeText={(v) => u('content', v)}
              placeholder={t('editor.properties.enterNarration')}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[S(colors, missingFields.has('Content')), { minHeight: 80, textAlignVertical: 'top' }]}
            />
          </Field>
          <Field t={t} label={t('editor.properties.anchorTo')} colors={colors}>
            <OptBtns
              options={['background', 'character']}
              value={d.anchorTo}
              onChange={(v) => u('anchorTo', v as TextBlockData['anchorTo'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.typewriterSpeed')} colors={colors}>
            <TextInput
              value={String(d.typewriterSpeed || 0.5)}
              onChangeText={(v) => u('typewriterSpeed', parseFloat(v) || 0.5)}
              placeholder="0.5"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'dialogue': {
      const d = data as DialogueBlockData;
      const u = upd as TypedUpdater<'dialogue'>;
      return (
        <>
          {d.entries?.map((entry, i: number) => (
            <View
              key={entry.id || i}
              style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: colors.muted,
                  marginBottom: 6,
                }}
              >
                {t('editor.properties.speaker', { number: i + 1 })}
              </Text>
              {assetField
                ? assetField(t('editor.properties.character'), 'characters', entry.characterId, (v) => {
                  const e = [...d.entries];
                  e[i] = { ...entry, characterId: v };
                  u('entries', e);
                })
                : (
                  <Field t={t} label={t('editor.properties.character')} colors={colors}>
                    <TextInput
                      value={entry.characterId || ''}
                      onChangeText={(v) => {
                        const e = [...d.entries];
                        e[i] = { ...entry, characterId: v };
                        u('entries', e);
                      }}
                      placeholder={t('editor.properties.selectCharacter')}
                      placeholderTextColor={colors.muted}
                      style={S(colors)}
                    />
                  </Field>
                )}
              <Field t={t} label={t('editor.properties.text')} colors={colors}>
                <TextInput
                  value={entry.text || ''}
                  onChangeText={(v) => {
                    const e = [...d.entries];
                    e[i] = { ...entry, text: v };
                    u('entries', e);
                  }}
                  placeholder={t('editor.properties.enterDialogue')}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[S(colors), { minHeight: 60, textAlignVertical: 'top' }]}
                />
              </Field>
            </View>
          ))}
          <Pressable
            onPress={() =>
              u('entries', [
                ...(d.entries || []),
                { id: `e_${Date.now()}`, characterId: '', spriteId: '', text: '' },
              ])
            }
            style={{
              paddingVertical: 8,
              alignItems: 'center',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: 'dashed',
            }}
            accessibilityRole="button"
            accessibilityLabel={t('editor.dialogueText')}
          >
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
              {t('editor.properties.addSpeaker')}
            </Text>
          </Pressable>
        </>
      );
    }

    case 'choice': {
      const d = data as ChoiceBlockData;
      const u = upd as TypedUpdater<'choice'>;
      return (
        <>
          {d.options?.map((opt, i: number) => (
            <View
              key={opt.id || i}
              style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  color: colors.muted,
                  marginBottom: 6,
                }}
              >
                {t('editor.properties.choice', { number: i + 1 })}
              </Text>
              <Field t={t} label={t('editor.properties.text')} colors={colors}>
                <TextInput
                  value={opt.text || ''}
                  onChangeText={(v) => {
                    const o = [...d.options];
                    o[i] = { ...opt, text: v };
                    u('options', o);
                  }}
                  placeholder={t('editor.properties.enterChoice')}
                  placeholderTextColor={colors.muted}
                  style={S(colors)}
                />
              </Field>
              <Field t={t} label={t('editor.properties.targetScene')} colors={colors}>
                <TextInput
                  value={opt.targetSceneId || ''}
                  onChangeText={(v) => {
                    const o = [...d.options];
                    o[i] = { ...opt, targetSceneId: v || null };
                    u('options', o);
                  }}
                  placeholder={t('editor.properties.emptyEnd')}
                  placeholderTextColor={colors.muted}
                  style={S(colors)}
                />
              </Field>
            </View>
          ))}
          {(d.options?.length || 0) < 20 && (
            <Pressable
              onPress={() =>
                u('options', [
                  ...(d.options || []),
                  { id: `c_${Date.now()}`, text: '', targetSceneId: null },
                ])
              }
              style={{
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: 'dashed',
              }}
              accessibilityRole="button"
              accessibilityLabel={t('editor.addChoice')}
            >
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
                {t('editor.properties.addChoice')}
              </Text>
            </Pressable>
          )}
        </>
      );
    }

    case 'effect': {
      const d = data as EffectBlockData;
      const u = upd as TypedUpdater<'effect'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.effectType')} colors={colors}>
            <OptBtns
              options={['shake', 'flash', 'blur', 'rain', 'snow', 'glitch', 'vignette']}
              value={d.effectType}
              onChange={(v) => u('effectType', v as EffectBlockData['effectType'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.target')} colors={colors}>
            <OptBtns
              options={['screen', 'character', 'background']}
              value={d.target}
              onChange={(v) => u('target', v as EffectBlockData['target'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.intensity')} colors={colors}>
            <TextInput
              value={String(d.intensity || 50)}
              onChangeText={(v) => u('intensity', parseInt(v) || 50)}
              placeholder="50"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
            <TextInput
              value={String(d.duration || 0.5)}
              onChangeText={(v) => u('duration', parseFloat(v) || 0.5)}
              placeholder="0.5"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'music': {
      const d = data as MusicBlockData;
      const u = upd as TypedUpdater<'music'>;
      return (
        <>
          {assetField
            ? assetField(t('editor.properties.asset'), 'music', d.assetId, (v) => u('assetId', v))
            : (
              <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
                <TextInput
                  value={d.assetId || ''}
                  onChangeText={(v) => u('assetId', v)}
                  placeholder={t('editor.properties.selectMusic')}
                  placeholderTextColor={colors.muted}
                  style={S(colors, missingFields.has('Asset'))}
                />
              </Field>
            )}
          <Field t={t} label={t('editor.properties.action')} colors={colors}>
            <OptBtns
              options={['play', 'stop', 'pause', 'fade']}
              value={d.action}
              onChange={(v) => u('action', v as MusicBlockData['action'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.volume')} colors={colors}>
            <TextInput
              value={String(Math.round((d.volume || 0.8) * 100))}
              onChangeText={(v) => u('volume', (parseInt(v) || 80) / 100)}
              placeholder="80"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Toggle t={t} label={t('editor.properties.loop')} value={!!d.loop} onChange={(v) => u('loop', v)} colors={colors} />
          <Field t={t} label={t('editor.properties.fadeDuration')} colors={colors}>
            <TextInput
              value={String(d.fadeDuration || 1000)}
              onChangeText={(v) => u('fadeDuration', parseInt(v) || 1000)}
              placeholder="1000"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'sound': {
      const d = data as SoundBlockData;
      const u = upd as TypedUpdater<'sound'>;
      return (
        <>
          {assetField
            ? assetField(t('editor.properties.asset'), 'sfx', d.assetId, (v) => u('assetId', v))
            : (
              <Field t={t} label={t('editor.properties.asset')} colors={colors} error={missingFields.has('Asset')}>
                <TextInput
                  value={d.assetId || ''}
                  onChangeText={(v) => u('assetId', v)}
                  placeholder={t('editor.properties.selectSound')}
                  placeholderTextColor={colors.muted}
                  style={S(colors, missingFields.has('Asset'))}
                />
              </Field>
            )}
          <Field t={t} label={t('editor.properties.action')} colors={colors}>
            <OptBtns
              options={['play', 'stop']}
              value={d.action}
              onChange={(v) => u('action', v as SoundBlockData['action'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.volume')} colors={colors}>
            <TextInput
              value={String(Math.round((d.volume || 0.8) * 100))}
              onChangeText={(v) => u('volume', (parseInt(v) || 80) / 100)}
              placeholder="80"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Toggle t={t} label={t('editor.properties.loop')} value={!!d.loop} onChange={(v) => u('loop', v)} colors={colors} />
          <Field t={t} label={t('editor.properties.pitchVariation')} colors={colors}>
            <TextInput
              value={String(Math.round((d.pitchVariation || 0) * 100))}
              onChangeText={(v) => u('pitchVariation', (parseInt(v) || 0) / 100)}
              placeholder="0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'interactive_object': {
      const d = data as InteractiveObjectBlockData;
      const u = upd as TypedUpdater<'interactive_object'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.objectName')} colors={colors} error={missingFields.has('Object Name')}>
            <TextInput
              value={d.name || ''}
              onChangeText={(v) => u('name', v)}
              placeholder={t('editor.properties.enterObjectName')}
              placeholderTextColor={colors.muted}
              style={S(colors, missingFields.has('Object Name'))}
            />
          </Field>
          <Field t={t} label={t('editor.properties.sprite')} colors={colors}>
            <TextInput
              value={d.assetId || ''}
              onChangeText={(v) => u('assetId', v)}
              placeholder={t('editor.properties.selectSprite')}
              placeholderTextColor={colors.muted}
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.positionX')} colors={colors}>
            <TextInput
              value={String(d.position?.x ?? 50)}
              onChangeText={(v) =>
                u('position', { ...(d.position || {}), x: parseInt(v) || 0 })
              }
              placeholder="50"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.positionY')} colors={colors}>
            <TextInput
              value={String(d.position?.y ?? 50)}
              onChangeText={(v) =>
                u('position', { ...(d.position || {}), y: parseInt(v) || 0 })
              }
              placeholder="50"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.width')} colors={colors}>
            <TextInput
              value={String(d.position?.width ?? 10)}
              onChangeText={(v) =>
                u('position', { ...(d.position || {}), width: parseInt(v) || 10 })
              }
              placeholder="10"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.height')} colors={colors}>
            <TextInput
              value={String(d.position?.height ?? 10)}
              onChangeText={(v) =>
                u('position', { ...(d.position || {}), height: parseInt(v) || 10 })
              }
              placeholder="10"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Toggle t={t} label={t('editor.properties.pulseAnimation')} value={!!d.pulseAnimation} onChange={(v) => u('pulseAnimation', v)} colors={colors} />
          <Toggle t={t} label={t('editor.properties.oneTimeOnly')} value={!!d.oneTimeOnly} onChange={(v) => u('oneTimeOnly', v)} colors={colors} />
        </>
      );
    }

    case 'camera': {
      const d = data as CameraBlockData;
      const u = upd as TypedUpdater<'camera'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.action')} colors={colors}>
            <OptBtns
              options={['zoom', 'pan', 'focus', 'reset']}
              value={d.action}
              onChange={(v) => u('action', v as CameraBlockData['action'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.zoomLevel')} colors={colors}>
            <TextInput
              value={String(d.zoomLevel || 1.0)}
              onChangeText={(v) => u('zoomLevel', parseFloat(v) || 1.0)}
              placeholder="1.0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
            <TextInput
              value={String(d.duration || 1.0)}
              onChangeText={(v) => u('duration', parseFloat(v) || 1.0)}
              placeholder="1.0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    case 'variable': {
      const d = data as VariableBlockData;
      const u = upd as TypedUpdater<'variable'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.variableName')} colors={colors} error={missingFields.has('Variable Name')}>
            <TextInput
              value={d.variableName || ''}
              onChangeText={(v) => u('variableName', v)}
              placeholder={t('editor.properties.enterVariableName')}
              placeholderTextColor={colors.muted}
              style={S(colors, missingFields.has('Variable Name'))}
            />
          </Field>
          <Field t={t} label={t('editor.properties.operation')} colors={colors}>
            <OptBtns
              options={['set', 'add', 'subtract', 'multiply', 'toggle']}
              value={d.operation}
              onChange={(v) => u('operation', v as VariableBlockData['operation'])}
              colors={colors}
            />
          </Field>
          {d.operation === 'toggle' ? (
            <Toggle
              t={t}
              label={t('editor.properties.value')}
              value={d.value === true || d.value === 'true'}
              onChange={(v) => u('value', v)}
              colors={colors}
            />
          ) : (
            <Field t={t} label={t('editor.properties.value')} colors={colors}>
              <TextInput
                value={String(d.value ?? '')}
                onChangeText={(v) => u('value', v === '' ? v : isNaN(Number(v)) ? v : Number(v))}
                placeholder={t('editor.properties.enterValue')}
                placeholderTextColor={colors.muted}
                style={S(colors)}
              />
            </Field>
          )}
        </>
      );
    }

    case 'transition': {
      const d = data as TransitionBlockData;
      const u = upd as TypedUpdater<'transition'>;
      return (
        <>
          <Field t={t} label={t('editor.properties.targetScene')} colors={colors}>
            <TextInput
              value={d.targetSceneId || ''}
              onChangeText={(v) => u('targetSceneId', v || null)}
              placeholder={t('editor.properties.selectTargetScene')}
              placeholderTextColor={colors.muted}
              style={S(colors)}
            />
          </Field>
          <Field t={t} label={t('editor.properties.transitionType')} colors={colors}>
            <OptBtns
              options={['fade', 'dissolve', 'slide-left', 'slide-right', 'slide-up', 'wipe']}
              value={d.transitionType}
              onChange={(v) => u('transitionType', v as TransitionBlockData['transitionType'])}
              colors={colors}
            />
          </Field>
          <Field t={t} label={t('editor.properties.durationSeconds')} colors={colors}>
            <TextInput
              value={String(d.duration || 1.0)}
              onChangeText={(v) => u('duration', parseFloat(v) || 1.0)}
              placeholder="1.0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={S(colors)}
            />
          </Field>
        </>
      );
    }

    default: {
      const _exhaustive: never = blockType;
      return (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
            {t('editor.properties.notImplemented', { type: String(_exhaustive) })}
          </Text>
        </View>
      );
    }
  }
}
