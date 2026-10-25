/**
 * The inspector's preview widget: a device viewport, the format and device
 * switches under it, and a stepper that scrubs the scene's frames — or, in the
 * comic format, its panels.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ComicPreviewStage } from '@/components/document-editor/inspector/ComicPreviewStage';
import { ScenePreviewStage } from '@/components/document-editor/inspector/ScenePreviewStage';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { INSPECTOR_RAIL_PADDING, INSPECTOR_RAIL_WIDTH } from '@/components/document-editor/inspector/rail-metrics';
import { PREVIEW_DEVICE_IDS, PREVIEW_FORMATS, type PreviewDevice, type PreviewFormat } from '@/lib/document-editor/preview-viewport';
import type { ComicPagePlan } from '@/lib/comic/comic-layout';
import type { PreviewFrame } from '@/lib/document-editor/preview-frames';
import type { ColorScheme } from '@/constants/theme';
import type { StoryReaderLayoutPreset } from '@/lib/story-theme';
import type { UserSettings } from '@/lib/user-settings';

const STAGE_HEIGHT = 300;

/**
 * Stage width derived from the rail's own geometry rather than measured.
 *
 * RN Web's `onLayout` does not fire for this View, so the stage would stay at
 * zero and render nothing if it were the only source. `onLayout` is still wired
 * up as a self-correcting refinement for when the rail is not its usual width.
 */
const STAGE_WIDTH = INSPECTOR_RAIL_WIDTH - INSPECTOR_RAIL_PADDING * 2 - 2;

interface ScenePreviewCardProps {
  colorScheme?: ColorScheme;
  frames: PreviewFrame[];
  storyId: string;
  device: PreviewDevice;
  onSelectDevice: (device: PreviewDevice) => void;
  layoutPreset: StoryReaderLayoutPreset;
  settings: Pick<UserSettings, 'textSize' | 'readerFontScale' | 'readerLineHeightScale'>;
  /** Controlled by the inspector so the expanded overlay opens on the same frame. */
  frameIndex: number;
  onFrameIndexChange: (index: number) => void;
  onExpand?: () => void;
  format: PreviewFormat;
  onSelectFormat: (format: PreviewFormat) => void;
  /** The author's plan of the scene, for the comic format. */
  comicPlan: ComicPagePlan;
  /** The last open panel of the plan; controlled like `frameIndex`. */
  panelIndex: number;
  onPanelIndexChange: (index: number) => void;
  /** Runs the scene in the reader's comic view. */
  onReadAsComic?: () => void;
}

