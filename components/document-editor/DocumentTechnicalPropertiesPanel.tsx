import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { AssetPicker, type AssetCategory } from '@/components/editor/modals/AssetPicker';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type {
  BackgroundBlockData,
  CameraBlockData,
  Condition,
  CharacterBlockData,
  EffectBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SoundBlockData,
  TimelineStep,
  TransitionBlockData,
  VariableBlockData,
} from '@/lib/engine/types';
import type { InteractiveAction } from '@/lib/interactive-types';
import type { DocumentTechnicalBlock } from '@/lib/document-editor/types';

interface DocumentTechnicalPropertiesPanelProps {
  block: DocumentTechnicalBlock | null;
  isPhone: boolean;
  onClose: () => void;
  onChange: (block: DocumentTechnicalBlock) => void;
  onRemoveBlock?: () => void;
  onEmptyBackspace: (id: string, onDoubleBackspace: () => void) => void;
}

function updateStepData<T>(block: DocumentTechnicalBlock, data: T): DocumentTechnicalBlock {
  return {
    ...block,
    step: {
      ...block.step,
      data: data as TimelineStep['data'],
    },
  };
}

function updateConditions(block: DocumentTechnicalBlock, conditions: Condition[] | undefined): DocumentTechnicalBlock {
  return {
    ...block,
    step: {
      ...block.step,
      conditions,
    },
  };
}

function fieldStyle(colors: ReturnType<typeof useColors>) {
  return {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: 8,
    color: colors.foreground,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 10,
    fontSize: 14,
  };
}

