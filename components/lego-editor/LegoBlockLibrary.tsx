/**
 * LegoBlockLibrary — Mobile-optimized block library panel
 *
 * Categorised block palette with drag-to-canvas support.
 * Designed for touch: large hit targets (min 44px), clear visual hierarchy,
 * dark theme matching the HTML prototype design system.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// ── Block type definitions ──

export type LegoBlockType =
  | 'text_atom'
  | 'character_atom'
  | 'background_atom'
  | 'audio_atom'
  | 'fx_atom';

interface BlockTemplate {
  type: LegoBlockType;
  icon: string;
  label: string;
  description: string;
  color: string;
  category: string;
}

const BLOCK_TEMPLATES: BlockTemplate[] = [
  { type: 'text_atom',    icon: '💬', label: 'Діалог',   description: 'Репліка персонажа',    color: '#7c5bf5', category: 'Основні' },
  { type: 'character_atom', icon: '👤', label: 'Персонаж', description: 'Показати / сховати',   color: '#f5a623', category: 'Основні' },
  { type: 'background_atom', icon: '🖼️', label: 'Фон',     description: 'Зміна фону сцени',     color: '#50c878', category: 'Основні' },
  { type: 'audio_atom',   icon: '🎵', label: 'Аудіо',     description: 'Музика або звук',      color: '#ff6b6b', category: 'Аудіо' },
  { type: 'fx_atom',      icon: '✨', label: 'Ефект',     description: 'Візуальні ефекти',     color: '#ffd93d', category: 'Аудіо' },
];

const CATEGORIES = ['Основні', 'Аудіо'];

interface LegoBlockLibraryProps {
  onDragStart?: (type: LegoBlockType) => void;
  onDragEnd?: (type: LegoBlockType) => void;
  onBlockTap?: (type: LegoBlockType) => void;
}

const LegoBlockLibrary: React.FC<LegoBlockLibraryProps> = ({
  onDragStart,
  onDragEnd,
  onBlockTap,
}) => {
  const layout = useResponsiveLayout();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORIES)
  );

  const isPhone = !layout.isTablet;

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return BLOCK_TEMPLATES;
    const q = searchQuery.toLowerCase();
    return BLOCK_TEMPLATES.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const groupedBlocks = useMemo(() => {
    const groups: Record<string, BlockTemplate[]> = {};
    for (const cat of CATEGORIES) {
      const blocks = filteredBlocks.filter((b) => b.category === cat);
      if (blocks.length > 0) groups[cat] = blocks;
    }
    return groups;
  }, [filteredBlocks]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <View style={[styles.container, isPhone && styles.containerPhone]}>
      {/* Search */}
      <View style={[styles.searchRow, isPhone && styles.searchRowPhone]}>
        <TextInput
          style={[styles.searchInput, isPhone && styles.searchInputPhone]}
          placeholder="🔍 Шукати блок..."
          placeholderTextColor="#5e5c70"
          value={searchQuery}
          onChangeText={setSearchQuery}
          accessibilityLabel="Search blocks"
        />
      </View>

      {/* Block list */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map((cat) => {
          const blocks = groupedBlocks[cat];
          if (!blocks) return null;
          const isExpanded = expandedCategories.has(cat);

          return (
            <View key={cat} style={styles.category}>
              <TouchableOpacity
                style={[styles.categoryHeader, isPhone && styles.categoryHeaderPhone]}
                onPress={() => toggleCategory(cat)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${cat} category`}
              >
                <Text style={[styles.categoryArrow, isExpanded && styles.categoryArrowOpen]}>
                  ▶
                </Text>
                <Text style={[styles.categoryTitle, isPhone && styles.categoryTitlePhone]}>
                  {cat}
                </Text>
                <Text style={styles.categoryCount}>{blocks.length}</Text>
              </TouchableOpacity>

              {isExpanded &&
                blocks.map((block) => (
                  <TouchableOpacity
                    key={block.type}
                    style={[styles.blockItem, isPhone && styles.blockItemPhone]}
                    onPress={() => onBlockTap?.(block.type)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${block.label} block`}
                  >
                    {/* LEGO studs preview */}
                    <View style={[styles.blockPreview, { backgroundColor: block.color }]}>
                      <View style={[styles.stud, { backgroundColor: block.color }]} />
                      <View style={[styles.stud, { backgroundColor: block.color }]} />
                    </View>
                    <View style={styles.blockInfo}>
                      <Text style={[styles.blockName, isPhone && styles.blockNamePhone]}>
                        {block.icon} {block.label}
                      </Text>
                      <Text style={[styles.blockDesc, isPhone && styles.blockDescPhone]}>
                        {block.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          );
        })}

        {filteredBlocks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нічого не знайдено</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 220,
    minWidth: 180,
    backgroundColor: '#1e2038',
    borderRightWidth: 1,
    borderRightColor: '#2e3050',
    flex: 1,
  },
  containerPhone: {
    width: '100%',
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#2e3050',
    maxHeight: 350,
  },
  searchRow: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2e3050',
  },
  searchRowPhone: {
    padding: 6,
  },
  searchInput: {
    backgroundColor: '#252640',
    borderWidth: 1,
    borderColor: '#2e3050',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#e8e6f0',
  },
  searchInputPhone: {
    fontSize: 12,
    paddingVertical: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  category: {
    marginBottom: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  categoryHeaderPhone: {
    paddingVertical: 6,
    minHeight: 44, // Touch target
  },
  categoryArrow: {
    fontSize: 10,
    color: '#5e5c70',
    transform: [{ rotate: '0deg' }],
  },
  categoryArrowOpen: {
    transform: [{ rotate: '90deg' }],
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#9896a8',
    flex: 1,
  },
  categoryTitlePhone: {
    fontSize: 10,
  },
  categoryCount: {
    fontSize: 10,
    color: '#5e5c70',
    backgroundColor: '#252640',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  blockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    marginHorizontal: 6,
    borderRadius: 6,
  },
  blockItemPhone: {
    paddingVertical: 10,
    minHeight: 48, // Touch target
  },
  blockPreview: {
    width: 32,
    height: 24,
    borderRadius: 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    flexDirection: 'row',
  },
  stud: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: -3,
    boxShadow: '0px 1px 1px rgba(0,0,0,0.3)',
    elevation: 2,
  },
  blockInfo: {
    flex: 1,
  },
  blockName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e8e6f0',
  },
  blockNamePhone: {
    fontSize: 12,
  },
  blockDesc: {
    fontSize: 10,
    color: '#5e5c70',
    marginTop: 1,
  },
  blockDescPhone: {
    fontSize: 9,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#5e5c70',
    fontSize: 13,
  },
});

export default LegoBlockLibrary;
