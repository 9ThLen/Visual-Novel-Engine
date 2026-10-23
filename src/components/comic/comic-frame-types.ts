import type { StyleProp, ViewStyle } from 'react-native';

import type { ComicFrameStrip } from '@/lib/comic/comic-frame-protocol';

export interface ComicFrameProps {
  /** Sent once the frame says it is ready, and again whenever it changes. */
  strip: ComicFrameStrip | null;
  /** The reader's font scale. The frame sets its own text by it, so the platform's text zoom is kept out. */
  textScale: number;
  /** The reader tapped the strip: the next panel, or the next step. */
  onTap: () => void;
  onChoose: (optionId: string) => void;
  /** The strip as drawn: panels on screen and the pages they make. */
  onLayout?: (layout: { panels: number; pages: number }) => void;
  style?: StyleProp<ViewStyle>;
}
