/**
 * Full-size version of the inspector preview.
 *
 * At the panel's ~0.3 scale the composition reads but the text does not, so the
 * same stage is offered again over the editor at whatever scale the window
 * allows — up to 1:1, where the preview is pixel-identical to the reader.
 */

import React, { useMemo } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { ScenePreviewStage } from '@/components/document-editor/inspector/ScenePreviewStage';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import { PREVIEW_DEVICE_IDS, type PreviewDevice } from '@/lib/document-editor/preview-viewport';
import type { PreviewFrame } from '@/lib/document-editor/preview-frames';
import type { ColorScheme } from '@/constants/theme';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';
import type { UserSettings } from '@/lib/user-settings';

interface ScenePreviewOverlayProps {
  onClose: () => void;
  frames: PreviewFrame[];
  storyId: string;
  device: PreviewDevice;
  onSelectDevice: (device: PreviewDevice) => void;
  layoutPreset: StoryReaderLayoutPreset;
  settings: Pick<UserSettings, 'textSize' | 'readerFontScale' | 'readerLineHeightScale'>;
  colorScheme?: ColorScheme;
  /** Shared with the panel's stepper so both stay on the same frame. */
  frameIndex: number;
  onFrameIndexChange: (index: number) => void;
}

export function ScenePreviewOverlay({
  onClose,
  frames,
  storyId,
  device,
  onSelectDevice,
  layoutPreset,
  settings,
  colorScheme,
  frameIndex,
  onFrameIndexChange,
}: ScenePreviewOverlayProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();

  const stage = useMemo(
    () => ({ width: Math.max(0, width - 160), height: Math.max(0, height - 200) }),
    [width, height],
  );

  const frame = frames[frameIndex] ?? null;

  return (
    // Mounted only while open (see DocumentInspectorPanel): React Native Web's
    // Modal keeps its DOM after `visible` flips to false when the exit
    // animation never settles, which reduced-motion environments trigger.
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: withAlpha('#000000', 0.72),
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 14,
          // React Native Web paints the Modal root with `pointer-events: none`
          // and does not reset it on the content, so the whole overlay would be
          // click-through — including its own Close button.
          ...getPointerEventsStyle('auto'),
        }}
      >
        <View
          style={{
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: withAlpha('#ffffff', 0.2),
          }}
        >
          <ScenePreviewStage
            frame={frame}
            device={device}
            stage={stage}
            storyId={storyId}
            layoutPreset={layoutPreset}
            settings={settings}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {PREVIEW_DEVICE_IDS.map((item) => (
            <Pressable
              key={item}
              onPress={() => onSelectDevice(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: item === device }}
              style={{
                paddingHorizontal: 16,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: item === device ? colors.primary : withAlpha('#ffffff', 0.3),
                backgroundColor: item === device ? withAlpha(colors.primary, 0.22) : withAlpha('#000000', 0.4),
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>
                {item === 'mobile' ? '📱 ' : '🖥 '}
                {t(item === 'mobile' ? 'document.preview.deviceMobile' : 'document.preview.deviceDesktop')}
              </Text>
            </Pressable>
          ))}

          <OverlayButton label="◀" disabled={frameIndex <= 0} onPress={() => onFrameIndexChange(frameIndex - 1)} />
          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800', minWidth: 90, textAlign: 'center' }}>
            {frames.length ? t('document.preview.frameCounter', { index: frameIndex + 1, total: frames.length }) : '—'}
          </Text>
          <OverlayButton
            label="▶"
            disabled={frameIndex >= frames.length - 1}
            onPress={() => onFrameIndexChange(frameIndex + 1)}
          />

          <OverlayButton label={t('common.close')} onPress={onClose} wide />
        </View>
      </View>
    </Modal>
  );
}

function OverlayButton({
  label,
  onPress,
  disabled,
  wide,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        minWidth: wide ? 96 : 36,
        minHeight: 36,
        paddingHorizontal: wide ? 14 : 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: withAlpha('#ffffff', 0.3),
        backgroundColor: withAlpha('#000000', 0.4),
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
