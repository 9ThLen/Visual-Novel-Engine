/**
 * Interactive Objects Editor Component
 * UI for adding and configuring interactive objects in scenes
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  type InteractiveObject,
  type InteractiveObjectPosition,
  INTERACTIVE_PRESETS,
} from '@/lib/interactive-types';

interface Props {
  objects: InteractiveObject[];
  onChange: (objects: InteractiveObject[]) => void;
}

export function InteractiveObjectsEditor({ objects, onChange }: Props) {
  const colors = useColors();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  const selectedObject = objects.find((obj) => obj.id === selectedObjectId);

  const handleAddFromPreset = (presetId: string) => {
    const preset = INTERACTIVE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const newObject: InteractiveObject = {
      ...preset.template,
      id: `obj_${Date.now()}`,
    };

    onChange([...objects, newObject]);
    setSelectedObjectId(newObject.id);
  };

  const handleDeleteObject = (objectId: string) => {
    Alert.alert(t('editor.objects.delete'), t('editor.objects.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          onChange(objects.filter((obj) => obj.id !== objectId));
          if (selectedObjectId === objectId) {
            setSelectedObjectId(null);
          }
        },
      },
    ]);
  };

  const handleUpdateObject = (updates: Partial<InteractiveObject>) => {
    if (!selectedObjectId) return;

    onChange(
      objects.map((obj) =>
        obj.id === selectedObjectId ? { ...obj, ...updates } : obj
      )
    );
  };

  const handleUpdatePosition = (updates: Partial<InteractiveObjectPosition>) => {
    if (!selectedObject) return;

    const currentPos = selectedObject.position || { x: 0, y: 0, width: 0, height: 0 };
    handleUpdateObject({
      position: { ...currentPos, ...updates },
    });
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: expanded ? 12 : 0,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconSymbol name="location" size={16} color={colors.foreground} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
            {t('editor.objects.title', { count: String(objects.length) })}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600' }}>
            <IconSymbol
              name={expanded ? 'chevron.up' : 'chevron.down'}
              size={12}
              color={colors.foreground}
            />
          </Text>
        </Pressable>
      </View>

      {expanded && (
        <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
          {/* Presets */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.muted,
                marginBottom: 8,
              }}
            >
              {t('editor.objects.addFromPreset')}
            </Text>
            <View style={{ gap: 6 }}>
              {INTERACTIVE_PRESETS.map((preset) => (
                <Pressable
                  key={preset.id}
                  style={({ pressed }) => ({
                    backgroundColor: colors.background,
                    borderRadius: 8,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  onPress={() => handleAddFromPreset(preset.id)}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.foreground,
                      marginBottom: 2,
                    }}
                  >
                    + {preset.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {preset.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Object List */}
          {objects.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.muted,
                  marginBottom: 8,
                }}
              >
                {t('editor.objects.objects')}
              </Text>
              <View style={{ gap: 6 }}>
                {objects.map((obj) => (
                  <Pressable
                    key={obj.id}
                    style={({ pressed }) => ({
                      backgroundColor:
                        selectedObjectId === obj.id ? colors.primary : colors.background,
                      borderRadius: 8,
                      padding: 10,
                      borderWidth: 1,
                      borderColor:
                        selectedObjectId === obj.id ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    })}
                    onPress={() => setSelectedObjectId(obj.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color:
                             selectedObjectId === obj.id ? colors['text-inverse'] : colors.foreground,
                        }}
                      >
                        {obj.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: selectedObjectId === obj.id ? colors['text-inverse'] : colors.muted,
                        }}
                      >
                        {t('editor.objects.actionCount', { count: String(obj.actions?.length ?? 0) })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteObject(obj.id)}
                      style={({ pressed }) => ({
                        padding: 6,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <IconSymbol name="delete" size={16} color={colors.error} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Object Editor */}
          {selectedObject && (
            <View
              style={{
                backgroundColor: colors.background,
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.foreground,
                  marginBottom: 12,
                }}
              >
                {t('editor.objects.edit', { name: selectedObject.name ?? t('editor.objects.name') })}
              </Text>

              {/* Name */}
              <View style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 4,
                  }}
                >
                  {t('editor.objects.name')}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 8,
                    color: colors.foreground,
                    fontSize: 13,
                  }}
                  value={selectedObject.name}
                  onChangeText={(text) => handleUpdateObject({ name: text })}
                  placeholder={t('editor.objects.namePlaceholder')}
                  placeholderTextColor={colors.muted}
                />
              </View>

              {/* Position */}
              <View style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 8,
                  }}
                >
                  {t('editor.objects.positionPercent')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <View key={key} style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          marginBottom: 2,
                        }}
                      >
                        {key.toUpperCase()}
                      </Text>
                      <TextInput
                        style={{
                          backgroundColor: colors.surface,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: colors.border,
                          padding: 6,
                          color: colors.foreground,
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                        value={String(selectedObject.position?.[key] ?? 0)}
                        onChangeText={(text) => {
                          const num = parseFloat(text) || 0;
                          handleUpdatePosition({ [key]: num });
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* Actions Summary */}
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 4,
                  }}
                >
                  {t('editor.objects.actions', { count: String(selectedObject.actions.length) })}
                </Text>
                {selectedObject.actions.map((action, index) => (
                  <View
                    key={`action-${index}`}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 6,
                      padding: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: colors.foreground }}>
                      {action.type}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
