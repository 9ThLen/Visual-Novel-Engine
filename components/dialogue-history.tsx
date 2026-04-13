/**
 * DialogueHistory — slide-up drawer showing all past dialogue lines.
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

export interface HistoryEntry {
  id: string;
  speaker?: string;
  text: string;
  sceneId: string;
}

interface Props {
  visible: boolean;
  entries: HistoryEntry[];
  onClose: () => void;
}

export function DialogueHistory({ visible, entries, onClose }: Props) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { height } = Dimensions.get('window');

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  // Don't render if not visible and animation is complete
  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { transform: [{ translateY }], zIndex: 200 },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Backdrop */}
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={onClose}
      />

      {/* Drawer panel */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: height * 0.72,
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          overflow: 'hidden',
        }}
      >
        {/* Handle + header */}
        <View
          style={{
            alignItems: 'center',
            paddingTop: 12,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              position: 'absolute',
              top: 8,
              alignSelf: 'center',
              left: '50%',
              marginLeft: -18,
            }}
          />
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground, marginTop: 12 }}>
            Dialogue History
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 12 })}
          >
            <Text style={{ fontSize: 22, color: colors.muted }}>✕</Text>
          </Pressable>
        </View>

        {entries.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>No history yet.</Text>
          </View>
        ) : (
          <FlatList
            data={[...entries].reverse()}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item, index }) => (
              <View
                style={{
                  opacity: index === 0 ? 1 : 0.72 - index * 0.04,
                }}
              >
                {item.speaker ? (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: colors.primary,
                      marginBottom: 3,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    {item.speaker}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 21 }}>
                  {item.text}
                </Text>
                {index < entries.length - 1 && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: colors.border,
                      marginTop: 12,
                    }}
                  />
                )}
              </View>
            )}
          />
        )}
      </View>
    </Animated.View>
  );
}
