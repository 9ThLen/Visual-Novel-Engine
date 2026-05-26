import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { SplashScreenEditor } from '@/components/SplashScreenEditor';
import { InteractiveObjectsEditor } from '@/components/InteractiveObjectsEditor';
import { ChoiceEditor } from './ChoiceEditor';
import { MediaPickerRow } from './MediaPickerRow';
import type { StoryScene } from '@/lib/types';
import type { InteractiveObject } from '@/lib/interactive-types';
import type { SplashScreenConfig } from '@/lib/splash-types';

interface SceneEditorFormProps {
  scene: StoryScene;
  sceneText: string;
  backgroundUri: string;
  voiceUri: string;
  musicUri: string;
  splashConfig: SplashScreenConfig | undefined;
  interactiveObjects: InteractiveObject[];
  sceneList: string[];
  currentSceneId: string;
  hasChanges?: boolean;
  onSceneTextChange: (text: string) => void;
  onPickBg: () => void;
  onLibraryBg: () => void;
  onClearBg: () => void;
  onPickVoice: () => void;
  onLibraryVoice: () => void;
  onClearVoice: () => void;
  onPickMusic: () => void;
  onLibraryMusic: () => void;
  onClearMusic: () => void;
  onSplashChange: (config: SplashScreenConfig | undefined) => void;
  onInteractiveObjectsChange: (objs: InteractiveObject[]) => void;
  onChoiceAdd: (text: string, targetSceneId: string) => void;
  onChoiceDelete: (id: string) => void;
  onSceneNavigate: (sceneId: string) => void;
  onSceneAdd: () => void;
  onSceneDelete: (id: string) => void;
  onSave?: () => void;
}

export function SceneEditorForm({
  scene,
  sceneText,
  backgroundUri,
  voiceUri,
  musicUri,
  splashConfig,
  interactiveObjects,
  sceneList,
  currentSceneId,
  hasChanges,
  onSceneTextChange,
  onPickBg,
  onLibraryBg,
  onClearBg,
  onPickVoice,
  onLibraryVoice,
  onClearVoice,
  onPickMusic,
  onLibraryMusic,
  onClearMusic,
  onSplashChange,
  onInteractiveObjectsChange,
  onChoiceAdd,
  onChoiceDelete,
  onSceneNavigate,
  onSceneAdd,
  onSceneDelete,
  onSave,
}: SceneEditorFormProps) {
  const colors = useColors();
  const { t } = useI18n();

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="flex-1">
      {/* Dialogue Text */}
      <View className="mb-4">
        <Text style={[{ color: colors.muted }, { fontSize: 12, fontWeight: '600', marginBottom: 4 }]}>
          Dialogue Text
          <Text style={[{ color: colors.muted }, { fontWeight: 'normal' }]}>{' '}(use &quot;Name: text&quot; for speaker name)</Text>
        </Text>
        <TextInput
          style={[{ backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: 'top', borderWidth: 1 }]}
          placeholder="Enter dialogue... or 'Elena: Hello there!'"
          placeholderTextColor={colors.muted}
          value={sceneText}
          onChangeText={onSceneTextChange}
          multiline
        />
      </View>

      {/* Media */}
      <MediaPickerRow
        label="Background Image (JPG/PNG)"
        value={backgroundUri}
        isImage
        onPick={onPickBg}
        onLibrary={onLibraryBg}
        onClear={onClearBg}
      />
      <MediaPickerRow
        label="Voice Audio (MP3)"
        value={voiceUri}
        onPick={onPickVoice}
        onLibrary={onLibraryVoice}
        onClear={onClearVoice}
      />
      <MediaPickerRow
        label="Background Music (MP3)"
        value={musicUri}
        onPick={onPickMusic}
        onLibrary={onLibraryMusic}
        onClear={onClearMusic}
      />

      <SplashScreenEditor config={splashConfig} onChange={onSplashChange} />
      <InteractiveObjectsEditor objects={interactiveObjects} onChange={onInteractiveObjectsChange} />

      {/* Choices */}
      <ChoiceEditor
        choices={scene.choices}
        sceneList={sceneList}
        onAddChoice={onChoiceAdd}
        onDeleteChoice={onChoiceDelete}
        onNavigateToScene={onSceneNavigate}
      />

      {/* Scene list */}
      <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1 }]}>
        <Text style={[{ color: colors.foreground }, { fontSize: 14, fontWeight: 'bold', marginBottom: 12 }]}>
          All Scenes ({sceneList.length})
        </Text>
        <View className="gap-1.5">
          {Array.from({ length: Math.ceil(sceneList.length / 2) }).map((_, idx) => {
            const first = sceneList[idx * 2];
            const second = sceneList[idx * 2 + 1];
            return (
              <View key={first} className="flex-row gap-2">
                <Pressable
                  style={{
                    flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                    backgroundColor: currentSceneId === first ? colors.primary : colors.background,
                    borderColor: currentSceneId === first ? colors.primary : colors.border,
                  }}
                  onPress={() => onSceneNavigate(first)}
                  onLongPress={() => onSceneDelete(first)}
                >
                  <Text
                    style={[{ color: currentSceneId === first ? colors['text-inverse'] ?? '#fff' : colors.foreground }, { fontSize: 12, fontWeight: currentSceneId === first ? 'bold' : 'normal' }]}
                    numberOfLines={1}
                  >
                    {first}
                  </Text>
                </Pressable>
                {second && (
                  <Pressable
                    style={{
                      flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                      backgroundColor: currentSceneId === second ? colors.primary : colors.background,
                      borderColor: currentSceneId === second ? colors.primary : colors.border,
                    }}
                    onPress={() => onSceneNavigate(second)}
                    onLongPress={() => onSceneDelete(second)}
                  >
                    <Text
                      style={[{ color: currentSceneId === second ? colors['text-inverse'] ?? '#fff' : colors.foreground }, { fontSize: 12, fontWeight: currentSceneId === second ? 'bold' : 'normal' }]}
                      numberOfLines={1}
                    >
                      {second}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 8,
            marginTop: 10, alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={onSceneAdd}
        >
          <Text style={[{ color: colors['text-inverse'] ?? '#fff' }, { fontSize: 14, fontWeight: '600', textAlign: 'center' }]}>+ Add New Scene</Text>
        </Pressable>
        <Text style={[{ color: colors.muted }, { fontSize: 10, textAlign: 'center', marginTop: 6 }]}>Long-press a scene to delete</Text>
      </View>

      {/* Save button (shown when used as standalone form) */}
      {onSave && (
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12,
            alignItems: 'center', marginBottom: 28,
            opacity: !hasChanges ? 0.5 : pressed ? 0.8 : 1,
          })}
          onPress={onSave}
          disabled={!hasChanges}
        >
          <Text style={[{ color: colors['text-inverse'] ?? '#fff' }, { fontSize: 14, fontWeight: 'bold', textAlign: 'center' }]}>💾 Save Scene</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}