function parseNumericField(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function DocumentTechnicalPropertiesPanel({
  block,
  isPhone,
  onClose,
  onChange,
  onRemoveBlock,
  onEmptyBackspace,
}: DocumentTechnicalPropertiesPanelProps) {
  const colors = useColors();
  const { t } = useI18n();
  const [assetPicker, setAssetPicker] = useState<{
    category: AssetCategory;
    onSelect: (assetId: string) => void;
  } | null>(null);
  if (!block) return null;

  const renderAssetField = (
    category: AssetCategory,
    value: string | null | undefined,
    onSelect: (assetId: string) => void,
    placeholder: string,
  ) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
        {placeholder}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={[fieldStyle(colors), { flex: 1, marginBottom: 0 }]}>
          <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 14 }} numberOfLines={1}>
            {value || placeholder}
          </Text>
        </View>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => setAssetPicker({ category, onSelect })}
        >
          {t('common.select')}
        </Button>
      </View>
    </View>
  );

  const renderBooleanField = (
    label: string,
    value: boolean,
    onSelect: (value: boolean) => void,
  ) => (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant={value ? 'primary' : 'secondary'} size="sm" onPress={() => onSelect(true)}>
          true
        </Button>
        <Button variant={!value ? 'primary' : 'secondary'} size="sm" onPress={() => onSelect(false)}>
          false
        </Button>
      </View>
    </View>
  );

  const renderConditionFields = () => {
    const condition = block.step.conditions?.[0];
    const setCondition = (next: Partial<Condition>) => {
      const base: Condition = condition ?? { variableName: '', operator: '==', value: true };
      const merged = { ...base, ...next };
      const hasAnyValue = merged.variableName.trim() || String(merged.value ?? '').trim();
      onChange(updateConditions(block, hasAnyValue ? [merged] : undefined));
    };

    return (
      <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>
          {t('editor.properties.conditions', undefined, 'Conditions')}
        </Text>
        <TextInput
          value={condition?.variableName ?? ''}
          onChangeText={(variableName) => setCondition({ variableName })}
          placeholder={t('editor.properties.variableName')}
          placeholderTextColor={colors.muted}
          style={fieldStyle(colors)}
        />
        <TextInput
          value={condition?.operator ?? '=='}
          onChangeText={(operator) => setCondition({ operator: operator as Condition['operator'] })}
          placeholder={t('editor.properties.operation')}
          placeholderTextColor={colors.muted}
          style={fieldStyle(colors)}
        />
        <TextInput
          value={condition ? String(condition.value ?? '') : ''}
          onChangeText={(value) => setCondition({ value: value === '' ? '' : isNaN(Number(value)) ? value : Number(value) })}
          placeholder={t('editor.properties.value')}
          placeholderTextColor={colors.muted}
          style={fieldStyle(colors)}
        />
      </View>
    );
  };

  const renderFields = () => {
    if (block.blockType === 'background') {
      const data = block.step.data as BackgroundBlockData;
      return (
        <>
          {renderAssetField('backgrounds', data.assetId, (assetId) => onChange(updateStepData(block, { ...data, assetId })), t('document.placeholder.assetId'))}
          <TextInput
            value={data.transition}
            onChangeText={(transition) => onChange(updateStepData(block, { ...data, transition: transition as BackgroundBlockData['transition'] }))}
            placeholder={t('document.placeholder.transition')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'character') {
      const data = block.step.data as CharacterBlockData;
      return (
        <>
          <TextInput
            value={data.characterId}
            onChangeText={(characterId) => onChange(updateStepData(block, { ...data, characterId }))}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== 'Backspace' || data.characterId.length > 0 || !onRemoveBlock) return;
              onEmptyBackspace(`technical-field:${block.id}:characterId`, onRemoveBlock);
            }}
            placeholder={t('document.placeholder.characterId')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          {renderAssetField('sprites', data.spriteId, (spriteId) => onChange(updateStepData(block, { ...data, spriteId })), t('document.placeholder.sprite'))}
          <TextInput
            value={data.position}
            onChangeText={(position) => onChange(updateStepData(block, { ...data, position: position as CharacterBlockData['position'] }))}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== 'Backspace' || data.position.length > 0 || !onRemoveBlock) return;
              onEmptyBackspace(`technical-field:${block.id}:position`, onRemoveBlock);
            }}
            placeholder={t('document.placeholder.position')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'music') {
      const data = block.step.data as MusicBlockData;
      return (
        <>
          {renderAssetField('music', data.assetId, (assetId) => onChange(updateStepData(block, { ...data, assetId })), t('document.placeholder.music'))}
          <TextInput
            value={data.action}
            onChangeText={(action) => onChange(updateStepData(block, { ...data, action: action as MusicBlockData['action'] }))}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(Math.round((data.volume ?? 0.8) * 100))}
            onChangeText={(volume) => onChange(updateStepData(block, { ...data, volume: parseNumericField(volume, 80) / 100 }))}
            placeholder={t('editor.properties.volume')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          {renderBooleanField(t('editor.properties.loop', undefined, 'Loop'), data.loop, (loop) => onChange(updateStepData(block, { ...data, loop })))}
          <TextInput
            value={String(data.fadeDuration ?? 0)}
            onChangeText={(fadeDuration) => onChange(updateStepData(block, { ...data, fadeDuration: parseNumericField(fadeDuration, 0) }))}
            placeholder={t('editor.properties.fadeDuration', undefined, 'Fade duration')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'sound') {
      const data = block.step.data as SoundBlockData;
      return (
        <>
          {renderAssetField('sfx', data.assetId, (assetId) => onChange(updateStepData(block, { ...data, assetId })), t('editor.properties.selectSound'))}
          <TextInput
            value={data.action}
            onChangeText={(action) => onChange(updateStepData(block, { ...data, action: action as SoundBlockData['action'] }))}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(Math.round((data.volume ?? 0.8) * 100))}
            onChangeText={(volume) => onChange(updateStepData(block, { ...data, volume: parseNumericField(volume, 80) / 100 }))}
            placeholder={t('editor.properties.volume')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          {renderBooleanField(t('editor.properties.loop', undefined, 'Loop'), data.loop, (loop) => onChange(updateStepData(block, { ...data, loop })))}
          <TextInput
            value={String(data.pitchVariation ?? 0)}
            onChangeText={(pitchVariation) => onChange(updateStepData(block, { ...data, pitchVariation: parseNumericField(pitchVariation, 0) }))}
            placeholder={t('editor.properties.pitchVariation', undefined, 'Pitch variation')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'transition') {
      const data = block.step.data as TransitionBlockData;
      return (
        <>
          <TextInput
            value={data.targetSceneId ?? ''}
            onChangeText={(targetSceneId) => onChange(updateStepData(block, { ...data, targetSceneId: targetSceneId || null }))}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== 'Backspace' || (data.targetSceneId ?? '').length > 0 || !onRemoveBlock) return;
              onEmptyBackspace(`technical-field:${block.id}:targetSceneId`, onRemoveBlock);
            }}
            placeholder={t('document.placeholder.targetScene')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.transitionType}
            onChangeText={(transitionType) => onChange(updateStepData(block, { ...data, transitionType: transitionType as TransitionBlockData['transitionType'] }))}
            placeholder={t('editor.properties.transitionType')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'variable') {
      const data = block.step.data as VariableBlockData;
      return (
        <>
          <TextInput
            value={data.variableName}
            onChangeText={(variableName) => onChange(updateStepData(block, { ...data, variableName }))}
            placeholder={t('editor.properties.variableName')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.operation}
            onChangeText={(operation) => onChange(updateStepData(block, { ...data, operation: operation as VariableBlockData['operation'] }))}
            placeholder={t('editor.properties.operation')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.value ?? '')}
            onChangeText={(value) => onChange(updateStepData(block, { ...data, value: value === '' ? value : isNaN(Number(value)) ? value : Number(value) }))}
            placeholder={t('editor.properties.value')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'effect') {
      const data = block.step.data as EffectBlockData;
      return (
        <>
          <TextInput
            value={data.effectType}
            onChangeText={(effectType) => onChange(updateStepData(block, { ...data, effectType: effectType as EffectBlockData['effectType'] }))}
            placeholder={t('editor.properties.effectType')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.target}
            onChangeText={(target) => onChange(updateStepData(block, { ...data, target: target as EffectBlockData['target'] }))}
            placeholder={t('editor.properties.target')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.intensity ?? 50)}
            onChangeText={(intensity) => onChange(updateStepData(block, { ...data, intensity: parseNumericField(intensity, 50) }))}
            placeholder={t('editor.properties.intensity')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.characterId ?? ''}
            onChangeText={(characterId) => onChange(updateStepData(block, { ...data, characterId: characterId || undefined }))}
            placeholder={t('document.placeholder.characterId')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.duration ?? 0.5)}
            onChangeText={(duration) => onChange(updateStepData(block, { ...data, duration: parseNumericField(duration, 0.5) }))}
            placeholder={t('editor.properties.durationSeconds')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'camera') {
      const data = block.step.data as CameraBlockData;
      return (
        <>
          <TextInput
            value={data.action}
            onChangeText={(action) => onChange(updateStepData(block, { ...data, action: action as CameraBlockData['action'] }))}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.zoomLevel ?? 1)}
            onChangeText={(zoomLevel) => onChange(updateStepData(block, { ...data, zoomLevel: parseNumericField(zoomLevel, 1) }))}
            placeholder={t('editor.properties.zoomLevel')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.panX ?? 0)}
            onChangeText={(panX) => onChange(updateStepData(block, { ...data, panX: parseNumericField(panX, 0) }))}
            placeholder={t('editor.properties.positionX')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.panY ?? 0)}
            onChangeText={(panY) => onChange(updateStepData(block, { ...data, panY: parseNumericField(panY, 0) }))}
            placeholder={t('editor.properties.positionY')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.target ?? ''}
            onChangeText={(target) => onChange(updateStepData(block, { ...data, target: target || undefined }))}
            placeholder={t('editor.properties.target')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.duration ?? 1)}
            onChangeText={(duration) => onChange(updateStepData(block, { ...data, duration: parseNumericField(duration, 1) }))}
            placeholder={t('editor.properties.durationSeconds')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.easing}
            onChangeText={(easing) => onChange(updateStepData(block, { ...data, easing: easing as CameraBlockData['easing'] }))}
            placeholder={t('editor.properties.easing', undefined, 'Easing')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'interactive_object') {
      const data = block.step.data as InteractiveObjectBlockData;
      const firstAction = data.actions[0];
      const actionType = firstAction?.type ?? 'dialogue';
      const updateFirstAction = (next: Partial<InteractiveAction> & { type?: InteractiveAction['type'] }) => {
        const base: InteractiveAction =
          actionType === 'scene_transition'
            ? { type: 'scene_transition', targetSceneId: '' }
            : actionType === 'play_audio'
              ? { type: 'play_audio', audioUri: '', volume: 1, loop: false }
              : actionType === 'show_image'
                ? { type: 'show_image', imageUri: '' }
                : actionType === 'trigger_event'
                  ? { type: 'trigger_event', eventId: '' }
                  : { type: 'dialogue', text: '' };
        const updated = { ...base, ...(firstAction ?? {}), ...next } as InteractiveAction;
        onChange(updateStepData(block, { ...data, actions: [updated, ...data.actions.slice(1)] }));
      };

      return (
        <>
          <TextInput
            value={data.name}
            onChangeText={(name) => onChange(updateStepData(block, { ...data, name }))}
            placeholder={t('editor.properties.objectName')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          {renderAssetField('sprites', data.assetId, (assetId) => onChange(updateStepData(block, { ...data, assetId })), t('editor.properties.sprite'))}
          <TextInput
            value={String(data.position?.x ?? 50)}
            onChangeText={(x) => onChange(updateStepData(block, { ...data, position: { ...data.position, x: parseNumericField(x, 0) } }))}
            placeholder={t('editor.properties.positionX')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.position?.y ?? 50)}
            onChangeText={(y) => onChange(updateStepData(block, { ...data, position: { ...data.position, y: parseNumericField(y, 0) } }))}
            placeholder={t('editor.properties.positionY')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.position?.width ?? 10)}
            onChangeText={(width) => onChange(updateStepData(block, { ...data, position: { ...data.position, width: parseNumericField(width, 10) } }))}
            placeholder={t('editor.properties.width', undefined, 'Width')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.position?.height ?? 10)}
            onChangeText={(height) => onChange(updateStepData(block, { ...data, position: { ...data.position, height: parseNumericField(height, 10) } }))}
            placeholder={t('editor.properties.height', undefined, 'Height')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          {renderBooleanField(t('editor.properties.oneTimeOnly', undefined, 'One time only'), data.oneTimeOnly, (oneTimeOnly) => onChange(updateStepData(block, { ...data, oneTimeOnly })))}
          {renderBooleanField(t('editor.properties.pulseAnimation', undefined, 'Pulse animation'), data.pulseAnimation, (pulseAnimation) => onChange(updateStepData(block, { ...data, pulseAnimation })))}
          <TextInput
            value={actionType}
            onChangeText={(type) => updateFirstAction({ type: type as InteractiveAction['type'] })}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          {actionType === 'dialogue' ? (
            <>
              <TextInput
                value={firstAction?.type === 'dialogue' ? firstAction.text : ''}
                onChangeText={(text) => updateFirstAction({ type: 'dialogue', text })}
                placeholder={t('document.dialogue.placeholder', undefined, 'Dialogue text')}
                placeholderTextColor={colors.muted}
                style={fieldStyle(colors)}
              />
              <TextInput
                value={firstAction?.type === 'dialogue' ? firstAction.speaker ?? '' : ''}
                onChangeText={(speaker) => updateFirstAction({ type: 'dialogue', speaker: speaker || undefined })}
                placeholder={t('document.dialogue.characterLabel', undefined, 'Speaker')}
                placeholderTextColor={colors.muted}
                style={fieldStyle(colors)}
              />
            </>
          ) : null}
          {actionType === 'scene_transition' ? (
            <TextInput
              value={firstAction?.type === 'scene_transition' ? firstAction.targetSceneId : ''}
              onChangeText={(targetSceneId) => updateFirstAction({ type: 'scene_transition', targetSceneId })}
              placeholder={t('document.placeholder.targetScene')}
              placeholderTextColor={colors.muted}
              style={fieldStyle(colors)}
            />
          ) : null}
          {actionType === 'play_audio' ? (
            <>
              {renderAssetField('sfx', firstAction?.type === 'play_audio' ? firstAction.audioUri : '', (audioUri) => updateFirstAction({ type: 'play_audio', audioUri }), t('editor.properties.selectSound'))}
              <TextInput
                value={String(firstAction?.type === 'play_audio' ? firstAction.volume ?? 1 : 1)}
                onChangeText={(volume) => updateFirstAction({ type: 'play_audio', volume: parseNumericField(volume, 1) })}
                placeholder={t('editor.properties.volume')}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={fieldStyle(colors)}
              />
              {renderBooleanField(t('editor.properties.loop', undefined, 'Loop'), firstAction?.type === 'play_audio' ? !!firstAction.loop : false, (loop) => updateFirstAction({ type: 'play_audio', loop }))}
            </>
          ) : null}
          {actionType === 'show_image' ? (
            <>
              {renderAssetField('sprites', firstAction?.type === 'show_image' ? firstAction.imageUri : '', (imageUri) => updateFirstAction({ type: 'show_image', imageUri }), t('editor.properties.sprite'))}
              <TextInput
                value={String(firstAction?.type === 'show_image' ? firstAction.duration ?? 0 : 0)}
                onChangeText={(duration) => updateFirstAction({ type: 'show_image', duration: parseNumericField(duration, 0) })}
                placeholder={t('editor.properties.duration')}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={fieldStyle(colors)}
              />
            </>
          ) : null}
          {actionType === 'trigger_event' ? (
            <TextInput
              value={firstAction?.type === 'trigger_event' ? firstAction.eventId : ''}
              onChangeText={(eventId) => updateFirstAction({ type: 'trigger_event', eventId })}
              placeholder={t('editor.properties.eventId', undefined, 'Event ID')}
              placeholderTextColor={colors.muted}
              style={fieldStyle(colors)}
            />
          ) : null}
        </>
      );
    }

    return <Text style={{ color: colors.muted }}>{t('document.settingsComingSoon')}</Text>;
  };

  const panel = (
    <View
      style={{
        width: isPhone ? '100%' : 300,
        maxHeight: isPhone ? 420 : undefined,
        borderLeftWidth: isPhone ? 0 : 1,
        borderTopWidth: isPhone ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{t('document.settings')}</Text>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800', marginTop: 4 }}>{block.label}</Text>
        </View>
        <Button variant="ghost" size="sm" onPress={onClose}>{t('common.close')}</Button>
      </View>
      {renderFields()}
      {renderConditionFields()}
      <AssetPicker
        visible={!!assetPicker}
        category={assetPicker?.category}
        onClose={() => setAssetPicker(null)}
        onSelect={(assetId) => {
          assetPicker?.onSelect(assetId);
          setAssetPicker(null);
        }}
      />
    </View>
  );

  if (isPhone) {
    return (
      <Modal transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }} onPress={onClose}>
          <Pressable onPress={(event) => event.stopPropagation()}>{panel}</Pressable>
        </Pressable>
      </Modal>
    );
  }

  return panel;
}
