import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useI18n } from '@/lib/i18n';
import {
  createDocumentTechnicalBlock,
  documentSceneToConnections,
  documentSceneToTimeline,
  ensureDocumentCharactersInBlocks,
  parseDraftLineToDocumentBlock,
  refreshDocumentTechnicalBlock,
} from '@/lib/document-editor/document-scene';
import { searchDocumentCommands } from '@/lib/document-editor/commands';
import type {
  DocumentBlock,
  DocumentCommand,
  DocumentScene,
  DocumentTechnicalBlock,
} from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import type {
  BackgroundBlockData,
  CameraBlockData,
  CharacterBlockData,
  EffectBlockData,
  InteractiveObjectBlockData,
  MusicBlockData,
  SceneRecord,
  SoundBlockData,
  TimelineStep,
  TransitionBlockData,
  VariableBlockData,
} from '@/lib/engine/types';

interface DocumentSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  sceneIndex: number;
  sceneCount: number;
  initialDocuments: DocumentScene[];
  characters: Character[];
  protectedCharacterIds?: string[];
  onSave: (documentScenes: DocumentScene[], characters: Character[]) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
}

const PAGE_MAX_WIDTH = 760;

function updateBlockById(blocks: DocumentBlock[], blockId: string, updater: (block: DocumentBlock) => DocumentBlock): DocumentBlock[] {
  return blocks.map((block) => (block.id === blockId ? updater(block) : block));
}

function replaceBlockById(blocks: DocumentBlock[], blockId: string, nextBlocks: DocumentBlock[]): DocumentBlock[] {
  return blocks.flatMap((block) => (block.id === blockId ? nextBlocks : [block]));
}

function removeBlockById(blocks: DocumentBlock[], blockId: string): DocumentBlock[] {
  return blocks.filter((block) => block.id !== blockId);
}

function getNearbyDialogue(blocks: DocumentBlock[]): Extract<DocumentBlock, { kind: 'dialogue' }> | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind === 'dialogue') {
      return block;
    }
  }
  return undefined;
}

