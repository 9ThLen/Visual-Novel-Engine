import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, FlatList, Image } from 'react-native';
import { SplashScreenEditor } from '@/components/SplashScreenEditor';
import { InteractiveObjectsEditor } from '@/components/InteractiveObjectsEditor';
import { StoryScene } from '@/lib/types';
import { useRouter } from 'expo-router';

interface EditTabProps {
  scene: StoryScene;
  sceneText: string;
  setSceneText: (text: string) => void;
  backgroundUri: string;
  setBackgroundUri: (uri: string) => void;
  voiceUri: string;
  setVoiceUri: (uri: string) => void;
  musicUri: string;
  setMusicUri: (uri: string) => void;
  splashConfig: any;
  setSplashConfig: (config: any) => void;
  interactiveObjects: any[];
  setInteractiveObjects: (objs: any[]) => void;
  newChoiceText: string;
  setNewChoiceText: (text: string) => void;
  newChoiceTarget: string;
  setNewChoiceTarget: (target: string) => void;
  sceneList: string[];
  handlePickBg: () => void;
  handlePickAudio: (target: 'voice' | 'music') => void;
  setLibraryTarget: (target: 'bg' | 'voice' | 'music' | null) => void;
  handleGraphNavigate: (id: string) => void;
  handleDeleteChoice: (id: string) => void;
  handleAddChoice: () => void;
  handleAddScene: () => void;
  handleDeleteScene: (id: string) => void;
  colors: any;
  FilePickerRow: any;
  storyId: string;
}

export const EditTab: React.FC<EditTabProps> = ({
  scene,
  sceneText,
  setSceneText,
  backgroundUri,
  setBackgroundUri,
  voiceUri,
  setVoiceUri,
  musicUri,
  setMusicUri,
  splashConfig,
  setSplashConfig,
  interactiveObjects,
  setInteractiveObjects,
  newChoiceText,
  setNewChoiceText,
  newChoiceTarget,
  setNewChoiceTarget,
  sceneList,
  handlePickBg,
  handlePickAudio,
  setLibraryTarget,
  handleGraphNavigate,
  handleDeleteChoice,
  handleAddChoice,
  handleAddScene,
  handleDeleteScene,
  colors,
  FilePickerRow,
  storyId,
}) => {
  const router = useRouter();

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Dialogue Text */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
          Dialogue Text
          <Text style={{ color: colors.muted, fontWeight: '400' }}>{' '}(use &quot;Name: text&quot; for speaker name)</Text>
        </Text>
        <TextInput
          style={{ backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.foreground, fontSize: 14, minHeight: 100, textAlignVertical: 'top' }}
          placeholder="Enter dialogue... or 'Elena: Hello there!'"
          placeholderTextColor={colors.muted}
          value={sceneText}
          onChangeText={setSceneText}
          multiline
        />
      </View>

      {/* Media */}
      <FilePickerRow
        label="Background Image (JPG/PNG)"
        value={backgroundUri}
        isImage
        onPick={handlePickBg}
        onLibrary={() => setLibraryTarget('bg')}
        onClear={() => setBackgroundUri('')}
        colors={colors}
      />
      <FilePickerRow
        label="Voice Audio (MP3)"
        value={voiceUri}
        onPick={() => handlePickAudio('voice')}
        onLibrary={() => setLibraryTarget('voice')}
        onClear={() => setVoiceUri('')}
        colors={colors}
      />
      <FilePickerRow
        label="Background Music (MP3)"
        value={musicUri}
        onPick={() => handlePickAudio('music')}
        onLibrary={() => setLibraryTarget('music')}
        onClear={() => setMusicUri('')}
        colors={colors}
      />

      <SplashScreenEditor config={splashConfig} onChange={setSplashConfig} />
      <InteractiveObjectsEditor objects={interactiveObjects} onChange={setInteractiveObjects} />

      {/* Choices */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 12 }}>
          Choices ({scene.choices.length})
        </Text>
        {scene.choices.map((choice) => (
          <View key={choice.id} style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: colors.foreground, marginBottom: 3 }}>{choice.text}</Text>
                <Pressable onPress={() => handleGraphNavigate(choice.nextSceneId)}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>→ {choice.nextSceneId}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => handleDeleteChoice(choice.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 6 })}>
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <TextInput
            style={{ backgroundColor: colors.background, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 9, color: colors.foreground, fontSize: 13, marginBottom: 8 }}
            placeholder="Choice text..."
            placeholderTextColor={colors.muted}
            value={newChoiceText}
            onChangeText={setNewChoiceText}
          />
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Target scene:</Text>
          <View style={{ backgroundColor: colors.background, borderRadius: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 8, maxHeight: 110 }}>
            <FlatList
              data={sceneList}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: newChoiceTarget === item ? colors.primary : 'transparent', opacity: pressed ? 0.7 : 1 })}
                  onPress={() => setNewChoiceTarget(item)}
                >
                  <Text style={{ color: newChoiceTarget === item ? '#fff' : colors.foreground, fontSize: 12 }}>{item}</Text>
                </Pressable>
              )}
              keyExtractor={(item) => item}
              scrollEnabled={false}
            />
          </View>
          <Pressable
            style={({ pressed }) => ({ backgroundColor: colors.primary, paddingVertical: 9, borderRadius: 8, opacity: pressed ? 0.8 : 1 })}
            onPress={handleAddChoice}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>+ Add Choice</Text>
          </Pressable>
        </View>
      </View>

      {/* Scene list */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground, marginBottom: 12 }}>
          All Scenes ({sceneList.length})
        </Text>
        <FlatList
          data={sceneList}
          numColumns={2}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => ({ flex: 1, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: scene.id === item ? colors.primary : colors.background, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: scene.id === item ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 })}
              onPress={() => handleGraphNavigate(item)}
              onLongPress={() => handleDeleteScene(item)}
            >
              <Text style={{ color: scene.id === item ? '#fff' : colors.foreground, fontSize: 12, fontWeight: scene.id === item ? '700' : '400' }} numberOfLines={1}>{item}</Text>
            </Pressable>
          )}
          keyExtractor={(item) => item}
          scrollEnabled={false}
        />
        <Pressable
          style={({ pressed }) => ({ backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 8, marginTop: 10, opacity: pressed ? 0.8 : 1 })}
          onPress={handleAddScene}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>+ Add New Scene</Text>
        </Pressable>
        <Text style={{ fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 6 }}>Long-press a scene to delete</Text>
      </View>

      {/* Preview */}
      <Pressable
        style={({ pressed }) => ({ backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 10, marginBottom: 28, opacity: pressed ? 0.8 : 1 })}
        onPress={() => router.push({ pathname: '../reader', params: { storyId } })}
      >
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>▶ Preview Story</Text>
      </Pressable>
    </ScrollView>
  );
};
