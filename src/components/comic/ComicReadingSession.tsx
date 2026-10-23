/**
 * The reading session above the scenes: one comic frame for every comic scene
 * read one after another, so a comic scene right after another continues the
 * same strip (docs/plans/COMIC-MODE-PLAN.md, section 2; the logic is
 * comic-reading-session.ts).
 *
 * Each scene's ComicReader lives under that scene's SceneRuntimeHost and goes
 * when the scene does; it publishes its part of the strip here, and the frame,
 * which stays, draws the whole. A scene read as the novel ends the strip: the
 * page slides up and away over the novel. A strip that starts after a novel
 * scene comes in as the previous scene's transition says — a fade, a slide, or
 * at once.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  comicSessionReducer,
  composeComicSession,
  EMPTY_COMIC_SESSION,
  type ComicSessionSegment,
} from '@/lib/comic/comic-reading-session';
import type { ReaderTransitionEvent } from '@/lib/reader-runtime';
import type { UserSettings } from '@/lib/user-settings';

import { ComicPlanView } from './ComicPlanView';

export interface ComicSessionHandlers {
  onTap: () => void;
  onChoose: (optionId: string) => void;
}

export interface ComicSession {
  /** A key for a new visit of a scene. */
  begin(): string;
  /** The current scene's segment as it now is, and who answers the frame. */
  publish(segment: ComicSessionSegment, handlers: ComicSessionHandlers): void;
  /** The scene was left for the next one. */
  end(key: string): void;
  /** Going back from the scene's start: it and the scene before it leave the strip. */
  rollBack(key: string): void;
}

const ComicSessionContext = createContext<ComicSession | null>(null);

export function useComicSession(): ComicSession | null {
  return useContext(ComicSessionContext);
}

/** How long the strip takes to slide away when the story returns to the novel. */
export const COMIC_EXIT_MS = 420;
/** Room above the strip for the reader screen's menu button (top 48 px). */
const TOP_ROOM = 88;
const TEXT_SIZE_SCALE = { small: 0.9, medium: 1, large: 1.15 } as const;
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

interface ComicReadingSessionProps {
  /** Whether the scene on screen is read as a comic. */
  active: boolean;
  storyId: string;
  settings?: Partial<UserSettings>;
  /** A new value — a loaded save — ends the strip. */
  resetKey?: string | number;
  /** How a strip comes in after a scene read as the novel. */
  entryTransition?: Pick<ReaderTransitionEvent, 'transitionType' | 'durationSec'> | null;
  children: React.ReactNode;
}

export function ComicReadingSession({
  active,
  storyId,
  settings = {},
  resetKey,
  entryTransition,
  children,
}: ComicReadingSessionProps) {
  const [state, dispatch] = useReducer(comicSessionReducer, EMPTY_COMIC_SESSION);
  const handlersRef = useRef<ComicSessionHandlers | null>(null);
  const visitRef = useRef(0);
  const { height } = useWindowDimensions();
  const textScale = (settings.readerFontScale ?? 1) * TEXT_SIZE_SCALE[settings.textSize ?? 'medium'];

  const session = useMemo<ComicSession>(() => ({
    begin: () => {
      visitRef.current += 1;
      return `v${visitRef.current}`;
    },
    publish: (segment, handlers) => {
      handlersRef.current = handlers;
      dispatch({ type: 'publish', segment });
    },
    end: (key) => dispatch({ type: 'end', key }),
    rollBack: (key) => dispatch({ type: 'rollBack', key }),
  }), []);

  // A loaded save starts the scene over, and the strip with it.
  const firstResetRef = useRef(resetKey);
  useEffect(() => {
    if (firstResetRef.current === resetKey) return;
    firstResetRef.current = resetKey;
    dispatch({ type: 'clear' });
  }, [resetKey]);

  const hasStrip = state.past.length > 0 || state.current !== null;
  const view = useMemo(() => composeComicSession(state), [state]);

  // The story went back to the novel: the page slides up, then the strip ends.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (active || !hasStrip) {
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      dispatch({ type: 'clear' });
      setLeaving(false);
    }, COMIC_EXIT_MS);
    return () => clearTimeout(timer);
  }, [active, hasStrip]);

  // The frame stays while the scene on screen is a comic, even with nothing
  // in the strip for a moment (Back to the scene before, a loaded save), so
  // the strip is rebuilt in place rather than in a new frame; and while the
  // strip slides away.
  const showFrame = active || hasStrip;

  const opacity = useSharedValue(1);
  const shift = useSharedValue(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!showFrame) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    // The frame comes in the way the scene before it hands over.
    const type = entryTransition?.transitionType ?? 'fade';
    const duration = Math.max(0, Math.round((entryTransition?.durationSec ?? 0.38) * 1000));
    if (type === 'instant' || duration === 0) {
      opacity.value = 1;
      shift.value = 0;
      return;
    }
    opacity.value = 0;
    shift.value = type === 'slide' ? 48 : 0;
    opacity.value = withTiming(1, { duration });
    shift.value = withTiming(0, { duration });
  }, [entryTransition, opacity, shift, showFrame]);

  useEffect(() => {
    if (leaving) shift.value = withTiming(-height, { duration: COMIC_EXIT_MS });
  }, [height, leaving, shift]);

  const handleTap = useCallback(() => handlersRef.current?.onTap(), []);
  const handleChoose = useCallback((optionId: string) => handlersRef.current?.onChoose(optionId), []);

  const frameStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: shift.value }],
  }));

  return (
    <ComicSessionContext.Provider value={session}>
      <View style={{ flex: 1, backgroundColor: '#141417' }}>
        {showFrame && (
          <Animated.View
            pointerEvents={leaving ? 'none' : 'auto'}
            // Under the scene while it is a comic (its controls stay on top);
            // over the novel while it slides away.
            style={[FILL, { paddingTop: TOP_ROOM, backgroundColor: '#141417', zIndex: leaving ? 3 : 1 }, frameStyle]}
          >
            <ComicPlanView
              plan={view.plan}
              storyId={storyId}
              revealed={view.revealed}
              choices={view.choices}
              panelChoices={view.panelChoices}
              textScale={textScale}
              onTap={handleTap}
              onChoose={handleChoose}
            />
          </Animated.View>
        )}
        <View pointerEvents="box-none" style={[FILL, { zIndex: 2 }]}>
          {children}
        </View>
      </View>
    </ComicSessionContext.Provider>
  );
}
