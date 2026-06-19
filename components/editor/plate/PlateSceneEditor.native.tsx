import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentEditorHeader } from '@/components/document-editor/DocumentEditorHeader';
import { NativeSceneEditor } from '@/components/editor/native/NativeSceneEditor';
import { useColors } from '@/hooks/use-colors';
import {
  sceneDocumentToSceneRecord,
  sceneRecordToSceneDocument,
} from '@/lib/scene-document/sceneRecordAdapter';
import type { SceneDocument } from '@/lib/scene-document/sceneTypes';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';

interface PlateSceneEditorProps {
  storyId: string;
  sceneRecord: SceneRecord;
  scenes: SceneRecord[];
  sceneIndex: number;
  sceneCount: number;
  characters: Character[];
  protectedCharacterIds?: string[];
  onSave: (sceneRecords: SceneRecord[], characters: Character[]) => void;
  onCreateNextScene?: (sourceSceneId: string, sceneRecords: SceneRecord[], characters: Character[]) => void;
}

export function PlateSceneEditor({
  storyId,
  sceneRecord,
  scenes,
  sceneIndex,
  sceneCount,
  characters,
  onSave,
  onCreateNextScene,
}: PlateSceneEditorProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors('light');
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialDocuments = useMemo(
    () => scenes.map((scene) => sceneRecordToSceneDocument(scene, characters)),
    [characters, scenes],
  );
  const [documents, setDocuments] = useState(initialDocuments);
  const [activeSceneId, setActiveSceneId] = useState(sceneRecord.id);
  const [isSaving, setIsSaving] = useState(false);
  const [prevDocuments, setPrevDocuments] = useState(initialDocuments);

  if (prevDocuments !== initialDocuments) {
    setDocuments(initialDocuments);
    setActiveSceneId(sceneRecord.id);
    setPrevDocuments(initialDocuments);
  }

  const activeDocument = documents.find((document) => document.id === activeSceneId) ?? documents[0];

  const documentsToRecords = useCallback((sceneDocuments: SceneDocument[]) => {
    const recordsById = new Map(scenes.map((scene) => [scene.id, scene]));
    return sceneDocuments.flatMap((document, index) => {
      const sourceRecord = recordsById.get(document.id);
      if (!sourceRecord) return [];
      return [sceneDocumentToSceneRecord(sourceRecord, document, characters, {
        nextSceneId: scenes[index + 1]?.id,
      })];
    });
  }, [characters, scenes]);

  const handleChange = useCallback((nextDocument: SceneDocument) => {
    setActiveSceneId(nextDocument.id);
    setDocuments((current) =>
      current.map((document) => document.id === nextDocument.id ? nextDocument : document),
    );
  }, []);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    const nextRecords = documentsToRecords(documents);

    onSave(nextRecords, characters);

    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
    }
    savingTimerRef.current = setTimeout(() => {
      setIsSaving(false);
      savingTimerRef.current = null;
    }, 250);
  }, [characters, documents, documentsToRecords, onSave]);

  const handleCreateNextScene = useCallback((nextDocument: SceneDocument) => {
    const nextDocuments = documents.map((document) => document.id === nextDocument.id ? nextDocument : document);
    setActiveSceneId(nextDocument.id);
    setDocuments(nextDocuments);
    onCreateNextScene?.(nextDocument.id, documentsToRecords(nextDocuments), characters);
  }, [characters, documents, documentsToRecords, onCreateNextScene]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={0}
    >
      <DocumentEditorHeader
        activeTitle={activeDocument?.title || sceneRecord.name}
        colorScheme="light"
        isPhone
        isSaving={isSaving}
        safeTop={insets.top}
        sceneIndex={sceneIndex}
        sceneCount={sceneCount}
        onBack={() => router.back()}
        onPreview={() => router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } })}
        onSave={handleSave}
        onSaveAndPlay={() => {
          handleSave();
          router.push({ pathname: '/preview', params: { storyId, sceneId: activeSceneId } });
        }}
      />
      <View style={{ flex: 1 }}>
        {activeDocument ? (
          <NativeSceneEditor
            key={activeDocument.id}
            value={activeDocument}
            onChange={handleChange}
            onCreateNextScene={onCreateNextScene ? handleCreateNextScene : undefined}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
