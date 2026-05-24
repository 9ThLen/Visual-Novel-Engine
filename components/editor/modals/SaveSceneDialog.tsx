/**
 * components/editor/modals/SaveSceneDialog.tsx — Save/Load scene dialogs
 */

import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppStore } from '@/stores/use-app-store';
import type { ProjectScene } from '@/lib/engine/types';

// ── Save Dialog ────────────────────────────────────────────────────────────

interface SaveSceneDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, tags: string[]) => void;
  initialName?: string;
  initialDescription?: string;
}

export function SaveSceneDialog({
  visible,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
}: SaveSceneDialogProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim(), tags);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop || 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '90%',
          maxWidth: 500,
          backgroundColor: colors['surface-container'] || colors.surface,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
              Save Scene
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Scene Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter scene name..."
                placeholderTextColor={colors.muted}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                }}
              />
            </View>

            {/* Description */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.foreground,
                  minHeight: 70,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            {/* Tags */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                Tags
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {tags.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => handleRemoveTag(tag)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: colors.primary + '20',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: colors.primary }}>{tag}</Text>
                    <Text style={{ fontSize: 10, color: colors.primary }}>✕</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="Add tag..."
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={handleAddTag}
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    fontSize: 13,
                    color: colors.foreground,
                  }}
                />
                <Pressable
                  onPress={handleAddTag}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Add</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 8,
          }}>
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!name.trim()}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: name.trim() ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>Save Scene</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Load Dialog ────────────────────────────────────────────────────────────

interface LoadSceneDialogProps {
  visible: boolean;
  onClose: () => void;
  onLoad: (sceneId: string) => void;
  scenes: Array<{ id: string; name: string; description?: string; updatedAt: number }>;
}

export function LoadSceneDialog({ visible, onClose, onLoad, scenes }: LoadSceneDialogProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredScenes = scenes.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: colors.backdrop || 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '90%',
          maxWidth: 600,
          maxHeight: '70%',
          backgroundColor: colors['surface-container'] || colors.surface,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>
              Load Scene
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search scenes..."
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: colors.foreground,
              }}
            />
          </View>

          {/* Scene list */}
          <FlatList
            data={filteredScenes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onLoad(item.id); onClose(); }}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.foreground }}>
                  {item.name}
                </Text>
                {item.description && (
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {item.description}
                  </Text>
                )}
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
                  Updated: {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>No scenes found</Text>
              </View>
            }
          />

          {/* Footer */}
          <View style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            alignItems: 'flex-end',
          }}>
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
