/**
 * Inventory UI Component
 * Displays player inventory with items
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useInventory } from '@/lib/inventory-context';
import type { InventoryItem } from '@/lib/interactive-types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function InventoryUI({ visible, onClose }: Props) {
  const colors = useColors();
  const { inventory } = useInventory();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const handleItemPress = (item: InventoryItem) => {
    setSelectedItem(item);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              🎒 Inventory
            </Text>
            <Text style={[styles.count, { color: colors.muted }]}>
              {inventory.items.length} / {inventory.maxSlots || '∞'}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={onClose}
            >
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>
                ✕
              </Text>
            </Pressable>
          </View>

          {/* Items Grid */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {inventory.items.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48, opacity: 0.3 }}>🎒</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  Your inventory is empty
                </Text>
              </View>
            ) : (
              inventory.items.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.itemCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor:
                        selectedItem?.id === item.id ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => handleItemPress(item)}
                >
                  {/* Item Icon */}
                  {item.iconUri ? (
                    <Image
                      source={{ uri: item.iconUri }}
                      style={styles.itemIcon}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.itemIcon,
                        { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
                      ]}
                    >
                      <Text style={{ fontSize: 32 }}>📦</Text>
                    </View>
                  )}

                  {/* Item Name */}
                  <Text
                    style={[styles.itemName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* Item Details */}
          {selectedItem && (
            <View
              style={[
                styles.detailsPanel,
                { backgroundColor: colors.surface, borderTopColor: colors.border },
              ]}
            >
              <View style={styles.detailsHeader}>
                <Text style={[styles.detailsTitle, { color: colors.foreground }]}>
                  {selectedItem.name}
                </Text>
                {selectedItem.category && (
                  <View
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.categoryText}>{selectedItem.category}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.detailsDescription, { color: colors.muted }]}>
                {selectedItem.description}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    width: '100%',
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  itemCard: {
    width: 90,
    height: 110,
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  itemName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  detailsPanel: {
    padding: 16,
    borderTopWidth: 1,
    minHeight: 100,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailsDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
