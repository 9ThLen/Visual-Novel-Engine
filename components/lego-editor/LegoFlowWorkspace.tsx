/**
 * LegoFlowWorkspace — Mobile-optimized vertical block flow
 *
 * Renders a vertical sequence of LEGO blocks with connectors between them.
 * Supports tap-to-select, long-press-to-drag, and visual snap indicators.
 * Dark theme matching the HTML prototype design system.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useColors } from '@/hooks/use-colors';
import { AtomBlock, getTextData, getCharacterData, getBackgroundData, getAudioData, getFXData } from '@/lib/atom-types';

// ── Color map using design system tokens with fallbacks ──
function getAtomColors(colors: ReturnType<typeof useColors>) {
  const c = colors as unknown as Record<string, string>;
  return {
    text_atom: c['lego-dialogue'] ?? '#7c5bf5',
    character_atom: c['lego-character'] ?? '#f5a623',
    background_atom: c['lego-background'] ?? '#50c878',
    audio_atom: c['lego-audio'] ?? '#ff6b6b',
    fx_atom: c['lego-fx'] ?? '#ffd93d',
  };
}

const ATOM_ICONS: Record<string, string> = {
  text_atom: '💬',
  character_atom: '👤',
  background_atom: '🖼️',
  audio_atom: '🎵',
  fx_atom: '✨',
};

const ATOM_LABELS: Record<string, string> = {
  text_atom: 'Діалог',
  character_atom: 'Персонаж',
  background_atom: 'Фон',
  audio_atom: 'Аудіо',
  fx_atom: 'Ефект',
};

interface LegoFlowWorkspaceProps {
  atoms: AtomBlock[];
  selectedAtomId: string | null;
  onAtomSelect: (atomId: string | null) => void;
  onAtomDelete: (atomId: string) => void;
  onAtomDuplicate: (atomId: string) => void;
  onAddBlock: () => void;
}

const LegoFlowWorkspace: React.FC<LegoFlowWorkspaceProps> = ({
  atoms,
  selectedAtomId,
  onAtomSelect,
  onAtomDelete,
  onAtomDuplicate,
  onAddBlock,
}) => {
  const layout = useResponsiveLayout();
  const colors = useColors();
  const atomColors = getAtomColors(colors);
  const isPhone = !layout.isTablet;

  const getAtomPreview = (atom: AtomBlock): string => {
    const textData = getTextData(atom);
    if (textData) return textData.content || 'Порожній діалог';
    const charData = getCharacterData(atom);
    if (charData) return `${charData.characterId} — ${charData.position}`;
    const bgData = getBackgroundData(atom);
    if (bgData) return bgData.uri || 'Зміна фону';
    const audioData = getAudioData(atom);
    if (audioData) return `${audioData.type === 'music' ? '🎵' : '🔊'} ${audioData.uri || 'Аудіо'}`;
    const fxData = getFXData(atom);
    if (fxData) return `✨ ${fxData.effectType}`;
    return atom.id;
  };

  const getAtomTags = (atom: AtomBlock): string[] => {
    const tags: string[] = [];
    const textData = getTextData(atom);
    if (textData) {
      if (textData.speaker) tags.push(textData.speaker);
      tags.push(`${textData.duration}ms`);
    }
    const charData = getCharacterData(atom);
    if (charData) {
      tags.push(charData.characterId);
      tags.push(charData.position);
      tags.push(charData.expression);
    }
    const bgData = getBackgroundData(atom);
    if (bgData) {
      tags.push(bgData.transition);
    }
    const audioData = getAudioData(atom);
    if (audioData) {
      tags.push(audioData.type);
      if (audioData.loop) tags.push('Loop');
      tags.push(`Vol: ${Math.round(audioData.volume * 100)}%`);
    }
    const fxData = getFXData(atom);
    if (fxData) {
      tags.push(fxData.effectType);
      tags.push(`${fxData.duration}ms`);
    }
    return tags.slice(0, 4); // Max 4 tags
  };

  return (
    <View style={[styles.container, isPhone && styles.containerPhone]}>
      {/* Header */}
      <View style={[styles.header, isPhone && styles.headerPhone]}>
        <Text style={[styles.headerTitle, isPhone && styles.headerTitlePhone]}>
          🧱 Послідовність блоків
        </Text>
        <Text style={styles.blockCount}>{atoms.length} блоків</Text>
      </View>

      {/* Block chain */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.chain,
          isPhone && styles.chainPhone,
          atoms.length === 0 && styles.chainEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {atoms.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧩</Text>
            <Text style={styles.emptyText}>
              Додайте блоки з бібліотеки{'\n'}щоб створити сцену
            </Text>
          </View>
        ) : (
          atoms.map((atom, index) => {
            const isSelected = atom.id === selectedAtomId;
            const color = atomColors[atom.type] || '#7c5bf5';
            const icon = ATOM_ICONS[atom.type] || '⬜';
            const label = ATOM_LABELS[atom.type] || 'Блок';
            const preview = getAtomPreview(atom);
            const tags = getAtomTags(atom);

            return (
              <React.Fragment key={atom.id}>
                {/* LEGO Block */}
                <Pressable
                  style={[
                    styles.block,
                    isPhone && styles.blockPhone,
                    isSelected && styles.blockSelected,
                    { borderLeftColor: color },
                  ]}
                  onPress={() => onAtomSelect(isSelected ? null : atom.id)}
                  android_ripple={{ color: 'rgba(124, 91, 245, 0.1)' }}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint="Tap to select, tap again to deselect"
                >
                  {/* LEGO studs (top connectors) */}
                  <View style={styles.studsContainer}>
                    <View style={[styles.stud, { backgroundColor: color }]} />
                    <View style={[styles.stud, { backgroundColor: color }]} />
                    <View style={[styles.stud, { backgroundColor: color }]} />
                  </View>

                  {/* Block header */}
                  <View style={[styles.blockHeader, isPhone && styles.blockHeaderPhone]}>
                    <View style={[styles.blockIcon, { backgroundColor: color + '20' }]}>
                      <Text style={styles.blockIconText}>{icon}</Text>
                    </View>
                    <View style={styles.blockHeaderText}>
                      <Text style={[styles.blockLabel, isPhone && styles.blockLabelPhone]}>
                        {label}
                      </Text>
                      <Text style={styles.blockId}>#{atom.id.slice(-6)}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.blockActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => onAtomDuplicate(atom.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Duplicate ${label}`}
                        >
                          <Text style={styles.actionBtnText}>📋</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => onAtomDelete(atom.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${label}`}
                        >
                          <Text style={styles.actionBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Block content */}
                  <Text
                    style={[styles.blockContent, isPhone && styles.blockContentPhone]}
                    numberOfLines={isPhone ? 2 : 3}
                  >
                    {preview}
                  </Text>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <View style={styles.tagsRow}>
                      {tags.map((tag, i) => (
                        <View
                          key={`${tag}-${i}`}
                          style={[styles.tag, { backgroundColor: color + '25' }]}
                        >
                          <Text style={[styles.tagText, { color }]}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* LEGO slot (bottom connector) */}
                  <View style={styles.slotContainer}>
                    <View style={[styles.slotHole, { backgroundColor: color + '30' }]} />
                    <View style={[styles.slotHole, { backgroundColor: color + '30' }]} />
                    <View style={[styles.slotHole, { backgroundColor: color + '30' }]} />
                  </View>
                </Pressable>

                {/* Connector between blocks */}
                {index < atoms.length - 1 && (
                  <View style={styles.connector}>
                    <View style={[styles.connectorLine, { backgroundColor: color }]} />
                    <View style={[styles.connectorArrow, { borderTopColor: color }]} />
                  </View>
                )}
              </React.Fragment>
            );
          })
        )}

        {/* Add block button */}
        <TouchableOpacity
          style={[styles.addButton, isPhone && styles.addButtonPhone]}
          onPress={onAddBlock}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Додати блок"
        >
          <Text style={styles.addButtonIcon}>➕</Text>
          <Text style={styles.addButtonText}>Додати блок</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1b2e',
  },
  containerPhone: {
    // On phone, this is the main content area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2e3050',
  },
  headerPhone: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9896a8',
  },
  headerTitlePhone: {
    fontSize: 11,
  },
  blockCount: {
    fontSize: 11,
    color: '#5e5c70',
    backgroundColor: '#252640',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  chain: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  chainPhone: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  chainEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#5e5c70',
    textAlign: 'center',
    lineHeight: 20,
  },
  // ── LEGO Block ──
  block: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1f2035',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderColor: '#2e3050',
    padding: 12,
    marginBottom: 0,
    boxShadow: '0px 2px 4px rgba(0,0,0,0.3)',
    elevation: 3,
  },
  blockPhone: {
    padding: 10,
    borderRadius: 8,
  },
  blockSelected: {
    borderWidth: 2,
    borderColor: '#7c5bf5',
    boxShadow: '0px 0px 8px rgba(124,91,245,0.3)',
    elevation: 6,
  },
  studsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 6,
  },
  stud: {
    width: 12,
    height: 12,
    borderRadius: 6,
    boxShadow: '0px 1px 1px rgba(0,0,0,0.3)',
    elevation: 2,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  blockHeaderPhone: {
    gap: 6,
  },
  blockIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockIconText: {
    fontSize: 16,
  },
  blockHeaderText: {
    flex: 1,
  },
  blockLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e8e6f0',
  },
  blockLabelPhone: {
    fontSize: 13,
  },
  blockId: {
    fontSize: 10,
    color: '#5e5c70',
    fontFamily: 'monospace',
  },
  blockActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#252640',
  },
  actionBtnText: {
    fontSize: 14,
  },
  blockContent: {
    fontSize: 13,
    color: '#9896a8',
    lineHeight: 18,
    marginBottom: 6,
  },
  blockContentPhone: {
    fontSize: 12,
    lineHeight: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  slotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  slotHole: {
    width: 12,
    height: 6,
    borderRadius: 3,
  },
  // ── Connector ──
  connector: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  connectorLine: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    opacity: 0.5,
  },
  connectorArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    opacity: 0.5,
  },
  // ── Add button ──
  addButton: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#2e3050',
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  addButtonPhone: {
    paddingVertical: 10,
  },
  addButtonIcon: {
    fontSize: 16,
  },
  addButtonText: {
    fontSize: 13,
    color: '#5e5c70',
    fontWeight: '600',
  },
});

export default LegoFlowWorkspace;
