/**
 * components/editor/SceneSelector.tsx — Ready-made scenes browser & connector
 *
 * Shows a list of pre-made/template scenes that can be:
 * - Connected together (link output of one to input of another)
 * - Imported into the current timeline as a starting point
 * - Previewed before connecting
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, FlatList,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/lib/i18n';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { type BlockType } from '@/lib/engine/types';
import { withAlpha } from '@/lib/_core/theme';

// ── Template scene definitions ──────────────────────────────────────
interface TemplateScene {
  id: string;
  name: string;
  description: string;
  category: 'dialogue' | 'action' | 'transition' | 'choice' | 'cinematic';
  icon: string;
  tags: string[];
  blockTypes: BlockType[];  // Block types to add when importing
  outputs: string[];
  inputs: string[];
}

const TEMPLATE_SCENES: TemplateScene[] = [
  {
    id: 'tpl_dialogue_basic',
    name: 'Basic Dialogue',
    description: 'Character speaks with name tag and text box',
    category: 'dialogue',
    icon: '💬',
    tags: ['dialogue', 'character', 'text'],
    blockTypes: ['dialogue'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_dialogue_narration',
    name: 'Narration',
    description: 'Narrator text without character name',
    category: 'dialogue',
    icon: '📖',
    tags: ['narration', 'text'],
    blockTypes: ['text'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_choice_binary',
    name: 'Binary Choice',
    description: 'Two options for the player to choose from',
    category: 'choice',
    icon: '🔀',
    tags: ['choice', 'branching'],
    blockTypes: ['dialogue', 'choice'],
    outputs: ['choice_a', 'choice_b'],
    inputs: ['start'],
  },
  {
    id: 'tpl_choice_triple',
    name: 'Triple Choice',
    description: 'Three options for the player',
    category: 'choice',
    icon: '🔀',
    tags: ['choice', 'branching', 'triple'],
    blockTypes: ['dialogue', 'choice'],
    outputs: ['choice_a', 'choice_b', 'choice_c'],
    inputs: ['start'],
  },
  {
    id: 'tpl_scene_transition',
    name: 'Scene Transition',
    description: 'Fade out / fade in between scenes',
    category: 'transition',
    icon: '🎬',
    tags: ['transition', 'fade'],
    blockTypes: ['transition'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_character_entrance',
    name: 'Character Entrance',
    description: 'Character appears with animation',
    category: 'action',
    icon: '🚶',
    tags: ['character', 'entrance', 'animation'],
    blockTypes: ['character'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_character_exit',
    name: 'Character Exit',
    description: 'Character leaves the scene',
    category: 'action',
    icon: '👋',
    tags: ['character', 'exit', 'animation'],
    blockTypes: ['character'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_background_change',
    name: 'Background Change',
    description: 'Switch to a new background image',
    category: 'cinematic',
    icon: '🖼️',
    tags: ['background', 'cinematic'],
    blockTypes: ['background'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_music_start',
    name: 'Start Music',
    description: 'Begin background music track',
    category: 'cinematic',
    icon: '🎵',
    tags: ['music', 'audio', 'bgm'],
    blockTypes: ['music'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_music_stop',
    name: 'Stop Music',
    description: 'Fade out and stop background music',
    category: 'cinematic',
    icon: '🔇',
    tags: ['music', 'audio', 'fadeout'],
    blockTypes: ['music'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_sound_effect',
    name: 'Sound Effect',
    description: 'Play a one-shot sound effect',
    category: 'cinematic',
    icon: '🔊',
    tags: ['sound', 'sfx', 'effect'],
    blockTypes: ['sound'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_variable_set',
    name: 'Set Variable',
    description: 'Set a story variable (flag, counter, etc.)',
    category: 'action',
    icon: '🏷️',
    tags: ['variable', 'flag', 'logic'],
    blockTypes: ['variable'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_condition_check',
    name: 'Condition Check',
    description: 'Branch based on a variable value',
    category: 'action',
    icon: '❓',
    tags: ['condition', 'branching', 'logic', 'if'],
    blockTypes: ['variable'],
    outputs: ['true', 'false'],
    inputs: ['start'],
  },
  {
    id: 'tpl_camera_pan',
    name: 'Camera Pan',
    description: 'Pan camera across the scene',
    category: 'cinematic',
    icon: '📷',
    tags: ['camera', 'pan', 'cinematic'],
    blockTypes: ['camera'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_camera_zoom',
    name: 'Camera Zoom',
    description: 'Zoom in or out',
    category: 'cinematic',
    icon: '🔍',
    tags: ['camera', 'zoom', 'cinematic'],
    blockTypes: ['camera'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_fx_shake',
    name: 'Screen Shake',
    description: 'Shake the screen for dramatic effect',
    category: 'cinematic',
    icon: '💥',
    tags: ['effect', 'shake', 'dramatic'],
    blockTypes: ['effect'],
    outputs: ['next'],
    inputs: ['start'],
  },
  {
    id: 'tpl_fx_flash',
    name: 'Screen Flash',
    description: 'Flash the screen white or colored',
    category: 'cinematic',
    icon: '⚡',
    tags: ['effect', 'flash', 'dramatic'],
    blockTypes: ['effect'],
    outputs: ['next'],
    inputs: ['start'],
  },
];

const CATEGORIES = [
  { key: 'all', labelKey: 'editor.filterAll', icon: '📋' },
  { key: 'dialogue', labelKey: 'editor.filterDialogue', icon: '💬' },
  { key: 'choice', labelKey: 'editor.filterChoices', icon: '🔀' },
  { key: 'action', labelKey: 'editor.filterAction', icon: '🚶' },
  { key: 'transition', labelKey: 'editor.filterTransitions', icon: '🎬' },
  { key: 'cinematic', labelKey: 'editor.filterCinematic', icon: '📷' },
] as const;

// ── Props ───────────────────────────────────────────────────────────
interface SceneSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectScene: (blockTypes: BlockType[]) => void;
  onConnectScenes: (fromSceneId: string, output: string, toSceneId: string, input: string) => void;
  storyScenes?: { id: string; name: string }[];
}

// ── Component ────────────────────────────────────────────────────────
export function SceneSelector({
  visible,
  onClose,
  onSelectScene,
  onConnectScenes,
  storyScenes = [],
}: SceneSelectorProps) {
  const colors = useColors();
  const { t } = useI18n();
  const { deviceType } = useResponsiveLayout();
  const isPhone = deviceType === 'phone';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateScene | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<{ sceneId: string; output: string } | null>(null);
  const listRef = useRef<FlatList<TemplateScene> | null>(null);

  const filteredScenes = TEMPLATE_SCENES.filter((scene) => {
    const matchesCategory = selectedCategory === 'all' || scene.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      scene.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scene.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scene.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleSelectTemplate = useCallback((scene: TemplateScene) => {
    if (connectMode && connectFrom) {
      onConnectScenes(connectFrom.sceneId, connectFrom.output, scene.id, scene.inputs[0] || 'start');
      setConnectMode(false);
      setConnectFrom(null);
    } else {
      setSelectedTemplate(scene);
      const index = filteredScenes.findIndex((s) => s.id === scene.id);
      if (index >= 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.15 });
        });
      }
    }
  }, [connectMode, connectFrom, filteredScenes, onConnectScenes]);

  const handleImport = useCallback(() => {
    if (selectedTemplate) {
      onSelectScene(selectedTemplate.blockTypes);
      setSelectedTemplate(null);
      onClose();
    }
  }, [selectedTemplate, onSelectScene, onClose]);

  const handleStartConnect = useCallback((sceneId: string, output: string) => {
    setConnectMode(true);
    setConnectFrom({ sceneId, output });
  }, []);

  const handleCancelConnect = useCallback(() => {
    setConnectMode(false);
    setConnectFrom(null);
  }, []);

  const getCategoryColor = (category: string): string => {
    const map: Record<string, string> = {
      dialogue: colors['lego-dialogue']!,
      choice: colors['lego-choice']!,
      action: colors['lego-character']!,
      transition: colors['lego-transition']!,
      cinematic: colors['lego-background']!,
    };
    return map[category] || colors.primary;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
        }}>
          <Pressable onPress={onClose} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>✕</Text>
          </Pressable>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700' }}>
            {connectMode ? `🔗 ${t('editor.sceneSelector.titleConnect')}` : `📚 ${t('editor.sceneSelector.title')}`}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Connect mode banner */}
        {connectMode && connectFrom && (
          <View style={{
            flexDirection: isPhone ? 'column' : 'row',
            alignItems: isPhone ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: withAlpha(colors.primary, 0.13),
            borderBottomWidth: 1, borderBottomColor: colors.border,
            gap: isPhone ? 8 : 12,
          }}>
            <Text style={{ color: colors.foreground, fontSize: 13 }}>
              {t('editor.sceneSelector.connecting')}<Text style={{ fontWeight: '600', color: colors.primary }}>{connectFrom.sceneId}</Text>
              {' → '}
              <Text style={{ fontWeight: '600' }}>{connectFrom.output}</Text>
            </Text>
            <Pressable onPress={handleCancelConnect} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={{ color: colors.danger, fontSize: 13 }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        )}

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('editor.searchScenes')}
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border,
              borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
              color: colors.foreground, fontSize: 14,
            }}
          />
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: isPhone ? 56 : 64 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, alignItems: 'center' }}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => setSelectedCategory(cat.key)}
              accessibilityRole="button"
              accessibilityLabel={t(cat.labelKey)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 4,
                borderRadius: 20,
                backgroundColor: selectedCategory === cat.key ? colors.primary : colors.surface,
                borderWidth: 1, borderColor: selectedCategory === cat.key ? colors.primary : colors.border,
              }}
            >
              <Text style={{
                color: selectedCategory === cat.key ? colors['text-inverse'] : colors.foreground,
                fontSize: 13, fontWeight: '500',
              }}>
                {cat.icon} {t(cat.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Scene list */}
        <FlatList
          ref={listRef}
          data={filteredScenes}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: selectedTemplate || connectMode ? (isPhone ? 160 : 120) : 20,
          }}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelectTemplate(item)}
              onLongPress={() => !connectMode && storyScenes.length > 0 && handleStartConnect(item.id, item.outputs[0])}
              accessibilityRole="button"
              accessibilityLabel={`${item.icon} ${item.name}`}
              style={{
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: isPhone ? 'stretch' : 'center',
                padding: 14, marginBottom: 8,
                backgroundColor: selectedTemplate?.id === item.id ? withAlpha(colors.primary, 0.08) : colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selectedTemplate?.id === item.id ? colors.primary : colors.border,
              }}
            >
              {/* Category color indicator */}
              <View style={{
                width: isPhone ? '100%' : 4,
                height: isPhone ? 4 : 40,
                borderRadius: 2,
                marginRight: isPhone ? 0 : 12,
                marginBottom: isPhone ? 12 : 0,
                backgroundColor: getCategoryColor(item.category),
              }} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{item.icon}</Text>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>
                    {item.name}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>
                  {item.description}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {item.tags.map((tag) => (
                    <Text key={tag} style={{
                      fontSize: 10, paddingHorizontal: 6, paddingVertical: 2,
                      borderRadius: 4, backgroundColor: colors.surface,
                      color: colors.muted, borderWidth: 1, borderColor: colors.border,
                    }}>
                      {tag}
                    </Text>
                  ))}
                </View>
                {/* Input/Output ports */}
                <View style={{ flexDirection: 'row', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                      {item.inputs.map((input) => (
                        <Text key={input} style={{ fontSize: 10, color: colors.success }}>
                          ▼ {input}
                        </Text>
                      ))}
                      {item.outputs.map((output) => (
                        <Text key={output} style={{ fontSize: 10, color: colors.warning }}>
                          ▶ {output}
                        </Text>
                      ))}
                </View>
              </View>

              {/* Connect button */}
              {!connectMode && storyScenes.length > 0 && (
                <Pressable
                  onPress={() => handleStartConnect(item.id, item.outputs[0])}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    marginLeft: isPhone ? 0 : 8,
                    marginTop: isPhone ? 12 : 0,
                    alignSelf: isPhone ? 'flex-end' : 'center',
                    borderRadius: 6, backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('sceneSelector.connectScene')}
                >
                  <Text style={{ fontSize: 12 }}>🔗</Text>
                  <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600' }}>
                    {t('sceneSelector.connect')}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{t('editor.noMatchingScenes')}</Text>
            </View>
          }
        />

        {/* Bottom action bar */}
        {selectedTemplate && !connectMode && (
          <View style={{
            flexDirection: isPhone ? 'column' : 'row',
            alignItems: isPhone ? 'stretch' : 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16, paddingVertical: 12,
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
            gap: isPhone ? 12 : 16,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                {selectedTemplate.icon} {selectedTemplate.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {selectedTemplate.blockTypes.length} block{selectedTemplate.blockTypes.length > 1 ? 's' : ''} · {selectedTemplate.outputs.length} output{selectedTemplate.outputs.length > 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable
              onPress={handleImport}
              style={{
                paddingHorizontal: 20, paddingVertical: 10,
                borderRadius: 8, backgroundColor: colors.primary,
                alignSelf: isPhone ? 'stretch' : 'auto',
              }}
              accessibilityRole="button"
              accessibilityLabel={t('editor.addBlock')}
            >
              <Text style={{ color: colors['text-inverse'], fontSize: 14, fontWeight: '600' }}>
                {t('editor.addBlock')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Connect mode: bottom bar */}
        {connectMode && (
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12,
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
            alignItems: 'center',
          }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {t('sceneSelector.tapTargetToConnect')}{' '}
              <Text style={{ color: colors.primary }} onPress={handleCancelConnect} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>{t('common.cancel')}</Text>
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

export { TEMPLATE_SCENES };
export type { TemplateScene };
