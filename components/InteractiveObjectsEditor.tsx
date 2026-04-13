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
import type {
  InteractiveObject,
  InteractiveAction,
  InteractiveObjectPosition,
} from '@/lib/interactive-types';
import { INTERACTIVE_PRESETS } from '@/lib/interactive-types';

interface Props {
  objects: InteractiveObject[];
  onChange: (objects: InteractiveObject[]) => void;
}

export function InteractiveObjectsEditor({ objects, onChange }: Props) {
  const colors = useColors();
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
    Alert.alert('Delete Object', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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

    handleUpdateObject({
      position: { ...selectedObject.position, ...updates },
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
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
          🎯 Interactive Objects ({objects.length})
        </Text>
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
            {expanded ? '▲' : '▼'}
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
              Add from Preset
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
                Objects
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
                            selectedObjectId === obj.id ? '#fff' : colors.foreground,
                        }}
                      >
                        {obj.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: selectedObjectId === obj.id ? '#fff' : colors.muted,
                        }}
                      >
                        {obj.actions.length} action(s)
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteObject(obj.id)}
                      style={({ pressed }) => ({
                        padding: 6,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>
                        🗑
                      </Text>
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
                Edit: {selectedObject.name}
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
                  Name
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
                  placeholder="Object name"
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
                  Position (%)
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
                        value={String(selectedObject.position[key])}
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
                  Actions ({selectedObject.actions.length})
                </Text>
                {selectedObject.actions.map((action, index) => (
                  <View
                    key={index}
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
