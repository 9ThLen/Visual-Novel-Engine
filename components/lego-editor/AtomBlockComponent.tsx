import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AtomBlock, getTextData, getCharacterData, getBackgroundData, getAudioData, getFXData } from '../../lib/atom-types';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

type ComponentProps = {
  atom: AtomBlock;
  isSelected: boolean;
  onPress: () => void;
};

const ATOM_TYPE_COLORS: Record<string, string> = {
  text_atom: '#3B82F6',      // Vibrant Blue
  character_atom: '#10B981', // Vibrant Green (Emerald)
  background_atom: '#F59E0B',// Vibrant Amber
  audio_atom: '#8B5CF6',     // Vibrant Purple (Violet)
  fx_atom: '#EC4899',        // Vibrant Pink
};

const ATOM_TYPE_ICONS: Record<string, string> = {
  text_atom: '💬',
  character_atom: '👤',
  background_atom: '🖼️',
  audio_atom: '🎵',
  fx_atom: '✨',
};

const AtomBlockComponent: React.FC<ComponentProps> = ({ atom, isSelected, onPress }) => {
  const layout = useResponsiveLayout();
  const typeColor = ATOM_TYPE_COLORS[atom.type] || '#000000';

  // Збільшений hitSlop для планшетів
  const hitSlop = layout.isTablet
    ? { top: 10, bottom: 10, left: 10, right: 10 }
    : { top: 5, bottom: 5, left: 5, right: 5 };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      style={[
        styles.container,
        { borderColor: typeColor },
        isSelected && styles.selectedContainer,
        // Більші атоми на планшетах
        layout.isTablet && styles.tabletContainer,
      ]}
    >
      {/* Snap point indicators */}
      <View style={[styles.snapPoint, styles.snapLeft]} />
      <View style={[styles.snapPoint, styles.snapRight]} />
      <View style={[styles.snapPoint, styles.snapTop]} />
      <View style={[styles.snapPoint, styles.snapBottom]} />

      {/* Atom content */}
      <View style={styles.contentRow}>
        <Text style={[styles.iconText, layout.isTablet && styles.iconTextTablet]}>{ATOM_TYPE_ICONS[atom.type] || '⬜'}</Text>
        <View style={[styles.typeDot, { backgroundColor: typeColor }, layout.isTablet && styles.typeDotTablet]} />
        <Text style={[styles.label, layout.isTablet && styles.labelTablet]}>{getTextData(atom)?.content || getCharacterData(atom)?.characterId || atom.id}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    minWidth: 120,
    minHeight: 60,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  tabletContainer: {
    minWidth: 140,
    minHeight: 80,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 10,
  },
  selectedContainer: {
    borderColor: '#FF3B30',
  },
  snapPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A0A0A0',
  },
  snapLeft: {
    left: -4,
    top: '50%',
    marginTop: -4,
  },
  snapRight: {
    right: -4,
    top: '50%',
    marginTop: -4,
  },
  snapTop: {
    top: -4,
    left: '50%',
    marginLeft: -4,
  },
  snapBottom: {
    bottom: -4,
    left: '50%',
    marginLeft: -4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 16,
    marginRight: 6,
  },
  iconTextTablet: {
    fontSize: 20,
    marginRight: 8,
  },
  typeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  typeDotTablet: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  labelTablet: {
    fontSize: 16,
  },
});

export default AtomBlockComponent;
