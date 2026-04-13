/**
 * SceneEditorPanel Component
 * Right-side panel for editing selected scene details
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '@/hooks/use-colors';
import type { Story, StoryScene, Choice } from '@/lib/types';

interface Props {
  story: Story;
  sceneId: string | null;
  onSave: (scene: StoryScene) => Promise<void>;
  onAddChoice: (sceneId: string, choice: Choice) => Promise<void>;
  onDeleteChoice: (sceneId: string, choiceId: string) => Promise<void>;
  onNavigateToScene: (sceneId: string) => void;
}

export function SceneEditorPanel({
  story,
  sceneId,
  onSave,
  onAddChoice,
  onDeleteChoice,
  onNavigateToScene,
}: Props) {
  const colors = useColors();

  const [scene, setScene] = useState<StoryScene | null>(null);
  const [text, setText] = useState('');
  const [backgroundUri, setBackgroundUri] = useState('');
  const [voiceUri, setVoiceUri] = useState('');
  const [musicUri, setMusicUri] = useState('');
  const [newChoiceText, setNewChoiceText] = useState('');
  const [newChoiceTarget, setNewChoiceTarget] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load scene data when sceneId changes
  useEffect(() => {
    if (sceneId && story.scenes[sceneId]) {
      const s = story.scenes[sceneId];
      setScene(s);
      setText(s.text);
      setBackgroundUri(s.backgroundImageUri || '');
      setVoiceUri(s.voiceAudioUri || '');
      setMusicUri(s.musicUri || '');
      setHasChanges(false);
    } else {
      setScene(null);
    }
  }, [sceneId, story]);

  // Track changes
  useEffect(() => {
    if (!scene) return;
    const changed =
      text !== scene.text ||
      backgroundUri !== (scene.backgroundImageUri || '') ||
      voiceUri !== (scene.voiceAudioUri || '') ||
      musicUri !== (scene.musicUri || '');
    setHasChanges(changed);
  }, [text, backgroundUri, voiceUri, musicUri, scene]);

  const handleSave = async () => {
    if (!scene) return;
    const updated: StoryScene = {
      ...scene,
      text,
      backgroundImageUri: backgroundUri || undefined,
      voiceAudioUri: voiceUri || undefined,
      musicUri: musicUri || undefined,
    };
    await onSave(updated);
    setHasChanges(false);
  };

  const handleAddChoice = async () => {
    if (!scene || !newChoiceText.trim() || !newChoiceTarget.trim()) {
      Alert.alert('Error', 'Please fill in choice text and target scene');
      return;
    }
    const choice: Choice = {
      id: `choice-${Date.now()}`,
      text: newChoiceText,
      nextSceneId: newChoiceTarget,
    };
    await onAddChoice(scene.id, choice);
    setNewChoiceText('');
    setNewChoiceTarget('');
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setBackgroundUri(result.assets[0].uri);
    }
  };

  const handlePickAudio = async (type: 'voice' | 'music') => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      if (type === 'voice') setVoiceUri(result.assets[0].uri);
      else setMusicUri(result.assets[0].uri);
    }
  };

  if (!scene) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Select a scene to edit
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Click on a node in the graph
          </Text>
        </View>
      </View>
    );
  }

  const sceneList = Object.keys(story.scenes);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Scene Editor
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.primary }]}>
            {scene.id}
          </Text>
        </View>
        <Pressable
          style={[
            styles.saveButton,
            {
              backgroundColor: hasChanges ? colors.success : colors.surface,
              opacity: hasChanges ? 1 : 0.5,
            },
          ]}
          onPress={handleSave}
          disabled={!hasChanges}
        >
          <Text style={[styles.saveButtonText, { color: hasChanges ? '#fff' : colors.muted }]}>
            💾 Save
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Dialogue Text */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Dialogue Text
          </Text>
          <Text style={[styles.sectionHint, { color: colors.muted }]}>
            Use "Name: text" format for speaker names
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="Enter dialogue..."
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
          />
        </View>

        {/* Background Image */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Background Image
          </Text>
          {backgroundUri ? (
            <Image
              source={{ uri: backgroundUri }}
              style={[styles.imagePreview, { backgroundColor: colors.surface }]}
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={handlePickImage}
            >
              <Text style={styles.buttonText}>📂 Pick Image</Text>
            </Pressable>
            {backgroundUri ? (
              <Pressable
                style={[styles.button, { borderColor: colors.error, borderWidth: 1 }]}
                onPress={() => setBackgroundUri('')}
              >
                <Text style={[styles.buttonText, { color: colors.error }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Voice Audio */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Voice Audio
          </Text>
          <Text style={[styles.fileDisplay, { backgroundColor: colors.surface, color: colors.muted }]}>
            {voiceUri ? voiceUri.split('/').pop() : 'No file selected'}
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={() => handlePickAudio('voice')}
            >
              <Text style={styles.buttonText}>🎤 Pick Audio</Text>
            </Pressable>
            {voiceUri ? (
              <Pressable
                style={[styles.button, { borderColor: colors.error, borderWidth: 1 }]}
                onPress={() => setVoiceUri('')}
              >
                <Text style={[styles.buttonText, { color: colors.error }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Background Music */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Background Music
          </Text>
          <Text style={[styles.fileDisplay, { backgroundColor: colors.surface, color: colors.muted }]}>
            {musicUri ? musicUri.split('/').pop() : 'No file selected'}
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={() => handlePickAudio('music')}
            >
              <Text style={styles.buttonText}>🎵 Pick Audio</Text>
            </Pressable>
            {musicUri ? (
              <Pressable
                style={[styles.button, { borderColor: colors.error, borderWidth: 1 }]}
                onPress={() => setMusicUri('')}
              >
                <Text style={[styles.buttonText, { color: colors.error }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Choices */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Choices ({scene.choices.length})
          </Text>
          {scene.choices.map((choice) => (
            <View
              key={choice.id}
              style={[
                styles.choiceCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.choiceContent}>
                <Text style={[styles.choiceText, { color: colors.foreground }]}>
                  {choice.text}
                </Text>
                <Pressable onPress={() => onNavigateToScene(choice.nextSceneId)}>
                  <Text style={[styles.choiceTarget, { color: colors.primary }]}>
                    → {choice.nextSceneId}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDeleteChoice(scene.id, choice.id)}
              >
                <Text style={[styles.deleteButtonText, { color: colors.error }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          ))}

          {/* Add Choice */}
          <View style={[styles.addChoiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.addChoiceTitle, { color: colors.foreground }]}>
              Add New Choice
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
              ]}
              placeholder="Choice text..."
              placeholderTextColor={colors.muted}
              value={newChoiceText}
              onChangeText={setNewChoiceText}
            />
            <Text style={[styles.inputLabel, { color: colors.muted }]}>Target scene:</Text>
            <View style={[styles.sceneSelector, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <ScrollView style={styles.sceneSelectorScroll} nestedScrollEnabled>
                {sceneList.map((id) => (
                  <Pressable
                    key={id}
                    style={[
                      styles.sceneOption,
                      { backgroundColor: newChoiceTarget === id ? colors.primary : 'transparent' },
                    ]}
                    onPress={() => setNewChoiceTarget(id)}
                  >
                    <Text
                      style={[
                        styles.sceneOptionText,
                        { color: newChoiceTarget === id ? '#fff' : colors.foreground },
                      ]}
                    >
                      {id}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleAddChoice}
            >
              <Text style={styles.buttonText}>+ Add Choice</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 11,
    marginBottom: 8,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  imagePreview: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
  },
  fileDisplay: {
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  choiceCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  choiceContent: {
    flex: 1,
  },
  choiceText: {
    fontSize: 13,
    marginBottom: 4,
  },
  choiceTarget: {
    fontSize: 11,
    fontWeight: '600',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addChoiceCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
  },
  addChoiceTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    marginBottom: 6,
  },
  sceneSelector: {
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 12,
    maxHeight: 120,
  },
  sceneSelectorScroll: {
    maxHeight: 120,
  },
  sceneOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sceneOptionText: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
  },
});