export function ScenePreviewCard({
  colorScheme,
  frames,
  storyId,
  device,
  onSelectDevice,
  layoutPreset,
  settings,
  frameIndex,
  onFrameIndexChange,
  onExpand,
  format,
  onSelectFormat,
  comicPlan,
  panelIndex,
  onPanelIndexChange,
  onReadAsComic,
}: ScenePreviewCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [stageSize, setStageSize] = useState({ width: STAGE_WIDTH, height: STAGE_HEIGHT });

  const frame = frames[frameIndex] ?? null;
  const isComic = format === 'comic';
  const total = isComic ? comicPlan.panels.length : frames.length;
  const stage = useMemo(
    () => ({ width: stageSize.width, height: stageSize.height }),
    [stageSize.width, stageSize.height],
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '800' }}>
          {t('document.preview.title')}
        </Text>
        {onExpand ? (
          <Pressable
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={t('document.preview.expand')}
            style={{
              minWidth: 28,
              minHeight: 28,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 7,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>⤢</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) return;
          setStageSize((current) =>
            current.width === width && current.height === height ? current : { width, height },
          );
        }}
        style={{
          height: STAGE_HEIGHT,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        }}
      >
        {stage.width > 0 && stage.height > 0 ? (
          isComic && total ? (
            <ComicPreviewStage
              plan={comicPlan}
              revealed={panelIndex + 1}
              device={device}
              stage={stage}
              storyId={storyId}
              settings={settings}
              onSelectPanel={onPanelIndexChange}
            />
          ) : !isComic && total ? (
            <ScenePreviewStage
              frame={frame}
              device={device}
              stage={stage}
              storyId={storyId}
              layoutPreset={layoutPreset}
              settings={settings}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
                {t(isComic ? 'document.preview.comicEmpty' : 'document.preview.empty')}
              </Text>
            </View>
          )
        ) : null}
      </View>

      <PreviewFormatSwitch colors={colors} format={format} onSelect={onSelectFormat} />
      <DevicePreviewSwitch colors={colors} device={device} onSelect={onSelectDevice} />

      <FrameStepper
        colors={colors}
        kind={isComic ? 'panel' : 'frame'}
        index={isComic ? panelIndex : frameIndex}
        total={total}
        onChange={isComic ? onPanelIndexChange : onFrameIndexChange}
      />

      {isComic && onReadAsComic && total ? (
        <Pressable
          onPress={onReadAsComic}
          accessibilityRole="button"
          testID="preview-read-as-comic"
          style={{
            minHeight: 34,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 7,
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: colors.background, fontSize: 12, fontWeight: '800' }}>
            {`▶ ${t('document.preview.readAsComic')}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Novel or comic: what the Preview draws, apart from the device it draws it for. */
export function PreviewFormatSwitch({
  colors,
  format,
  onSelect,
}: {
  colors: ReturnType<typeof useColors>;
  format: PreviewFormat;
  onSelect: (format: PreviewFormat) => void;
}) {
  const { t } = useI18n();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', padding: 2, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}
    >
      {PREVIEW_FORMATS.map((item) => {
        const active = item === format;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            testID={`preview-format-${item}`}
            style={{
              flex: 1,
              minHeight: 28,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              backgroundColor: active ? withAlpha(colors.primary, 0.14) : 'transparent',
            }}
          >
            <Text style={{ color: active ? colors.primary : colors.muted, fontSize: 12, fontWeight: '800' }}>
              {t(item === 'novel' ? 'document.preview.formatNovel' : 'document.preview.formatComic')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DevicePreviewSwitch({
  colors,
  device,
  onSelect,
}: {
  colors: ReturnType<typeof useColors>;
  device: PreviewDevice;
  onSelect: (device: PreviewDevice) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {PREVIEW_DEVICE_IDS.map((item) => {
        const active = item === device;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`preview-device-${item}`}
            style={{
              flex: 1,
              minHeight: 34,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderRadius: 7,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? withAlpha(colors.primary, 0.12) : colors.background,
            }}
          >
            <Text style={{ fontSize: 13 }}>{item === 'mobile' ? '📱' : '🖥'}</Text>
            <Text
              style={{
                color: active ? colors.primary : colors.foreground,
                fontSize: 12,
                fontWeight: '800',
              }}
            >
              {t(item === 'mobile' ? 'document.preview.deviceMobile' : 'document.preview.deviceDesktop')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FrameStepper({
  colors,
  kind,
  index,
  total,
  onChange,
}: {
  colors: ReturnType<typeof useColors>;
  /** Frames of the novel or panels of the comic. */
  kind: 'frame' | 'panel';
  index: number;
  total: number;
  onChange: (index: number) => void;
}) {
  const { t } = useI18n();
  const canGoBack = index > 0;
  const canGoForward = index < total - 1;

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <StepperButton
          colors={colors}
          label="◀"
          disabled={!canGoBack}
          onPress={() => onChange(index - 1)}
          accessibilityLabel={t(kind === 'panel' ? 'document.preview.previousPanel' : 'document.preview.previousFrame')}
        />
        <Text
          testID="preview-frame-counter"
          style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' }}
        >
          {total ? t(kind === 'panel' ? 'document.preview.panelCounter' : 'document.preview.frameCounter', { index: index + 1, total }) : '—'}
        </Text>
        <StepperButton
          colors={colors}
          label="▶"
          disabled={!canGoForward}
          onPress={() => onChange(index + 1)}
          accessibilityLabel={t(kind === 'panel' ? 'document.preview.nextPanel' : 'document.preview.nextFrame')}
        />
      </View>

      <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.primary,
            width: total > 0 ? `${((index + 1) / total) * 100}%` : '0%',
          }}
        />
      </View>
    </View>
  );
}

function StepperButton({
  colors,
  label,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  colors: ReturnType<typeof useColors>;
  label: string;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={{
        width: 34,
        minHeight: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
