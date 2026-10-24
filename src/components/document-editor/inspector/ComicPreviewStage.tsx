/**
 * The Preview's comic format (docs/plans/COMIC-MODE-PLAN.md, section 9.4): the
 * author's plan of the scene — every step, whatever a condition would skip —
 * drawn by the reader's own comic frame at a real device's size, then scaled
 * onto the stage like the novel's frames. The first `revealed` panels are
 * open, so the stepper walks through them.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { ComicPlanView } from '@/components/comic/ComicPlanView';
import { comicTextScale } from '@/components/comic/ComicReadingSession';
import type { ComicPagePlan } from '@/lib/comic/comic-layout';
import { getPreviewGeometry, getPreviewLayerStyle, type PreviewDevice } from '@/lib/document-editor/preview-viewport';
import type { UserSettings } from '@/lib/user-settings';

interface ComicPreviewStageProps {
  plan: ComicPagePlan;
  revealed: number;
  device: PreviewDevice;
  stage: { width: number; height: number };
  storyId: string;
  settings: Pick<UserSettings, 'textSize' | 'readerFontScale'>;
  /** Cap on upscaling; the panel keeps 1, the expanded overlay may allow more. */
  maxScale?: number;
}

export const ComicPreviewStage = React.memo(function ComicPreviewStage({
  plan,
  revealed,
  device,
  stage,
  storyId,
  settings,
  maxScale = 1,
}: ComicPreviewStageProps) {
  const geometry = useMemo(() => getPreviewGeometry(device, stage, { maxScale }), [device, maxScale, stage]);

  return (
    <View
      testID="comic-preview-stage"
      style={{ width: stage.width, height: stage.height, overflow: 'hidden', backgroundColor: '#141417' }}
    >
      <View style={getPreviewLayerStyle(geometry)}>
        <ComicPlanView
          plan={plan}
          storyId={storyId}
          revealed={revealed}
          textScale={comicTextScale(settings)}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
});
