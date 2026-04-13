/**
 * Splash Screen Editor Component
 * UI for configuring splash screens with presets
 */

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '@/hooks/use-colors';
import type { SplashScreenConfig, SplashScreen } from '@/lib/splash-types';
import { SPLASH_PRESETS } from '@/lib/splash-types';
import { addAssetToLibrary } from './media-library';

interface Props {
  config?: SplashScreenConfig;
  onChange: (config: SplashScreenConfig | undefined) => void;
}

export function SplashScreenEditor({ config, onChange }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const splash = config?.splash;

  const handleToggle = () => {
    if (config) {
      onChange(undefined);
    } else {
      onChange(SPLASH_PRESETS[0].config);
    }
  };

  const handlePresetSelect = (presetConfig: SplashScreenConfig) => {
    onChange({
      ...presetConfig,
      splash: splash ? { ...presetConfig.splash!, uri: splash.uri } : presetConfig.splash,
    });
  };

  const handlePickMedia = async () => {
    if (!splash) return;

    if (splash.type === 'image') {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        const name = result.assets[0].fileName ?? uri.split('/').pop() ?? 'splash';
        await addAssetToLibrary(uri, name, 'image');
        updateSplash({ uri });
      }
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const { uri, name } = result.assets[0];
        await addAssetToLibrary(uri, name ?? 'splash', 'audio');
        updateSplash({ uri });
      }
    }
  };

  const updateSplash = (updates: Partial<SplashScreen>) => {
    if (!config?.splash) return;
    onChange({
      ...config,
      splash: { ...config.splash, ...updates },
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
          marginBottom: config ? 12 : 0,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
          🎬 Splash Screen
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {config && (
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
          )}
          <Pressable
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: config ? colors.error : colors.primary,
              opacity: pressed ? 0.8 : 1,
            })}
            onPress={handleToggle}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {config ? 'Remove' : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>

      {config && expanded && (
        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
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
              Presets
            </Text>
            <View style={{ gap: 6 }}>
              {SPLASH_PRESETS.map((preset) => (
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
                  onPress={() => handlePresetSelect(preset.config)}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.foreground,
                      marginBottom: 2,
                    }}
                  >
                    {preset.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {preset.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {splash && (
            <>
              {/* Media file */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 6,
                  }}
                >
                  Media File ({splash.type})
                </Text>
                <View
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: splash.uri ? colors.foreground : colors.muted,
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {splash.uri ? splash.uri.split('/').pop() : 'No file selected'}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => ({
                    backgroundColor: colors.primary,
                    paddingVertical: 9,
                    borderRadius: 6,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                  onPress={handlePickMedia}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                    📂 Pick {splash.type === 'image' ? 'Image' : 'Video'}
                  </Text>
                </Pressable>
              </View>

              {/* Duration */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 6,
                  }}
                >
                  Duration (ms)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 10,
                    color: colors.foreground,
                    fontSize: 13,
                  }}
                  placeholder="3000"
                  placeholderTextColor={colors.muted}
                  value={String(splash.duration)}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 3000;
                    updateSplash({ duration: num });
                  }}
                  keyboardType="numeric"
                />
              </View>

              {/* Fade In */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 6,
                  }}
                >
                  Fade In (ms)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 10,
                    color: colors.foreground,
                    fontSize: 13,
                  }}
                  placeholder="500"
                  placeholderTextColor={colors.muted}
                  value={String(splash.fadeIn ?? 500)}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 500;
                    updateSplash({ fadeIn: num });
                  }}
                  keyboardType="numeric"
                />
              </View>

              {/* Fade Out */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.muted,
                    marginBottom: 6,
                  }}
                >
                  Fade Out (ms)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 10,
                    color: colors.foreground,
                    fontSize: 13,
                  }}
                  placeholder="500"
                  placeholderTextColor={colors.muted}
                  value={String(splash.fadeOut ?? 500)}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 500;
                    updateSplash({ fadeOut: num });
                  }}
                  keyboardType="numeric"
                />
              </View>

              {/* Options */}
              <View style={{ gap: 8 }}>
                <Pressable
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: 10,
                    backgroundColor: colors.background,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  onPress={() => updateSplash({ pauseOnSplash: !splash.pauseOnSplash })}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: colors.primary,
                      backgroundColor: splash.pauseOnSplash
                        ? colors.primary
                        : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {splash.pauseOnSplash && (
                      <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 13 }}>
                    Pause story during splash
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {config && !expanded && (
        <Text style={{ fontSize: 12, color: colors.muted }}>
          Splash configured • {splash?.duration}ms • {splash?.type}
        </Text>
      )}
    </View>
  );
}
