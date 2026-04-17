import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenContainer } from '@/components/screen-container';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { Story, StoryScene, Choice } from '@/lib/types';
import * as storyContextEnhanced from '@/lib/story-context-enhanced';
import { MediaLibrary, LibraryAsset, addAssetToLibrary } from '@/components/media-library';
import { SceneGraph } from '@/components/scene-graph';
import { SplashScreenEditor } from '@/components/SplashScreenEditor';
import { InteractiveObjectsEditor } from '@/components/InteractiveObjectsEditor';
import type { SplashScreenConfig } from '@/lib/splash-types';
import type { InteractiveObject } from '@/lib/interactive-types';

type Tab = 'edit' | 'graph';

// ── Reusable file-picker row component ────────────────────────────────────
interface FilePickerRowProps {
  label: string;
  value: string;
  onPick: () => void;
  onLibrary: () => void;
  onClear: () => void;
  isImage?: boolean;
  colors: ReturnType<typeof useColors>;
}

const FilePickerRow = React.memo(({
  label,
  value,
  onPick,
  onLibrary,
  onClear,
  isImage = false,
  colors,
}: FilePickerRowProps) => {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 6 }}>{label}</Text>
      {isImage && value ? (
        <Image
          source={{ uri: value }}
          style={{ width: '100%', height: 110, borderRadius: 8, marginBottom: 8, backgroundColor: colors.surface }}
          resizeMode="cover"
        />
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 8 }}>
        <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 13 }} numberOfLines={1}>
          {value ? value.split('/').pop() : 'No file selected'}
        </Text>
      </View>

      {/* Buttons Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => {
            onPick();
          }}
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>📂 Pick File</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            onLibrary();
          }}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: value ? 8 : 0,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>🗂 Library</Text>
        </Pressable>

        {value ? (
          <Pressable
            onPress={() => {
              onClear();
            }}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.error,
            }}
          >
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: '600' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

FilePickerRow.displayName = 'FilePickerRow';

export default function SceneEditorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId, sceneId } = useLocalSearchParams();
  const { stories, loadStories } = useStory();

  const [story, setStory] = useState<Story | null>(null);
  const [scene, setScene] = useState<StoryScene | null>(null);
  const [sceneText, setSceneText] = useState('');
  const [backgroundUri, setBackgroundUri] = useState('');
  const [voiceUri, setVoiceUri] = useState('');
  const [musicUri, setMusicUri] = useState('');
  const [splashConfig, setSplashConfig] = useState<SplashScreenConfig | undefined>(undefined);
  const [interactiveObjects, setInteractiveObjects] = useState<InteractiveObject[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [newChoiceTarget, setNewChoiceTarget] = useState('');
  const [sceneList, setSceneList] = useState<string[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('edit');
  const [libraryTarget, setLibraryTarget] = useState<'bg' | 'voice' | 'music' | null>(null);

  const loadSceneData = useCallback(() => {
    if (!storyId || typeof storyId !== 'string') return;
    const foundStory = stories.find((s) => s.id === storyId);
    if (!foundStory) return;

    setStory(foundStory);
    setSceneList(Object.keys(foundStory.scenes));

    const sceneIdStr = typeof sceneId === 'string' ? sceneId : foundStory.startSceneId;
    const foundScene = foundStory.scenes[sceneIdStr];
    if (foundScene) {
      setScene(foundScene);
      setSceneText(foundScene.text);
      setBackgroundUri(foundScene.backgroundImageUri || '');
      setVoiceUri(foundScene.voiceAudioUri || '');
      setMusicUri(foundScene.musicUri || '');
      setSplashConfig(foundScene.splashScreen);
      setInteractiveObjects(foundScene.interactiveObjects || []);
    }
  }, [storyId, sceneId, stories]);

  useEffect(() => { loadSceneData(); }, [loadSceneData]);

  // ── File pickers ──────────────────────────────────────────────────────────

  const handlePickBg = async () => {
    try {
      // Request permissions first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        const name = result.assets[0].fileName ?? uri.split('/').pop() ?? 'image';
        const asset = await addAssetToLibrary(uri, name, 'image');
        setBackgroundUri(asset.uri);
        Alert.alert('Success', 'Image added! Don\'t forget to Save.');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image: ' + error);
    }
  };

  const handlePickAudio = async (target: 'voice' | 'music') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets[0]) {
        const { uri, name } = result.assets[0];
        const asset = await addAssetToLibrary(uri, name ?? 'audio', 'audio');

        if (target === 'voice') {
          setVoiceUri(asset.uri);
          Alert.alert('Success', 'Voice audio added! Don\'t forget to Save.');
        } else {
          setMusicUri(asset.uri);
          Alert.alert('Success', 'Background music added! Don\'t forget to Save.');
        }
      } else {
      }
    } catch (error) {
      console.error('Error picking audio:', error);
      Alert.alert('Error', 'Failed to pick audio file: ' + error);
    }
  };

  const handleLibrarySelect = (asset: LibraryAsset) => {
    if (libraryTarget === 'bg') {
      setBackgroundUri(asset.uri);
    } else if (libraryTarget === 'voice') {
      setVoiceUri(asset.uri);
    } else if (libraryTarget === 'music') {
      setMusicUri(asset.uri);
    }
    setLibraryTarget(null);
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSaveScene = async () => {
    if (!story || !scene) return;
    try {
      const updatedScene: StoryScene = {
        ...scene,
        text: sceneText,
        backgroundImageUri: backgroundUri || undefined,
        voiceAudioUri: voiceUri || undefined,
        musicUri: musicUri || undefined,
        splashScreen: splashConfig,
        interactiveObjects: interactiveObjects.length > 0 ? interactiveObjects : undefined,
      };
      await storyContextEnhanced.updateScene(story.id, updatedScene);
      setScene(updatedScene);
      await loadStories();
      Alert.alert('Saved', 'Scene saved successfully!');
    } catch { Alert.alert('Error', 'Failed to save scene'); }
  };

  const handleAddScene = async () => {
    if (!story) return;
    const newSceneId = `scene_${Date.now()}`;
    const newScene: StoryScene = {
      id: newSceneId, text: 'New scene...', backgroundImageUri: undefined,
      characters: [], voiceAudioUri: undefined, choices: [], musicUri: undefined,
    };
    try {
      await storyContextEnhanced.addScene(story.id, newScene);
      setSceneList([...sceneList, newSceneId]);
      await loadStories();
      Alert.alert('Created', `Scene "${newSceneId}" added.`);
    } catch { Alert.alert('Error', 'Failed to create scene'); }
  };

  const handleDeleteScene = async (sceneIdToDelete: string) => {
    if (!story || sceneIdToDelete === story.startSceneId) {
      Alert.alert('Error', 'Cannot delete the start scene');
      return;
    }
    Alert.alert('Delete Scene', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await storyContextEnhanced.deleteScene(story.id, sceneIdToDelete);
            setSceneList(sceneList.filter((s) => s !== sceneIdToDelete));
            await loadStories();
            if (scene?.id === sceneIdToDelete) router.back();
          } catch { Alert.alert('Error', 'Failed to delete scene'); }
        },
      },
    ]);
  };

  const handleAddChoice = async () => {
    if (!newChoiceText.trim() || !newChoiceTarget.trim()) {
      Alert.alert('Error', 'Fill in both choice text and target scene');
      return;
    }
    if (!story || !scene) return;
    const newChoice: Choice = {
      id: `choice-${Date.now()}`,
      text: newChoiceText,
      nextSceneId: newChoiceTarget,
    };
    try {
      const updated: StoryScene = { ...scene, choices: [...scene.choices, newChoice] };
      await storyContextEnhanced.updateScene(story.id, updated);
      setScene(updated);
      setNewChoiceText('');
      setNewChoiceTarget('');
    } catch { Alert.alert('Error', 'Failed to add choice'); }
  };

  const handleDeleteChoice = async (choiceId: string) => {
    if (!story || !scene) return;
    try {
      await storyContextEnhanced.deleteChoice(story.id, scene.id, choiceId);
      setScene({ ...scene, choices: scene.choices.filter((c) => c.id !== choiceId) });
    } catch { Alert.alert('Error', 'Failed to delete choice'); }
  };

  const handleGraphLink = async (fromId: string, toId: string) => {
    if (!story) return;
    const fromScene = story.scenes[fromId];
    if (!fromScene) return;
    const newChoice: Choice = {
      id: `choice-${Date.now()}`,
      text: `Go to ${toId}`,
      nextSceneId: toId,
    };
    const updated: StoryScene = { ...fromScene, choices: [...fromScene.choices, newChoice] };
    await storyContextEnhanced.updateScene(story.id, updated);
    await loadStories();
  };

  const handleGraphNavigate = (targetSceneId: string) => {
    router.push({ pathname: '../scene-editor', params: { storyId: story?.id, sceneId: targetSceneId } });
  };

  if (!story || !scene) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Loading scene...</Text>
      </ScreenContainer>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="p-4">
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>Scene Editor</Text>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 1 }}>{scene.id}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 })}
            onPress={handleSaveScene}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>💾 Save</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
            onPress={() => router.back()}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Back</Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 0, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: colors.border }}>
        {(['edit', 'graph'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 7, backgroundColor: activeTab === tab ? colors.primary : 'transparent', alignItems: 'center' }}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={{ color: activeTab === tab ? '#fff' : colors.muted, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
              {tab === 'edit' ? '✏️ Edit' : '🗺 Graph'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── EDIT TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'edit' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

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

          {/* Splash Screen Editor */}
          <SplashScreenEditor
            config={splashConfig}
            onChange={setSplashConfig}
          />

          {/* Interactive Objects Editor */}
          <InteractiveObjectsEditor
            objects={interactiveObjects}
            onChange={setInteractiveObjects}
          />

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

            {/* Add choice */}
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
                  scrollEnabled
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
            onPress={() => router.push({ pathname: '../reader', params: { storyId: story.id } })}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>▶ Preview Story</Text>
          </Pressable>

        </ScrollView>
      )}

      {/* ── GRAPH TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'graph' && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>
            Tap a node to navigate to that scene. Use Link Mode to connect scenes with a new choice.
          </Text>
          <SceneGraph
            story={story}
            currentSceneId={scene.id}
            onNavigate={handleGraphNavigate}
            onLinkScenes={handleGraphLink}
          />
        </ScrollView>
      )}

      {/* ── Media Library drawer ────────────────────────────────────────── */}
      <MediaLibrary
        visible={libraryTarget !== null}
        type={libraryTarget === 'bg' ? 'image' : 'audio'}
        onSelect={handleLibrarySelect}
        onClose={() => setLibraryTarget(null)}
      />
    </ScreenContainer>
  );
}
