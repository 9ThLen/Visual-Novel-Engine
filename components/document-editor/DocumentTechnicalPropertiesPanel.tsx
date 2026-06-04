import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import type {
  BackgroundBlockData,
  CameraBlockData,
  CharacterBlockData,
  EffectBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SoundBlockData,
  TimelineStep,
  TransitionBlockData,
  VariableBlockData,
} from '@/lib/engine/types';
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
  if (!block) return null;

  const renderFields = () => {
    if (block.blockType === 'background') {
      const data = block.step.data as BackgroundBlockData;
      return (
        <>
          <TextInput
            value={data.assetId ?? ''}
            onChangeText={(assetId) => onChange(updateStepData(block, { ...data, assetId: assetId || null }))}
            placeholder={t('document.placeholder.assetId')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
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
          <TextInput
            value={data.spriteId}
            onChangeText={(spriteId) => onChange(updateStepData(block, { ...data, spriteId }))}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== 'Backspace' || data.spriteId.length > 0 || !onRemoveBlock) return;
              onEmptyBackspace(`technical-field:${block.id}:spriteId`, onRemoveBlock);
            }}
            placeholder={t('document.placeholder.sprite')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
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
          <TextInput
            value={data.assetId ?? ''}
            onChangeText={(assetId) => onChange(updateStepData(block, { ...data, assetId: assetId || null }))}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== 'Backspace' || (data.assetId ?? '').length > 0 || !onRemoveBlock) return;
              onEmptyBackspace(`technical-field:${block.id}:assetId`, onRemoveBlock);
            }}
            placeholder={t('document.placeholder.music')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.action}
            onChangeText={(action) => onChange(updateStepData(block, { ...data, action: action as MusicBlockData['action'] }))}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(Math.round((data.volume ?? 0.8) * 100))}
            onChangeText={(volume) => onChange(updateStepData(block, { ...data, volume: (Number(volume) || 80) / 100 }))}
            placeholder={t('editor.properties.volume')}
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
          <TextInput
            value={data.assetId ?? ''}
            onChangeText={(assetId) => onChange(updateStepData(block, { ...data, assetId: assetId || null }))}
            placeholder={t('editor.properties.selectSound')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.action}
            onChangeText={(action) => onChange(updateStepData(block, { ...data, action: action as SoundBlockData['action'] }))}
            placeholder={t('editor.properties.action')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(Math.round((data.volume ?? 0.8) * 100))}
            onChangeText={(volume) => onChange(updateStepData(block, { ...data, volume: (Number(volume) || 80) / 100 }))}
            placeholder={t('editor.properties.volume')}
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
            onChangeText={(intensity) => onChange(updateStepData(block, { ...data, intensity: Number(intensity) || 50 }))}
            placeholder={t('editor.properties.intensity')}
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
            onChangeText={(zoomLevel) => onChange(updateStepData(block, { ...data, zoomLevel: Number(zoomLevel) || 1 }))}
            placeholder={t('editor.properties.zoomLevel')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.duration ?? 1)}
            onChangeText={(duration) => onChange(updateStepData(block, { ...data, duration: Number(duration) || 1 }))}
            placeholder={t('editor.properties.durationSeconds')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
        </>
      );
    }

    if (block.blockType === 'interactive_object') {
      const data = block.step.data as InteractiveObjectBlockData;
      return (
        <>
          <TextInput
            value={data.name}
            onChangeText={(name) => onChange(updateStepData(block, { ...data, name }))}
            placeholder={t('editor.properties.objectName')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={data.assetId ?? ''}
            onChangeText={(assetId) => onChange(updateStepData(block, { ...data, assetId: assetId || null }))}
            placeholder={t('editor.properties.sprite')}
            placeholderTextColor={colors.muted}
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.position?.x ?? 50)}
            onChangeText={(x) => onChange(updateStepData(block, { ...data, position: { ...data.position, x: Number(x) || 0 } }))}
            placeholder={t('editor.properties.positionX')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
          <TextInput
            value={String(data.position?.y ?? 50)}
            onChangeText={(y) => onChange(updateStepData(block, { ...data, position: { ...data.position, y: Number(y) || 0 } }))}
            placeholder={t('editor.properties.positionY')}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={fieldStyle(colors)}
          />
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
