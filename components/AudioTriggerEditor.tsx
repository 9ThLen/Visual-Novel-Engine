/**
 * Audio Trigger Editor Component
 * UI for configuring audio triggers in scenes
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { AudioTrigger, AudioLibraryItem, AudioTriggerType } from '@/lib/audio-types';
import { AudioLibraryManager } from './AudioLibraryManager';

interface Props {
  storyId: string;
  triggers: AudioTrigger[];
  onChange: (triggers: AudioTrigger[]) => void;
}

const TRIGGER_TYPES: { value: AudioTriggerType; label: string; icon: string }[] = [
  { value: 'scene_start', label: 'Scene Start', icon: '▶️' },
  { value: 'text_complete', label: 'Text Complete', icon: '✅' },
  { value: 'delay', label: 'Delay', icon: '⏱' },
  { value: 'choice_shown', label: 'Choices Shown', icon: '🔀' },
  { value: 'manual', label: 'Manual', icon: '🎮' },
];

export function AudioTriggerEditor({ storyId, triggers, onChange }: Props) {
  const colors = useColors();
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<AudioTrigger | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<AudioLibraryItem | null>(null);

  const handleAddTrigger = () => {
    setEditingTrigger({
      id: `trigger_${Date.now()}`,
      audioId: '',
      triggerType: 'scene_start',
      volume: 1,
      loop: false,
      stopPrevious: false,
    });
    setShowLibrary(true);
  };

  const handleSelectAudio = (audio: AudioLibraryItem) => {
    setSelectedAudio(audio);
    if (editingTrigger) {
      setEditingTrigger({
        ...editingTrigger,
        audioId: audio.id,
        volume: audio.volume ?? 1,
        loop: audio.loop ?? false,
      });
    }
  };

  const handleSaveTrigger = () => {
    if (!editingTrigger || !editingTrigger.audioId) {
      Alert.alert('Error', 'Please select an audio file');
      return;
    }

    const existing = triggers.find((t) => t.id === editingTrigger.id);
    if (existing) {
      onChange(triggers.map((t) => (t.id === editingTrigger.id ? editingTrigger : t)));
    } else {
      onChange([...triggers, editingTrigger]);
    }

    setEditingTrigger(null);
    setSelectedAudio(null);
  };

  const handleDeleteTrigger = (triggerId: string) => {
    Alert.alert('Delete Trigger', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onChange(triggers.filter((t) => t.id !== triggerId)),
      },
    ]);
  };

  const handleEditTrigger = (trigger: AudioTrigger) => {
    setEditingTrigger({ ...trigger });
  };

  return (
    <View style={styles.container}>
      {/* Trigger List */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Audio Triggers ({triggers.length})
        </Text>
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={handleAddTrigger}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {triggers.map((trigger) => (
          <View
            key={trigger.id}
            style={[
              styles.triggerCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.triggerHeader}>
              <View style={styles.triggerInfo}>
                <Text style={[styles.triggerType, { color: colors.primary }]}>
                  {TRIGGER_TYPES.find((t) => t.value === trigger.triggerType)?.icon}{' '}
                  {TRIGGER_TYPES.find((t) => t.value === trigger.triggerType)?.label}
                </Text>
                <Text style={[styles.audioId, { color: colors.muted }]} numberOfLines={1}>
                  Audio: {trigger.audioId}
                </Text>
              </View>
              <View style={styles.triggerActions}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => handleEditTrigger(trigger)}
                >
                  <Text style={{ color: colors.primary }}>✏️</Text>
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => handleDeleteTrigger(trigger.id)}
                >
                  <Text style={{ color: colors.error }}>🗑</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.triggerMeta}>
              {trigger.delay && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  ⏱ {trigger.delay}ms
                </Text>
              )}
              {trigger.loop && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>🔁 Loop</Text>
              )}
              {trigger.fadeIn && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  ↗️ Fade {trigger.fadeIn}ms
                </Text>
              )}
              {trigger.stopPrevious && (
                <Text style={[styles.metaItem, { color: colors.muted }]}>
                  ⏹ Stop Previous
                </Text>
              )}
              <Text style={[styles.metaItem, { color: colors.muted }]}>
                Vol: {Math.round((trigger.volume ?? 1) * 100)}%
              </Text>
            </View>
          </View>
        ))}

        {triggers.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No audio triggers
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
              Tap + Add to create triggers
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      {editingTrigger && (
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingTrigger.audioId ? 'Edit' : 'Add'} Audio Trigger
            </Text>

            {/* Selected Audio */}
            {selectedAudio && (
              <View
                style={[
                  styles.selectedAudio,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.selectedAudioText, { color: colors.foreground }]}>
                  🎵 {selectedAudio.name}
                </Text>
                <Pressable onPress={() => setShowLibrary(true)}>
                  <Text style={[styles.changeButton, { color: colors.primary }]}>
                    Change
                  </Text>
                </Pressable>
              </View>
            )}

            {!selectedAudio && (
              <Pressable
                style={[styles.selectButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowLibrary(true)}
              >
                <Text style={styles.selectButtonText}>Select Audio from Library</Text>
              </Pressable>
            )}

            {/* Trigger Type */}
            <Text style={[styles.label, { color: colors.foreground }]}>Trigger Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typeButtons}>
                {TRIGGER_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor:
                          editingTrigger.triggerType === type.value
                            ? colors.primary
                            : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      setEditingTrigger({ ...editingTrigger, triggerType: type.value })
                    }
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        {
                          color:
                            editingTrigger.triggerType === type.value
                              ? '#fff'
                              : colors.foreground,
                        },
                      ]}
                    >
                      {type.icon} {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Delay (for delay type) */}
            {editingTrigger.triggerType === 'delay' && (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Delay (milliseconds)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder="e.g., 2000"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={editingTrigger.delay?.toString() || ''}
                  onChangeText={(text) =>
                    setEditingTrigger({
                      ...editingTrigger,
                      delay: parseInt(text) || 0,
                    })
                  }
                />
              </>
            )}

            {/* Volume */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Volume: {Math.round((editingTrigger.volume ?? 1) * 100)}%
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="0-100"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={Math.round((editingTrigger.volume ?? 1) * 100).toString()}
              onChangeText={(text) =>
                setEditingTrigger({
                  ...editingTrigger,
                  volume: Math.max(0, Math.min(100, parseInt(text) || 0)) / 100,
                })
              }
            />

            {/* Options */}
            <View style={styles.options}>
              <Pressable
                style={styles.option}
                onPress={() =>
                  setEditingTrigger({ ...editingTrigger, loop: !editingTrigger.loop })
                }
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>
                  {editingTrigger.loop ? '☑' : '☐'} Loop
                </Text>
              </Pressable>
              <Pressable
                style={styles.option}
                onPress={() =>
                  setEditingTrigger({
                    ...editingTrigger,
                    stopPrevious: !editingTrigger.stopPrevious,
                  })
                }
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>
                  {editingTrigger.stopPrevious ? '☑' : '☐'} Stop Previous
                </Text>
              </Pressable>
            </View>

            {/* Fade In */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Fade In (ms, optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="e.g., 500"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={editingTrigger.fadeIn?.toString() || ''}
              onChangeText={(text) =>
                setEditingTrigger({
                  ...editingTrigger,
                  fadeIn: parseInt(text) || undefined,
                })
              }
            />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveTrigger}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => {
                  setEditingTrigger(null);
                  setSelectedAudio(null);
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Audio Library */}
      <AudioLibraryManager
        storyId={storyId}
        visible={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelect={handleSelectAudio}
      />
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
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  triggerCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  triggerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  triggerInfo: {
    flex: 1,
  },
  triggerType: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  audioId: {
    fontSize: 11,
  },
  triggerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  triggerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    fontSize: 10,
  },
  empty: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 11,
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  selectedAudio: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  selectedAudioText: {
    fontSize: 13,
    flex: 1,
  },
  changeButton: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  typeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  options: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  option: {
    paddingVertical: 6,
  },
  optionText: {
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
