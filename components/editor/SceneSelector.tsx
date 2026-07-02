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
import { useI18n } from '@/hooks/use-i18n';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { type BlockType } from '@/lib/engine/types';
import { withAlpha } from '@/lib/_core/theme';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { radius, spacing, typeScale } from '@/lib/design-tokens';

// ── Template scene definitions ──────────────────────────────────────
interface TemplateScene {
  id: string;
  name: string;
  description: string;
  category: 'dialogue' | 'action' | 'transition' | 'choice' | 'cinematic';
  icon: IconSymbolName;
  tags: string[];
  blockTypes: BlockType[];  // Block types to add when importing
  outputs: string[];
  inputs: string[];
}

interface StorySceneOption {
  id: string;
  name: string;
}

const TEMPLATE_SCENES: TemplateScene[] = [
  {
    id: 'tpl_dialogue_narration',
    name: 'Narration',
    description: 'Narrator text without character name',
    category: 'dialogue',
    icon: 'document',
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
    icon: 'timeline',
    tags: ['choice', 'branching'],
    blockTypes: ['choice'],
    outputs: ['choice_a', 'choice_b'],
    inputs: ['start'],
  },
  {
    id: 'tpl_choice_triple',
    name: 'Triple Choice',
    description: 'Three options for the player',
    category: 'choice',
    icon: 'timeline',
    tags: ['choice', 'branching', 'triple'],
    blockTypes: ['choice'],
    outputs: ['choice_a', 'choice_b', 'choice_c'],
    inputs: ['start'],
  },
  {
    id: 'tpl_scene_transition',
    name: 'Scene Transition',
    description: 'Fade out / fade in between scenes',
    category: 'transition',
    icon: 'movie',
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
    icon: 'character',
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
    icon: 'character',
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
    icon: 'image',
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
    icon: 'music',
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
    icon: 'stop',
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
    icon: 'sound',
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
    icon: 'settings',
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
    icon: 'question',
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
    icon: 'camera',
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
    icon: 'search',
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
    icon: 'lightning',
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
    icon: 'lightning',
    tags: ['effect', 'flash', 'dramatic'],
    blockTypes: ['effect'],
    outputs: ['next'],
    inputs: ['start'],
  },
];

const CATEGORIES = [
  { key: 'all', labelKey: 'editor.filterAll', icon: 'list' },
  { key: 'dialogue', labelKey: 'editor.filterDialogue', icon: 'voice' },
  { key: 'choice', labelKey: 'editor.filterChoices', icon: 'timeline' },
  { key: 'action', labelKey: 'editor.filterAction', icon: 'character' },
  { key: 'transition', labelKey: 'editor.filterTransitions', icon: 'movie' },
  { key: 'cinematic', labelKey: 'editor.filterCinematic', icon: 'camera' },
] as const satisfies readonly { key: string; labelKey: string; icon: IconSymbolName }[];

// ── Props ───────────────────────────────────────────────────────────
const CATEGORY_ICON_BY_KEY: Record<string, IconSymbolName> = {
  all: 'list',
  dialogue: 'voice',
  choice: 'timeline',
  action: 'character',
  transition: 'movie',
  cinematic: 'camera',
};

const TEMPLATE_ICON_BY_ID: Record<string, IconSymbolName> = {
  tpl_dialogue_narration: 'document',
  tpl_choice_binary: 'timeline',
  tpl_choice_triple: 'timeline',
  tpl_scene_transition: 'movie',
  tpl_character_entrance: 'character',
  tpl_character_exit: 'character',
  tpl_background_change: 'image',
  tpl_music_start: 'music',
  tpl_music_stop: 'stop',
  tpl_sound_effect: 'sound',
  tpl_variable_set: 'settings',
  tpl_condition_check: 'question',
  tpl_camera_pan: 'camera',
  tpl_camera_zoom: 'search',
  tpl_fx_shake: 'lightning',
  tpl_fx_flash: 'lightning',
};

function getTemplateIconName(scene: TemplateScene): IconSymbolName {
  return TEMPLATE_ICON_BY_ID[scene.id] ?? 'document';
}

