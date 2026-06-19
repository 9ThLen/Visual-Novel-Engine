/**
 * components/editor/modals/SaveSceneDialog.tsx — Save/Load scene dialogs
 */

import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, FlatList,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { withAlpha } from '@/lib/_core/theme';

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
  const { t } = useI18n();

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
        backgroundColor: colors.backdrop,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '90%',
          maxWidth: 500,
          backgroundColor: colors['surface-container'],
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
              {t('editor.saveScene')}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
              <IconSymbol name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
                color: colors.muted, marginBottom: 6,
              }}>
                {t('editor.sceneName')}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('editor.sceneNamePlaceholder')}
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
                {t('common.description')}
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('editor.optionalDescription')}
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
                {t('editor.tags')}
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
                      backgroundColor: withAlpha(colors.primary, 0.13),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common.delete')} ${tag}`}
                  >
                    <Text style={{ fontSize: 11, color: colors.primary }}>{tag}</Text>
                    <IconSymbol name="close" size={10} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder={t('editor.addTagPlaceholder')}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('editor.addTag')}
                >
                  <Text style={{ fontSize: 12, color: colors['text-inverse'], fontWeight: '600' }}>{t('editor.addTag')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{t('common.cancel')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
            >
              <Text style={{ fontSize: 13, color: colors['text-inverse'], fontWeight: '600' }}>{t('common.save')}</Text>
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
  scenes: { id: string; name: string; description?: string; updatedAt: number }[];
}

export function LoadSceneDialog({ visible, onClose, onLoad, scenes }: LoadSceneDialogProps) {
  const colors = useColors();
  const { t } = useI18n();
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
        backgroundColor: colors.backdrop,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: '90%',
          maxWidth: 600,
          maxHeight: '70%',
          backgroundColor: colors['surface-container'],
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
              {t('editor.loadScene')}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
              <IconSymbol name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('editor.searchScenes')}
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
                accessibilityRole="button"
                accessibilityLabel={item.name}
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
                  {t('common.updated')}: {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.muted }}>{t('editor.noScenesFound')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: '600' }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
