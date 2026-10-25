/**
 * "Read the scene as a comic" (docs/plans/COMIC-MODE-PLAN.md, section 9.4): the
 * scene run by the engine and shown by the reader's own comic view, at the
 * Preview's device size. Unlike the Preview's plan of every step, the run
 * follows conditions and waits for choices. It reads this scene alone, so it
 * stops where the scene would hand over to the next one.
 */
import React, { useMemo, useState } from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';

import { ComicReader } from '@/components/comic/ComicReader';
import { ComicReadingSession } from '@/components/comic/ComicReadingSession';
import { OverlayButton } from '@/components/document-editor/inspector/ScenePreviewOverlay';
import { SceneRuntimeHost } from '@/components/reader/SceneRuntimeHost';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { getPreviewGeometry, getPreviewLayerStyle, type PreviewDevice } from '@/lib/document-editor/preview-viewport';
import type { SceneComicSettings, TimelineStep } from '@/lib/engine/types';
import { getPointerEventsStyle } from '@/lib/react-native-web-interop';
import type { UserSettings } from '@/lib/user-settings';

interface ComicReadOverlayProps {
  sceneId: string;
  /** The scene as it was when the author asked to read it. */
  timeline: TimelineStep[];
  /** The scene's comic settings, so the reading draws the author's edits. */
  comic?: SceneComicSettings;
  storyId: string;
  device: PreviewDevice;
  settings: Pick<UserSettings, 'textSize' | 'readerFontScale'>;
  onClose: () => void;
}

export function ComicReadOverlay({ sceneId, timeline, comic, storyId, device, settings, onClose }: ComicReadOverlayProps) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  // Each "Read again" is a new run and a new strip.
  const [run, setRun] = useState(0);

  const stage = useMemo(
    () => ({ width: Math.max(0, width - 160), height: Math.max(0, height - 140) }),
    [width, height],
  );
  const geometry = useMemo(() => getPreviewGeometry(device, stage), [device, stage]);

  return (
    // Mounted only while open, like the expanded Preview: React Native Web's
    // Modal can keep its DOM after `visible` turns false.
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: withAlpha('#000000', 0.72),
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 14,
          // See ScenePreviewOverlay: the Modal root does not take clicks.
          ...getPointerEventsStyle('auto'),
        }}
      >
        <View
          testID="comic-read-stage"
          style={{
            width: geometry.renderedWidth,
            height: geometry.renderedHeight,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: withAlpha('#ffffff', 0.2),
          }}
        >
          <View style={getPreviewLayerStyle({ ...geometry, stageWidth: geometry.renderedWidth, stageHeight: geometry.renderedHeight })}>
            <ComicReadingSession active storyId={storyId} settings={settings} resetKey={run}>
              <SceneRuntimeHost key={run} timeline={timeline}>
                <ComicReader sceneId={sceneId} comic={comic} />
              </SceneRuntimeHost>
            </ComicReadingSession>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <OverlayButton label={t('document.preview.readAgain')} onPress={() => setRun((current) => current + 1)} wide />
          <OverlayButton label={t('common.close')} onPress={onClose} wide />
        </View>
      </View>
    </Modal>
  );
}
