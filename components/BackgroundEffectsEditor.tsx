/**
 * Background Effects Editor Component
 * UI for configuring background effects in scenes
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
  Switch,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import type { BackgroundEffect, BackgroundEffectType } from '@/lib/background-effects-types';
import { EFFECT_PRESETS } from '@/lib/background-effects-types';

interface Props {
  effects: BackgroundEffect[];
  onChange: (effects: BackgroundEffect[]) => void;
}

const EFFECT_TYPES: { value: BackgroundEffectType; label: string; icon: string }[] = [
  { value: 'sunrays', label: 'Sunrays', icon: '☀️' },
  { value: 'rain', label: 'Rain', icon: '🌧' },
  { value: 'snow', label: 'Snow', icon: '❄️' },
  { value: 'fog', label: 'Fog', icon: '🌫' },
  { value: 'storm', label: 'Storm', icon: '⚡' },
  { value: 'particles', label: 'Particles', icon: '🍂' },
  { value: 'sparkles', label: 'Sparkles', icon: '✨' },
];

export function BackgroundEffectsEditor({ effects, onChange }: Props) {
  const colors = useColors();
  const [editingEffect, setEditingEffect] = useState<BackgroundEffect | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const handleAddEffect = () => {
    setEditingEffect({
      id: `effect_${Date.now()}`,
      type: 'rain',
      intensity: 0.5,
      speed: 1.0,
      opacity: 0.7,
      enabled: true,
    });
  };

  const handleSaveEffect = () => {
    if (!editingEffect) return;

    const existing = effects.find((e) => e.id === editingEffect.id);
    if (existing) {
      onChange(effects.map((e) => (e.id === editingEffect.id ? editingEffect : e)));
    } else {
      onChange([...effects, editingEffect]);
    }

    setEditingEffect(null);
  };

  const handleDeleteEffect = (effectId: string) => {
    Alert.alert('Delete Effect', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onChange(effects.filter((e) => e.id !== effectId)),
      },
    ]);
  };

  const handleToggleEffect = (effectId: string) => {
    onChange(
      effects.map((e) => (e.id === effectId ? { ...e, enabled: !e.enabled } : e))
    );
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = EFFECT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      onChange(preset.effects);
      setShowPresets(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Background Effects ({effects.length})
        </Text>
        <View style={styles.headerButtons}>
          <Pressable
            style={[styles.presetButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowPresets(!showPresets)}
          >
            <Text style={[styles.presetButtonText, { color: colors.foreground }]}>
              📋 Presets
            </Text>
          </Pressable>
          <Pressable
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={handleAddEffect}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>
      </View>

      {/* Presets Panel */}
      {showPresets && (
        <View style={[styles.presetsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.presetsTitle, { color: colors.foreground }]}>Effect Presets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {EFFECT_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                style={[styles.presetCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => handleApplyPreset(preset.id)}
              >
                <Text style={[styles.presetName, { color: colors.foreground }]}>
                  {preset.name}
                </Text>
                <Text style={[styles.presetDesc, { color: colors.muted }]}>
                  {preset.description}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Effects List */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {effects.map((effect) => (
          <View
            key={effect.id}
            style={[
              styles.effectCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.effectHeader}>
              <View style={styles.effectInfo}>
                <Text style={[styles.effectType, { color: colors.primary }]}>
                  {EFFECT_TYPES.find((t) => t.value === effect.type)?.icon}{' '}
                  {EFFECT_TYPES.find((t) => t.value === effect.type)?.label}
                </Text>
                <View style={styles.effectMeta}>
                  <Text style={[styles.metaItem, { color: colors.muted }]}>
                    Intensity: {Math.round(effect.intensity * 100)}%
                  </Text>
                  <Text style={[styles.metaItem, { color: colors.muted }]}>
                    Speed: {effect.speed.toFixed(1)}x
                  </Text>
                </View>
              </View>
              <View style={styles.effectActions}>
                <Switch
                  value={effect.enabled}
                  onValueChange={() => handleToggleEffect(effect.id)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
                <Pressable
                  style={styles.iconButton}
                  onPress={() => setEditingEffect({ ...effect })}
                >
                  <Text style={{ color: colors.primary }}>✏️</Text>
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => handleDeleteEffect(effect.id)}
                >
                  <Text style={{ color: colors.error }}>🗑</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        {effects.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No background effects
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.muted }]}>
              Tap + Add or use Presets
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      {editingEffect && (
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <ScrollView
            style={[
              styles.modalContent,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {effects.find((e) => e.id === editingEffect.id) ? 'Edit' : 'Add'} Effect
            </Text>

            {/* Effect Type */}
            <Text style={[styles.label, { color: colors.foreground }]}>Effect Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.typeButtons}>
                {EFFECT_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor:
                          editingEffect.type === type.value ? colors.primary : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => setEditingEffect({ ...editingEffect, type: type.value })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        {
                          color:
                            editingEffect.type === type.value ? '#fff' : colors.foreground,
                        },
                      ]}
                    >
                      {type.icon} {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Intensity */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Intensity: {Math.round(editingEffect.intensity * 100)}%
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
              value={Math.round(editingEffect.intensity * 100).toString()}
              onChangeText={(text) =>
                setEditingEffect({
                  ...editingEffect,
                  intensity: Math.max(0, Math.min(100, parseInt(text) || 0)) / 100,
                })
              }
            />

            {/* Speed */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Speed: {editingEffect.speed.toFixed(1)}x
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
              placeholder="0.0-2.0"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={editingEffect.speed.toString()}
              onChangeText={(text) =>
                setEditingEffect({
                  ...editingEffect,
                  speed: Math.max(0, Math.min(2, parseFloat(text) || 0)),
                })
              }
            />

            {/* Opacity */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Opacity: {Math.round((editingEffect.opacity ?? 1) * 100)}%
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
              value={Math.round((editingEffect.opacity ?? 1) * 100).toString()}
              onChangeText={(text) =>
                setEditingEffect({
                  ...editingEffect,
                  opacity: Math.max(0, Math.min(100, parseInt(text) || 0)) / 100,
                })
              }
            />

            {/* Color (optional) */}
            <Text style={[styles.label, { color: colors.foreground }]}>
              Color (optional, hex)
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
              placeholder="#FFFFFF"
              placeholderTextColor={colors.muted}
              value={editingEffect.color || ''}
              onChangeText={(text) =>
                setEditingEffect({
                  ...editingEffect,
                  color: text || undefined,
                })
              }
            />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveEffect}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setEditingEffect(null)}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  presetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetButtonText: {
    fontSize: 11,
    fontWeight: '600',
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
  presetsPanel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  presetsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  presetCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginRight: 8,
    width: 140,
  },
  presetName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 10,
  },
  list: {
    flex: 1,
  },
  effectCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  effectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  effectInfo: {
    flex: 1,
  },
  effectType: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  effectMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    fontSize: 10,
  },
  effectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 4,
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