function pruneCharacterIfUnused(characters: Character[], blocks: DocumentBlock[], characterId: string | null, protectedCharacterIds: string[]): Character[] {
  if (!characterId) return characters;
  if (protectedCharacterIds.includes(characterId)) return characters;
  const isStillUsed = blocks.some((item) => item.kind === 'dialogue' && item.characterId === characterId);
  return isStillUsed ? characters : characters.filter((character) => character.id !== characterId);
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

function DocumentChip({
  block,
  selected,
  onPress,
}: {
  block: DocumentTechnicalBlock;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const chipLabel = block.commandId === 'character' || block.commandId === 'sprite'
    ? block.label
    : t(`document.command.${block.commandId}`, undefined, block.label);
  const warning = block.warning ? t(`document.warning.${block.blockType}`, undefined, block.warning) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${chipLabel}: ${block.summary}`}
      style={{
        alignSelf: 'flex-start',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? colors.primary : block.warning ? colors.warning : colors.border,
        backgroundColor: selected ? `${colors.primary}14` : colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 7,
        marginVertical: 5,
      }}
    >
      <Text style={{ color: selected ? colors.primary : colors.foreground, fontSize: 13, fontWeight: '700' }}>
        {chipLabel}: {block.summary}
      </Text>
      {warning ? (
        <Text style={{ color: colors.warning, fontSize: 11, marginTop: 2 }}>{warning}</Text>
      ) : null}
    </Pressable>
  );
}

function CommandMenu({
  query,
  visible,
  isPhone,
  onPick,
  onClose,
}: {
  query: string;
  visible: boolean;
  isPhone: boolean;
  onPick: (command: DocumentCommand) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const commands = useMemo(() => searchDocumentCommands(query), [query]);

  const content = (
    <View
      style={{
        width: isPhone ? '100%' : 320,
        maxHeight: isPhone ? 360 : 420,
        borderRadius: isPhone ? 18 : 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
          /{query.replace(/^\//, '')}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
          {t('document.commandMenuHint')}
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {commands.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.muted }}>{t('document.noCommandsFound')}</Text>
          </View>
        ) : (
          commands.map((command) => (
            <Pressable
              key={command.id}
              onPress={() => onPick(command)}
              accessibilityRole="button"
              accessibilityLabel={t(`document.command.${command.id}`, undefined, command.title)}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: 14,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: pressed ? colors.hover : colors.surface,
              })}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: `${colors.primary}16`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {t(`document.command.${command.id}`, undefined, command.title).slice(0, 1)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>
                  {t(`document.command.${command.id}`, undefined, command.title)}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {t(`document.command.${command.id}.description`, undefined, command.description)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  if (!visible) return null;

  if (isPhone) {
    return (
      <Modal transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }} onPress={onClose}>
          <Pressable style={{ padding: 12 }} onPress={(event) => event.stopPropagation()}>
            {content}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={{ position: 'absolute', left: 38, bottom: 74, zIndex: 20 }}>
      {content}
    </View>
  );
}

function PropertiesPanel({
  block,
  isPhone,
  onClose,
  onChange,
  onRemoveBlock,
  onEmptyBackspace,
}: {
  block: DocumentTechnicalBlock | null;
  isPhone: boolean;
  onClose: () => void;
  onChange: (block: DocumentTechnicalBlock) => void;
  onRemoveBlock?: () => void;
  onEmptyBackspace: (id: string, onDoubleBackspace: () => void) => void;
}) {
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

export function DocumentSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  sceneIndex,
  sceneCount,
  initialDocuments,
  characters,
  protectedCharacterIds = [],
  onSave,
  onCreateNextScene,
}: DocumentSceneEditorProps) {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const isPhone = layout.deviceType === 'phone';
  const [documentScenes, setDocumentScenes] = useState(initialDocuments);
  const [localCharacters, setLocalCharacters] = useState(characters);
  const [lineDrafts, setLineDrafts] = useState<Record<string, string>>({});
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollViewportHeightRef = useRef(layout.screenHeight);
  const pageOffsetsRef = useRef<Record<string, number>>({});
  const pageHeightsRef = useRef<Record<string, number>>({});
  const followSceneIdRef = useRef<string | null>(null);
  const didScrollToActiveRef = useRef(false);
  const shouldAnimateToActivePageRef = useRef(false);
  const previousSceneIdRef = useRef(sceneRecord.id);
  const previousDocumentsRef = useRef(initialDocuments);
  const shouldFollowWritingRef = useRef(false);
  const backspacePressRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const previousSceneId = previousSceneIdRef.current;
    const previousDocuments = previousDocumentsRef.current;
    const previousIndex = previousDocuments.findIndex((documentScene) => documentScene.sceneId === previousSceneId);
    const nextIndex = initialDocuments.findIndex((documentScene) => documentScene.sceneId === sceneRecord.id);
    shouldAnimateToActivePageRef.current = previousSceneId !== sceneRecord.id && previousIndex >= 0 && nextIndex > previousIndex;
    previousSceneIdRef.current = sceneRecord.id;
    previousDocumentsRef.current = initialDocuments;
    setDocumentScenes(initialDocuments);
    setLocalCharacters(characters);
    setActiveSceneId(sceneRecord.id);
    setSelectedBlockId(null);
    setLineDrafts({});
    pageOffsetsRef.current = {};
    pageHeightsRef.current = {};
    followSceneIdRef.current = null;
    didScrollToActiveRef.current = false;
    shouldFollowWritingRef.current = false;
  }, [characters, initialDocuments, sceneRecord.id]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const activeDocument = documentScenes.find((documentScene) => documentScene.sceneId === activeSceneId) ?? documentScenes[0];
  const selectedTechnicalBlockInfo = documentScenes
    .flatMap((documentScene) => documentScene.blocks.map((block) => ({ sceneId: documentScene.sceneId, block })))
    .find((item): item is { sceneId: string; block: DocumentTechnicalBlock } => item.block.kind === 'technical' && item.block.id === selectedBlockId) ?? null;
  const selectedTechnicalBlock = selectedTechnicalBlockInfo?.block ?? null;

  const scrollToWritingPosition = useCallback(() => {
    requestAnimationFrame(() => {
      const sceneId = followSceneIdRef.current ?? activeSceneId;
      const pageOffset = pageOffsetsRef.current[sceneId] ?? 0;
      const pageHeight = pageHeightsRef.current[sceneId] ?? layout.screenHeight;
      const viewportHeight = scrollViewportHeightRef.current || layout.screenHeight;
      const keyboardInset = isPhone ? keyboardHeight : 0;
      const bottomGap = isPhone ? 96 : 120;
      const targetY = Math.max(0, pageOffset + pageHeight - viewportHeight + keyboardInset + bottomGap);
      scrollViewRef.current?.scrollTo({ y: targetY, animated: false });
    });
  }, [activeSceneId, isPhone, keyboardHeight, layout.screenHeight]);

  useEffect(() => {
    if (shouldFollowWritingRef.current) {
      scrollToWritingPosition();
    }
  }, [keyboardHeight, scrollToWritingPosition]);

  const followWriting = useCallback((sceneId: string) => {
    followSceneIdRef.current = sceneId;
    shouldFollowWritingRef.current = true;
    scrollToWritingPosition();
  }, [scrollToWritingPosition]);

  const updateDocumentScene = useCallback((sceneId: string, updater: (documentScene: DocumentScene) => DocumentScene) => {
    setDocumentScenes((current) => current.map((documentScene) => (
      documentScene.sceneId === sceneId ? updater(documentScene) : documentScene
    )));
  }, []);

  const updateBlock = useCallback((sceneId: string, blockId: string, updater: (block: DocumentBlock) => DocumentBlock) => {
    updateDocumentScene(sceneId, (current) => ({ ...current, blocks: updateBlockById(current.blocks, blockId, updater) }));
  }, [updateDocumentScene]);

  const replaceBlock = useCallback((sceneId: string, blockId: string, nextBlocks: DocumentBlock[]) => {
    updateDocumentScene(sceneId, (current) => ({ ...current, blocks: replaceBlockById(current.blocks, blockId, nextBlocks) }));
  }, [updateDocumentScene]);

  const removeBlock = useCallback((sceneId: string, blockId: string) => {
    updateDocumentScene(sceneId, (current) => ({ ...current, blocks: removeBlockById(current.blocks, blockId) }));
    setSelectedBlockId((current) => (current === blockId ? null : current));
  }, [updateDocumentScene]);

  const handleEmptyBackspace = useCallback((id: string, onDoubleBackspace: () => void) => {
    const now = Date.now();
    const previous = backspacePressRef.current;
    backspacePressRef.current = { id, at: now };
    if (previous?.id === id && now - previous.at < 900) {
      backspacePressRef.current = null;
      onDoubleBackspace();
    }
  }, []);

  const updateLineDraft = useCallback((sceneId: string, value: string) => {
    setLineDrafts((current) => ({ ...current, [sceneId]: value }));
  }, []);

  const insertCommand = useCallback((sceneId: string, command: DocumentCommand) => {
    const documentScene = documentScenes.find((item) => item.sceneId === sceneId);
    if (!documentScene) return;

    if (command.id === 'newScene') {
      const ensured = ensureDocumentCharactersInBlocks(
        documentScenes.flatMap((item) => item.blocks),
        localCharacters
      );
      let cursor = 0;
      const ensuredDocuments = documentScenes.map((documentScene) => {
        const blocks = ensured.blocks.slice(cursor, cursor + documentScene.blocks.length);
        cursor += documentScene.blocks.length;
        return { ...documentScene, blocks };
      });
      onCreateNextScene(sceneId, ensuredDocuments, ensured.characters);
      updateLineDraft(sceneId, '');
      return;
    }

    updateDocumentScene(sceneId, (current) => {
      const technical = createDocumentTechnicalBlock(command.id, localCharacters, getNearbyDialogue(current.blocks));
      return { ...current, blocks: [...current.blocks, technical] };
    });
    updateLineDraft(sceneId, '');
  }, [documentScenes, localCharacters, onCreateNextScene, updateDocumentScene, updateLineDraft]);

  const addLine = useCallback((sceneId: string) => {
    const lineDraft = lineDrafts[sceneId] ?? '';
    const slashOpen = lineDraft.trimStart().startsWith('/');
    if (!lineDraft.trim()) return;
    if (slashOpen) return;
    updateDocumentScene(sceneId, (current) => {
      const blocks = [...current.blocks, parseDraftLineToDocumentBlock(lineDraft, localCharacters)];
      const ensured = ensureDocumentCharactersInBlocks(blocks, localCharacters);
      setLocalCharacters(ensured.characters);
      return { ...current, blocks: ensured.blocks };
    });
    updateLineDraft(sceneId, '');
    followWriting(sceneId);
  }, [followWriting, lineDrafts, localCharacters, updateDocumentScene, updateLineDraft]);

  const handleTextBlockChange = useCallback((sceneId: string, blockId: string, content: string) => {
    const lines = content.split(/\r?\n/);
    const slashLine = lines.find((line) => line.trimStart().startsWith('/'));

    if (slashLine) {
      updateLineDraft(sceneId, slashLine.trim());
      const nextContent = lines.filter((line) => line !== slashLine).join('\n').trimEnd();
      updateBlock(sceneId, blockId, (current) => current.kind === 'text' ? { ...current, content: nextContent } : current);
      return;
    }

    const meaningfulLines = lines.map((line) => line.trim()).filter(Boolean);
    const hasStructuredLines = meaningfulLines.length > 1 && meaningfulLines.some((line) => /^([^:]{1,48}):\s*(.+)$/.test(line) || line.startsWith('?'));
    if (hasStructuredLines) {
      const nextBlocks = meaningfulLines.map((line) => parseDraftLineToDocumentBlock(line, localCharacters));
      const ensured = ensureDocumentCharactersInBlocks(nextBlocks, localCharacters);
      setLocalCharacters(ensured.characters);
      replaceBlock(sceneId, blockId, ensured.blocks);
      return;
    }

    updateBlock(sceneId, blockId, (current) => current.kind === 'text' ? { ...current, content } : current);
  }, [localCharacters, replaceBlock, updateBlock, updateLineDraft]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    const nextDocuments = documentScenes.map((documentScene) => ({ ...documentScene, blocks: [...documentScene.blocks] }));
    const ensured = ensureDocumentCharactersInBlocks(
      nextDocuments.flatMap((documentScene) => documentScene.blocks),
      localCharacters
    );
    let cursor = 0;
    const ensuredDocuments = nextDocuments.map((documentScene) => {
      const blocks = ensured.blocks.slice(cursor, cursor + documentScene.blocks.length);
      cursor += documentScene.blocks.length;
      return { ...documentScene, blocks };
    });
    onSave(ensuredDocuments, ensured.characters);
    setLocalCharacters(ensured.characters);
    setDocumentScenes(ensuredDocuments);
    setTimeout(() => setIsSaving(false), 250);
  }, [documentScenes, localCharacters, onSave]);

  const renderPage = (documentScene: DocumentScene, pageIndex: number) => {
    const lineDraft = lineDrafts[documentScene.sceneId] ?? '';
    const slashOpen = lineDraft.trimStart().startsWith('/');
    const slashQuery = slashOpen ? lineDraft.trimStart().slice(1) : '';
    const pageMinHeight = isPhone ? layout.screenHeight - insets.top - insets.bottom - 68 : 860;
    const textInputBaseStyle = {
      color: colors.foreground,
      fontSize: 17,
      lineHeight: 27,
      paddingVertical: isPhone ? 8 : 7,
      textAlignVertical: 'top' as const,
    };
    const phoneBlockFrame = isPhone
      ? {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginBottom: 8,
        }
      : null;

    return (
    <View
      key={documentScene.sceneId}
      onLayout={(event) => {
        const layoutY = event.nativeEvent.layout.y;
        pageOffsetsRef.current[documentScene.sceneId] = layoutY;
        pageHeightsRef.current[documentScene.sceneId] = event.nativeEvent.layout.height;
        if (!didScrollToActiveRef.current && documentScene.sceneId === sceneRecord.id) {
          didScrollToActiveRef.current = true;
          requestAnimationFrame(() => {
            const animated = shouldAnimateToActivePageRef.current;
            shouldAnimateToActivePageRef.current = false;
            scrollViewRef.current?.scrollTo({ y: Math.max(0, layoutY - 12), animated });
          });
        }
      }}
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        alignSelf: 'center',
        backgroundColor: colors['surface-1'],
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: isPhone ? 0 : 8,
        paddingHorizontal: isPhone ? 22 : 48,
        paddingVertical: isPhone ? 26 : 42,
        minHeight: pageMinHeight,
        marginBottom: isPhone ? 16 : 24,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
        {t('document.sceneCounter', { current: pageIndex + 1, total: Math.max(sceneCount, 1) })}
      </Text>
      <TextInput
        value={documentScene.sceneName}
        onFocus={() => setActiveSceneId(documentScene.sceneId)}
        onChangeText={(sceneName) => updateDocumentScene(documentScene.sceneId, (current) => ({ ...current, sceneName }))}
        placeholder={t('document.sceneNamePlaceholder')}
        placeholderTextColor={colors.muted}
        style={{ color: colors.foreground, fontSize: isPhone ? 28 : 36, fontWeight: '800', paddingVertical: 8 }}
      />

      <View
        style={{
          flex: isPhone ? 1 : undefined,
          justifyContent: isPhone ? 'flex-end' : 'flex-start',
          marginTop: 12,
          minHeight: isPhone ? Math.max(320, pageMinHeight - 150) : undefined,
        }}
      >
        {documentScene.blocks.map((block) => {
          const isLastBlock = documentScene.blocks[documentScene.blocks.length - 1]?.id === block.id;
          if (block.kind === 'technical') {
            return (
              <DocumentChip
                key={block.id}
                block={block}
                selected={block.id === selectedBlockId}
                onPress={() => {
                  setActiveSceneId(documentScene.sceneId);
                  setSelectedBlockId(block.id);
                }}
              />
            );
          }

          if (block.kind === 'dialogue') {
            return (
              <View
                key={block.id}
                style={{
                  ...(phoneBlockFrame ?? {}),
                  flexDirection: isPhone ? 'column' : 'row',
                  alignItems: isPhone ? 'stretch' : 'flex-start',
                  gap: isPhone ? 6 : 8,
                  paddingVertical: isPhone ? (phoneBlockFrame ? 8 : 5) : 5,
                }}
              >
                <TextInput
                  value={block.speakerName}
                  onFocus={() => {
                    setActiveSceneId(documentScene.sceneId);
                    if (isLastBlock) followWriting(documentScene.sceneId);
                  }}
                  onChangeText={(speakerName) => {
                    const next = {
                      ...block,
                      speakerName,
                      characterId: speakerName.trim()
                        ? localCharacters.find((item) => item.name.toLocaleLowerCase() === speakerName.trim().toLocaleLowerCase())?.id ?? null
                        : null,
                    };
                    const ensured = ensureDocumentCharactersInBlocks([next], localCharacters);
                    updateBlock(documentScene.sceneId, block.id, () => ensured.blocks[0] ?? next);
                    setLocalCharacters(ensured.characters);
                  }}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key !== 'Backspace' || block.speakerName.length > 0) return;
                    handleEmptyBackspace(`speaker:${block.id}`, () => {
                      updateDocumentScene(documentScene.sceneId, (current) => {
                        const textBlock: DocumentBlock = {
                          id: block.id,
                          kind: 'text',
                          sourceStepId: block.sourceStepId,
                          content: block.text,
                        };
                        const blocks = replaceBlockById(current.blocks, block.id, [textBlock]);
                        setLocalCharacters((items) => pruneCharacterIfUnused(items, blocks, block.characterId, protectedCharacterIds));
                        return { ...current, blocks };
                      });
                    });
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    minWidth: 58,
                    maxWidth: 132,
                    color: colors.primary,
                    backgroundColor: `${colors.primary}14`,
                    borderColor: `${colors.primary}55`,
                    borderWidth: 1,
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: '800',
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    textAlign: 'center',
                  }}
                  placeholder={t('document.speakerPlaceholder')}
                  placeholderTextColor={colors.muted}
                />
                <TextInput
                  multiline
                  numberOfLines={isPhone ? 2 : undefined}
                  scrollEnabled={false}
                  value={block.text}
                  onFocus={() => {
                    setActiveSceneId(documentScene.sceneId);
                    if (isLastBlock) followWriting(documentScene.sceneId);
                  }}
                  onChangeText={(text) => {
                    updateBlock(documentScene.sceneId, block.id, (current) => current.kind === 'dialogue' ? { ...current, text } : current);
                    if (isLastBlock) followWriting(documentScene.sceneId);
                  }}
                  onContentSizeChange={() => {
                    if (isLastBlock) followWriting(documentScene.sceneId);
                  }}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key !== 'Backspace' || block.text.length > 0) return;
                    handleEmptyBackspace(`dialogue:${block.id}`, () => removeBlock(documentScene.sceneId, block.id));
                  }}
                  style={{
                    ...textInputBaseStyle,
                    flex: isPhone ? undefined : 1,
                    minHeight: isPhone ? 54 : undefined,
                    paddingVertical: isPhone ? 2 : 3,
                  }}
                  placeholder={t('document.dialoguePlaceholder')}
                  placeholderTextColor={colors.muted}
                />
              </View>
            );
          }

          if (block.kind === 'choice') {
            return (
              <View
                key={block.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  backgroundColor: isPhone ? colors.surface : 'transparent',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginVertical: 10,
                }}
              >
                <TextInput
                  value={`? ${block.question}`}
                  onFocus={() => setActiveSceneId(documentScene.sceneId)}
                  onChangeText={(value) => updateBlock(documentScene.sceneId, block.id, (current) => current.kind === 'choice' ? { ...current, question: value.replace(/^\?\s*/, '') } : current)}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key !== 'Backspace' || block.question.length > 0) return;
                    handleEmptyBackspace(`choice:${block.id}`, () => removeBlock(documentScene.sceneId, block.id));
                  }}
                  style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', paddingVertical: 6 }}
                />
                {block.options.map((option, index) => (
                  <TextInput
                    key={option.id}
                    value={`- ${option.text}`}
                    onFocus={() => setActiveSceneId(documentScene.sceneId)}
                    onChangeText={(value) => {
                      updateBlock(documentScene.sceneId, block.id, (current) => {
                        if (current.kind !== 'choice') return current;
                        const options = [...current.options];
                        options[index] = { ...option, text: value.replace(/^-\s*/, '') };
                        return { ...current, options };
                      });
                    }}
                    onKeyPress={(event) => {
                      if (event.nativeEvent.key !== 'Backspace' || option.text.length > 0) return;
                      handleEmptyBackspace(`choice-option:${option.id}`, () => {
                        updateBlock(documentScene.sceneId, block.id, (current) => {
                          if (current.kind !== 'choice') return current;
                          const options = current.options.filter((item) => item.id !== option.id);
                          return options.length > 0 ? { ...current, options } : current;
                        });
                      });
                    }}
                    style={{ color: colors.foreground, fontSize: 15, paddingVertical: 4, marginLeft: 10 }}
                  />
                ))}
              </View>
            );
          }

          return (
            <TextInput
              key={block.id}
              multiline
              scrollEnabled={false}
              value={block.content}
              onFocus={() => {
                setActiveSceneId(documentScene.sceneId);
                if (isLastBlock) followWriting(documentScene.sceneId);
              }}
              onChangeText={(content) => {
                handleTextBlockChange(documentScene.sceneId, block.id, content);
                if (isLastBlock) followWriting(documentScene.sceneId);
              }}
              onContentSizeChange={() => {
                if (isLastBlock) followWriting(documentScene.sceneId);
              }}
              onKeyPress={(event) => {
                if (event.nativeEvent.key !== 'Backspace' || block.content.length > 0) return;
                handleEmptyBackspace(`text:${block.id}`, () => removeBlock(documentScene.sceneId, block.id));
              }}
              style={{ color: colors.foreground, fontSize: 17, lineHeight: 27, paddingVertical: 7 }}
              textAlignVertical="top"
              placeholder={t('document.narrationPlaceholder')}
              placeholderTextColor={colors.muted}
            />
          );
        })}
      </View>

      <View
        style={{
          position: 'relative',
          marginTop: isPhone ? 4 : 12,
          borderWidth: isPhone || slashOpen ? 1 : 0,
          borderColor: slashOpen ? colors.primary : colors.border,
          borderRadius: 8,
          backgroundColor: isPhone ? colors.background : 'transparent',
        }}
      >
        <TextInput
          multiline
          numberOfLines={isPhone ? 2 : undefined}
          scrollEnabled={false}
          blurOnSubmit={false}
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          value={lineDraft}
          onFocus={() => {
            setActiveSceneId(documentScene.sceneId);
            followWriting(documentScene.sceneId);
          }}
          onChangeText={(value) => {
            updateLineDraft(documentScene.sceneId, value);
            followWriting(documentScene.sceneId);
          }}
          onSubmitEditing={() => addLine(documentScene.sceneId)}
          onContentSizeChange={() => followWriting(documentScene.sceneId)}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Escape') updateLineDraft(documentScene.sceneId, '');
          }}
          placeholder={t('document.lineDraftPlaceholder')}
          placeholderTextColor={colors.muted}
          style={{
            minHeight: isPhone ? 56 : 44,
            color: colors.foreground,
            fontSize: 17,
            lineHeight: 27,
            borderWidth: isPhone ? 0 : 1,
            borderColor: slashOpen ? colors.primary : 'transparent',
            borderRadius: isPhone ? 0 : 8,
            paddingHorizontal: 10,
            paddingVertical: isPhone ? 12 : 8,
            textAlignVertical: 'top',
          }}
        />
        <CommandMenu
          query={slashQuery}
          visible={slashOpen}
          isPhone={isPhone}
          onPick={(command) => insertCommand(documentScene.sceneId, command)}
          onClose={() => updateLineDraft(documentScene.sceneId, '')}
        />
      </View>
    </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={0}
    >
      <View
        style={{
          minHeight: isPhone ? insets.top + 58 : 56,
          paddingHorizontal: isPhone ? 12 : 18,
          paddingTop: isPhone ? insets.top + 8 : 10,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Button variant="ghost" size="sm" onPress={() => router.back()}>{isPhone ? '‹' : t('menu.back')}</Button>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: '800', textAlign: isPhone ? 'center' : 'left' }}>
          {activeDocument?.sceneName || sceneRecord.name}
        </Text>
        <Button variant="secondary" size="sm" onPress={() => router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } } as never)}>
          {isPhone ? t('common.play') : t('editor.preview')}
        </Button>
        <Button variant="primary" size="sm" onPress={handleSave} loading={isSaving}>{t('common.save')}</Button>
      </View>

      <View style={{ flex: 1, flexDirection: isPhone ? 'column' : 'row' }}>
        {!isPhone ? (
          <View style={{ width: 250, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface, padding: 14 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{t('editor.scenes')}</Text>
            <ScrollView style={{ marginTop: 12 }}>
              {scenes.map((scene) => (
                <Pressable
                  key={scene.id}
                  onPress={() => router.push({ pathname: '/document-editor', params: { storyId, sceneId: scene.id } } as never)}
                  style={{
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: scene.id === sceneRecord.id ? colors.primary : colors.border,
                    backgroundColor: scene.id === sceneRecord.id ? `${colors.primary}12` : colors.background,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{scene.name || t('document.untitledScene')}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{t('document.blockCount', { count: scene.timeline.length })}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          onLayout={(event) => {
            scrollViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          contentContainerStyle={{
            paddingHorizontal: isPhone ? 0 : 28,
            paddingVertical: isPhone ? 0 : 24,
            paddingBottom: isPhone ? insets.bottom + keyboardHeight + 180 : 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={120}
          onScroll={(event) => {
            const scrollY = event.nativeEvent.contentOffset.y + 120;
            const visibleSceneId = documentScenes.reduce((currentSceneId, documentScene) => {
              const pageOffset = pageOffsetsRef.current[documentScene.sceneId] ?? 0;
              return pageOffset <= scrollY ? documentScene.sceneId : currentSceneId;
            }, documentScenes[0]?.sceneId ?? activeSceneId);
            if (visibleSceneId !== activeSceneId) {
              setActiveSceneId(visibleSceneId);
            }
          }}
          onContentSizeChange={() => {
            if (shouldFollowWritingRef.current) {
              scrollToWritingPosition();
            }
          }}
        >
          {documentScenes.map((documentScene, index) => renderPage(documentScene, index))}
        </ScrollView>

        {!isPhone ? (
          <PropertiesPanel
            block={selectedTechnicalBlock}
            isPhone={false}
            onClose={() => setSelectedBlockId(null)}
            onChange={(nextBlock) => {
              if (!selectedTechnicalBlockInfo) return;
              updateBlock(selectedTechnicalBlockInfo.sceneId, nextBlock.id, () => refreshDocumentTechnicalBlock(nextBlock, localCharacters));
            }}
            onRemoveBlock={selectedTechnicalBlock && selectedTechnicalBlock.blockType !== 'background' && selectedTechnicalBlockInfo
              ? () => removeBlock(selectedTechnicalBlockInfo.sceneId, selectedTechnicalBlock.id)
              : undefined}
            onEmptyBackspace={handleEmptyBackspace}
          />
        ) : (
          <PropertiesPanel
            block={selectedTechnicalBlock}
            isPhone
            onClose={() => setSelectedBlockId(null)}
            onChange={(nextBlock) => {
              if (!selectedTechnicalBlockInfo) return;
              updateBlock(selectedTechnicalBlockInfo.sceneId, nextBlock.id, () => refreshDocumentTechnicalBlock(nextBlock, localCharacters));
            }}
            onRemoveBlock={selectedTechnicalBlock && selectedTechnicalBlock.blockType !== 'background' && selectedTechnicalBlockInfo
              ? () => removeBlock(selectedTechnicalBlockInfo.sceneId, selectedTechnicalBlock.id)
              : undefined}
            onEmptyBackspace={handleEmptyBackspace}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export function saveDocumentSceneToRecord(
  record: SceneRecord,
  documentScene: DocumentScene,
  options: { nextSceneId?: string } = {}
): SceneRecord {
  return {
    ...record,
    name: documentScene.sceneName.trim() || record.name,
    timeline: documentSceneToTimeline(documentScene),
    connections: documentSceneToConnections(documentScene, options.nextSceneId),
    updatedAt: Date.now(),
  };
}