interface SceneSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectScene: (blockTypes: BlockType[]) => void;
  onConnectScenes: (fromSceneId: string, output: string, toSceneId: string, input: string) => void;
  storyScenes?: StorySceneOption[];
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

  const templateName = useCallback((scene: TemplateScene) =>
    t(`editor.template.${scene.id}.name`, undefined, scene.name), [t]);
  const templateDescription = useCallback((scene: TemplateScene) =>
    t(`editor.template.${scene.id}.description`, undefined, scene.description), [t]);

  const filteredScenes = TEMPLATE_SCENES.filter((scene) => {
    const name = templateName(scene).toLowerCase();
    const description = templateDescription(scene).toLowerCase();
    const matchesCategory = selectedCategory === 'all' || scene.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      name.includes(searchQuery.toLowerCase()) ||
      description.includes(searchQuery.toLowerCase()) ||
      scene.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleSelectTemplate = useCallback((scene: TemplateScene) => {
    setSelectedTemplate(scene);
    const index = filteredScenes.findIndex((s) => s.id === scene.id);
    if (index >= 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.15 });
      });
    }
  }, [filteredScenes]);

  const handleImport = useCallback(() => {
    if (selectedTemplate) {
      onSelectScene(selectedTemplate.blockTypes);
      setSelectedTemplate(null);
      onClose();
    }
  }, [selectedTemplate, onSelectScene, onClose]);

  const handleCancelConnect = useCallback(() => {
    setConnectMode(false);
    setConnectFrom(null);
  }, []);

  const handleConnectTarget = useCallback((sceneId: string) => {
    if (!connectFrom) {
      setConnectFrom({ sceneId, output: 'next' });
      return;
    }
    if (connectFrom.sceneId === sceneId) return;
    onConnectScenes(connectFrom.sceneId, connectFrom.output, sceneId, 'start');
    setConnectMode(false);
    setConnectFrom(null);
  }, [connectFrom, onConnectScenes]);

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
          paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
        }}>
          <Pressable onPress={onClose} style={{ padding: spacing.sm }} accessibilityRole="button" accessibilityLabel={t('a11y.closePanel')}>
            <IconSymbol name="close" size={18} color={colors.primary} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconSymbol name={connectMode ? 'link' : 'list'} size={18} color={colors.foreground} />
            <Text style={{ color: colors.foreground, ...typeScale.sectionTitle }}>
              {connectMode ? t('editor.sceneSelector.titleConnect') : t('editor.sceneSelector.title')}
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Connect mode banner */}
        {connectMode && (
          <View style={{
            flexDirection: isPhone ? 'column' : 'row',
            alignItems: isPhone ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
            backgroundColor: withAlpha(colors.primary, 0.13),
            borderBottomWidth: 1, borderBottomColor: colors.border,
            gap: isPhone ? spacing.sm : spacing.md,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.foreground, ...typeScale.caption }}>
                {connectFrom
                  ? <>{t('editor.sceneSelector.connecting')}<Text style={{ fontWeight: '600', color: colors.primary }}>{connectFrom.sceneId}</Text></>
                  : <>{t('sceneSelector.connectScene')}</>}
              </Text>
              {connectFrom ? (
                <>
                  <IconSymbol name="arrow.right" size={12} color={colors.muted} />
                  <Text style={{ ...typeScale.caption, fontWeight: '600' }}>{connectFrom.output}</Text>
                </>
              ) : null}
            </View>
            <Pressable onPress={handleCancelConnect} style={{ padding: spacing.xs }} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Text style={{ color: colors.danger, ...typeScale.caption }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        )}

        {/* Search */}
        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('editor.searchScenes')}
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border,
              borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              color: colors.foreground, ...typeScale.label,
            }}
          />
          {!connectMode && storyScenes.length > 1 ? (
            <Pressable
              onPress={() => {
                setConnectMode(true);
                setConnectFrom(null);
                setSelectedTemplate(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('sceneSelector.connectScene')}
              style={{
                marginTop: spacing.sm,
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <IconSymbol name="link" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, ...typeScale.caption }}>
                {t('sceneSelector.connect')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: isPhone ? 56 : 64 }}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: 'center' }}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              onPress={() => setSelectedCategory(cat.key)}
              accessibilityRole="button"
              accessibilityLabel={t(cat.labelKey)}
              style={{
                paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginHorizontal: spacing.xs,
                borderRadius: radius.full,
                backgroundColor: selectedCategory === cat.key ? colors.primary : colors.surface,
                borderWidth: 1, borderColor: selectedCategory === cat.key ? colors.primary : colors.border,
              }}
            >
              <Text style={{
                color: selectedCategory === cat.key ? colors['text-inverse'] : colors.foreground,
                ...typeScale.caption,
              }}>
                <IconSymbol
                  name={CATEGORY_ICON_BY_KEY[cat.key]}
                  size={14}
                  color={selectedCategory === cat.key ? colors['text-inverse'] : colors.foreground}
                  style={{ marginRight: spacing.xs }}
                />
                {t(cat.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Scene list */}
        <FlatList<TemplateScene | StorySceneOption>
          ref={listRef as React.RefObject<FlatList<TemplateScene | StorySceneOption>>}
          data={connectMode ? storyScenes : filteredScenes}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: selectedTemplate || connectMode ? (isPhone ? 160 : 120) : spacing.xl,
          }}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          renderItem={({ item }) => {
            if (connectMode) {
              const isSource = connectFrom?.sceneId === item.id;
              return (
                <Pressable
                  onPress={() => handleConnectTarget(item.id)}
                  disabled={isSource}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                    backgroundColor: isSource ? withAlpha(colors.primary, 0.08) : colors.surface,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: isSource ? colors.primary : colors.border,
                    opacity: isSource ? 0.65 : 1,
                  }}
                >
                  <IconSymbol name={isSource ? 'link' : connectFrom ? 'arrow.right' : 'play'} size={16} color={isSource ? colors.primary : colors.foreground} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, ...typeScale.label }}>{item.name}</Text>
                    <Text style={{ color: colors.muted, ...typeScale.caption }}>
                      {isSource
                        ? connectFrom?.output
                        : connectFrom
                          ? t('sceneSelector.tapTargetToConnect')
                          : t('sceneSelector.connectScene')}
                    </Text>
                  </View>
                </Pressable>
              );
            }

            const template = item as TemplateScene;
            return (
            <Pressable
              onPress={() => handleSelectTemplate(template)}
              accessibilityRole="button"
              accessibilityLabel={templateName(template)}
              style={{
                flexDirection: isPhone ? 'column' : 'row',
                alignItems: isPhone ? 'stretch' : 'center',
                padding: spacing.md, marginBottom: spacing.sm,
                backgroundColor: selectedTemplate?.id === template.id ? withAlpha(colors.primary, 0.08) : colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selectedTemplate?.id === template.id ? colors.primary : colors.border,
              }}
            >
              {/* Category color indicator */}
              <View style={{
                width: isPhone ? '100%' : 4,
                height: isPhone ? 4 : 40,
                borderRadius: 2,
                marginRight: isPhone ? 0 : spacing.md,
                marginBottom: isPhone ? spacing.md : 0,
                backgroundColor: getCategoryColor(template.category),
              }} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                  <IconSymbol name={getTemplateIconName(template)} size={16} color={getCategoryColor(template.category)} style={{ marginRight: spacing.xs }} />
                  <Text style={{ color: colors.foreground, ...typeScale.label, flexShrink: 1 }}>
                    {templateName(template)}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, ...typeScale.caption, marginBottom: spacing.xs }}>
                  {templateDescription(template)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {template.tags.map((tag) => (
                    <Text key={tag} style={{
                      ...typeScale.micro, paddingHorizontal: spacing.xs, paddingVertical: 2,
                      borderRadius: radius.sm, backgroundColor: colors.surface,
                      color: colors.muted, borderWidth: 1, borderColor: colors.border,
                    }}>
                      {tag}
                    </Text>
                  ))}
                </View>
                {/* Input/Output ports */}
                <View style={{ flexDirection: 'row', marginTop: spacing.xs, gap: spacing.sm, flexWrap: 'wrap' }}>
                      {template.inputs.map((input) => (
                        <View key={input} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <IconSymbol name="chevron.down" size={10} color={colors.success} />
                          <Text style={{ ...typeScale.micro, color: colors.success }}>{input}</Text>
                        </View>
                      ))}
                      {template.outputs.map((output) => (
                        <Text key={output} style={{ ...typeScale.micro, color: colors.warning }}>
                          <IconSymbol name="play" size={10} color={colors.warning} /> {output}
                        </Text>
                      ))}
                </View>
              </View>

            </Pressable>
          );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
              <Text style={{ color: colors.muted, ...typeScale.label }}>{t('editor.noMatchingScenes')}</Text>
            </View>
          }
        />

        {/* Bottom action bar */}
        {selectedTemplate && !connectMode && (
          <View style={{
            flexDirection: isPhone ? 'column' : 'row',
            alignItems: isPhone ? 'stretch' : 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
            gap: isPhone ? spacing.md : spacing.lg,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <IconSymbol name={getTemplateIconName(selectedTemplate)} size={14} color={getCategoryColor(selectedTemplate.category)} />
                <Text style={{ color: colors.foreground, ...typeScale.label }}>
                  {templateName(selectedTemplate)}
                </Text>
              </View>
              <Text style={{ color: colors.muted, ...typeScale.caption }}>
                {t('editor.sceneSelector.templateMeta', {
                  blocks: selectedTemplate.blockTypes.length,
                  outputs: selectedTemplate.outputs.length,
                })}
              </Text>
            </View>
            <Pressable
              onPress={handleImport}
              style={{
                paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
                borderRadius: radius.md, backgroundColor: colors.primary,
                alignSelf: isPhone ? 'stretch' : 'auto',
              }}
              accessibilityRole="button"
              accessibilityLabel={t('editor.addBlock')}
            >
              <Text style={{ color: colors['text-inverse'], ...typeScale.label }}>
                {t('editor.addBlock')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Connect mode: bottom bar */}
        {connectMode && (
          <View style={{
            paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
            borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
            alignItems: 'center',
          }}>
            <Text style={{ color: colors.muted, ...typeScale.caption }}>
              {t('sceneSelector.tapTargetToConnect')}{' '}
              <Text style={{ color: colors.primary }} onPress={handleCancelConnect} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>{t('common.cancel')}</Text>
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
