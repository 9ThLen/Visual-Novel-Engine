import type { StyleProp, ViewStyle } from 'react-native';

import type {
  ComicFrameMessage,
  ComicHostMessage,
  ComicRendererFont,
  ComicSpikeStrip,
} from '@/lib/comic/spike/comic-renderer-html';

export interface ComicSpikeFrameHandle {
  send: (message: ComicHostMessage) => void;
}

export interface ComicSpikeFrameProps {
  /** Sent once the frame reports ready, and again whenever it changes. */
  strip: ComicSpikeStrip | null;
  textScale: number;
  virtualize: boolean;
  keepScreens: number;
  font?: ComicRendererFont;
  /**
   * Android only. 'explicit' pins the WebView's own text zoom at 100 % and
   * hands the system font scale to the renderer as `textScale`, so the
   * renderer knows how large its text is; 'system' leaves the WebView to
   * scale text behind the renderer's back, to see what that does.
   */
  textZoomMode?: 'explicit' | 'system';
  /**
   * Native renderer only: the bundled image modules by key. expo-image loads
   * a module directly; the file:///android_res/ URLs the WebView reads are
   * nothing it understands.
   */
  imageModules?: Record<string, number>;
  onMessage: (message: ComicFrameMessage) => void;
  style?: StyleProp<ViewStyle>;
}
