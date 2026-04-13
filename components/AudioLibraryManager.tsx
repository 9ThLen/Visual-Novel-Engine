/**
 * Audio Library Manager Component
 * UI for managing story-specific audio library
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '@/hooks/use-colors';
import type { AudioLibraryItem } from '@/lib/audio-types';
import * as audioLibrary from '@/lib/audio-library';

interface Props {
  storyId: string;
  visible: boolean;
  onClose: () => void;
  onSelect?: (item: AudioLibraryItem) => void;
  filterType?: AudioLibraryItem['type'];
}

export function AudioLibraryManager({
  storyId,
  visible,
  onClose,
  onSelect,
  filterType,
}: Props) {
  const colors = useColors();
  const [library, setLibrary] = useState<AudioLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<AudioLibraryItem['type'] | 'all'>(
    filterType || 'all'
  );
  const [editingItem, setEditingItem] = useState<AudioLibraryItem | null>(null);

  useEffect(() => {
    if (visible) {
      loadLibrary();
    }
  }, [visible, storyId]);

  const loadLibrary = async () => {
    const items = await audioLibrary.getAudioLibrary(storyId);
    setLibrary(items);
  };

  const handleAddAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const { uri, name } = result.assets[0];

      // Prompt for details
      Alert.prompt(
        'Audio Name',
        'Enter a name for this audio:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: async (audioName?: string) => {
              if (!audioName?.trim()) return;

              const newItem = await audioLibrary.addAudioToLibrary(storyId, {
                name: audioName,
                uri,
                type: selectedType === 'all' ? 'sfx' : selectedType,
                loop: false,
                volume: 1,
                tags: [],
              });

              setLibrary([...library, newItem]);
              Alert.alert('Success', 'Audio added to library');
            },
          },
        ],
        'plain-text',
        name.replace(/\.[^/.]+$/, '') // Default name without extension
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to add audio');
      console.error(error);
    }
  };

  const handleDeleteAudio = async (audioId: string) => {
    Alert.alert('Delete Audio', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await audioLibrary.deleteAudioFromLibrary(storyId, audioId);
            setLibrary(library.filter((item) => item.id !== audioId));
          } catch {
            Alert.alert('Error', 'Failed to delete audio');
          }
        },
      },
    ]);
  };

  const handleEditAudio = (item: AudioLibraryItem) => {
    setEditingItem(item);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    try {
      await audioLibrary.updateAudioInLibrary(storyId, editingItem.id, editingItem);
      setLibrary(
        library.map((item) => (item.id === editingItem.id ? editingItem : item))
      );
      setEditingItem(null);
      Alert.alert('Success', 'Audio updated');
    } catch {
      Alert.alert('Error', 'Failed to update audio');
    }
  };

  const filteredLibrary = library.filter((item) => {
    const typeMatch = selectedType === 'all' || item.type === selectedType;
    const searchMatch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return typeMatch && searchMatch;
  });

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Audio Library
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>

        {/* Search & Filter */}
        <View style={styles.controls}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="Search by name or tag..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeFilter}
          >
            {(['all', 'music', 'sfx', 'voice', 'ambient'] as const).map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor:
                      selectedType === type ? colors.primary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setSelectedType(type)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: selectedType === type ? '#fff' : colors.foreground },
                  ]}
                >
                  {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Library List */}
        <FlatList
          data={filteredLibrary}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.item,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                  <Text style={[styles.itemName, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                  <View
                    style={[
                      styles.typeBadge,
                      { backgroundColor: getTypeColor(item.type) },
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                </View>

                <Text style={[styles.itemUri, { color: colors.muted }]} numberOfLines={1}>
                  {item.uri.split('/').pop()}
                </Text>

                {item.tags && item.tags.length > 0 && (
                  <View style={styles.tags}>
                    {item.tags.map((tag, i) => (
                      <View
                        key={i}
                        style={[styles.tag, { backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.tagText, { color: colors.muted }]}>
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.itemMeta}>
                  <Text style={[styles.metaText, { color: colors.muted }]}>
                    Vol: {Math.round((item.volume ?? 1) * 100)}%
                  </Text>
                  {item.loop && (
                    <Text style={[styles.metaText, { color: colors.muted }]}>
                      🔁 Loop
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.itemActions}>
                {onSelect && (
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <Text style={styles.actionButtonText}>Use</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                  ]}
                  onPress={() => handleEditAudio(item)}
                >
                  <Text style={[styles.actionButtonText, { color: colors.foreground }]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.error }]}
                  onPress={() => handleDeleteAudio(item.id)}
                >
                  <Text style={styles.actionButtonText}>Del</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                No audio files in library
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                Tap + to add audio files
              </Text>
            </View>
          }
        />

        {/* Add Button */}
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={handleAddAudio}
        >
          <Text style={styles.addButtonText}>+ Add Audio</Text>
        </Pressable>

        {/* Edit Modal */}
        {editingItem && (
          <View style={[styles.editModal, { backgroundColor: colors.background }]}>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>
              Edit Audio
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
              placeholder="Name"
              placeholderTextColor={colors.muted}
              value={editingItem.name}
              onChangeText={(text) =>
                setEditingItem({ ...editingItem, name: text })
              }
            />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Tags (comma-separated)"
              placeholderTextColor={colors.muted}
              value={editingItem.tags?.join(', ') || ''}
              onChangeText={(text) =>
                setEditingItem({
                  ...editingItem,
                  tags: text.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
            />

            <View style={styles.editActions}>
              <Pressable
                style={[styles.editButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.editButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editButton,
                  { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
                onPress={() => setEditingItem(null)}
              >
                <Text style={[styles.editButtonText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function getTypeColor(type: AudioLibraryItem['type']): string {
  switch (type) {
    case 'music':
      return '#8B5CF6';
    case 'sfx':
      return '#F59E0B';
    case 'voice':
      return '#10B981';
    case 'ambient':
      return '#3B82F6';
    default:
      return '#6B7280';
  }
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
  },
  controls: {
    padding: 12,
    gap: 8,
  },
  searchInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 14,
  },
  typeFilter: {
    flexDirection: 'row',
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    padding: 12,
    gap: 8,
  },
  item: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  itemUri: {
    fontSize: 11,
    marginBottom: 6,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    fontSize: 11,
  },
  itemActions: {
    gap: 4,
  },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  addButton: {
    margin: 12,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
  },
  editModal: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
