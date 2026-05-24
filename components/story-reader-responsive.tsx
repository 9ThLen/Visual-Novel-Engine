/**
 * StoryReaderResponsive — modern visual novel reader.
 *
 * Features:
 *  • Typewriter text effect (configurable speed)
 *  • Fade + slide transitions between scenes
 *  • Auto-play mode (advances after typewriter completes)
 *  • Dialogue history log
 *  • Skip / fast-forward (tap = instant text, hold Skip = turbo)
 *  • Modern VN UI: full-screen bg, gradient overlay, speaker nameplate
 *  • Lazy image loading via expo-image
 *  • Dark / light theme
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { cn } from '@/lib/utils';
import { useColors } from '@/hooks/use-colors';
import { StoryScene, Choice, UserSettings } from '@/lib/types';
import type { CharacterPosition } from '@/lib/character-types';
import { getReaderLayout, getResponsiveFontSize } from '@/lib/responsive';
import { DialogueHistory, HistoryEntry } from './dialogue-history';
import { SplashScreenComponent } from './SplashScreen';
import { CharacterDisplay } from './CharacterDisplay';
import { useTypewriter } from '@/hooks/useTypewriter';
import { useSceneImages } from '@/hooks/useSceneImages';
import { enhancedAudioManager } from '@/lib/audio-manager-enhanced';
import { isReaderAudioSessionActive } from '@/lib/reader-audio-session';

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSpeaker(text: string): { speaker: string | null; body: string } {
  // Support "Name: dialogue…" format
  const match = text.match(/^([A-Za-zА-Яа-яҐґЄєІіЇї\u4e00-\u9fff][\w \u00c0-\u024f'.-]{0,30}?)\s*:\s*([\s\S]+)$/);
  if (match) return { speaker: match[1], body: match[2] };
  return { speaker: null, body: text };
}

// Auto-play delay after full text appears
const AUTO_PLAY_DELAY_MS = 2400;

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  scene: StoryScene;
  onContinue: (targetSceneId?: string) => void;
  onChoiceSelect: (choice: Choice) => void;
  isLoading?: boolean;
  settings?: Partial<UserSettings>;
  onHistoryVisibleChange?: (visible: boolean) => void;
}

const DIALOGUE_MARGIN_BOTTOM = 28;

// ── Component ──────────────────────────────────────────────────────────────

export function StoryReaderResponsive({
  scene,
  onContinue,
  onChoiceSelect,
  isLoading = false,
  settings = {},
  onHistoryVisibleChange,
}: Props) {
  const colors = useColors();
  const dims = useWindowDimensions();
  const layout = getReaderLayout(dims);
  const fontSize = getResponsiveFontSize(dims);

  const {
    textSpeed = 0.5,
    textSize = 'medium',
    autoPlay = false,
  } = settings;

  // ── Dialogue pages ──────────────────────────────────────────────────────
  const pages = useMemo(() => scene.text.split('\n\n').filter(Boolean), [scene.text]);

  const [pageIndex, setPageIndex] = useState(0);

  const { bgSource, resolvedCharUris } = useSceneImages(scene);

  // ── History ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    onHistoryVisibleChange?.(showHistory);
  }, [showHistory, onHistoryVisibleChange]);

  // ── Auto-play ───────────────────────────────────────────────────────────
  const [autoPlayActive, setAutoPlayActive] = useState(autoPlay);
  const autoPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ──────────────────────────────────────────────────────────
  const sceneOpacity = useSharedValue(1);
  const bgScale = useSharedValue(1);

  // ── Skip turbo mode ─────────────────────────────────────────────────────
  const [turbo, setTurbo] = useState(false);
  const turboInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Splash screen state ─────────────────────────────────────────────────
  const [showSplash, setShowSplash] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const uiOpacity = useSharedValue(1);

  // ── Typewriter ──────────────────────────────────────────────────────────
  const { displayedText, isTyping, startTypewriter, completeTypewriter } = useTypewriter(textSpeed);
  const textCompleteFiredRef = useRef<string | null>(null);

  // ── Scene change — fade in ───────────────────────────────────────────────
  useEffect(() => {
    setPageIndex(0);

    // Check if scene has splash screen
    if (scene.splashScreen?.splash) {
      setShowSplash(true);
      setUiVisible(false);
      // Don't return - let background load in parallel
    } else {
      sceneOpacity.value = 0;
      bgScale.value = 1.04;

      sceneOpacity.value = withTiming(1, { duration: 380 });
      bgScale.value = withTiming(1, { duration: 700 });
    }
  }, [scene.id, scene.splashScreen?.splash, sceneOpacity, bgScale]);

  useEffect(() => {
    const { body } = extractSpeaker(pages[pageIndex] ?? '');
    startTypewriter(body);
  }, [pageIndex, pages, startTypewriter]);

  useEffect(() => {
    textCompleteFiredRef.current = null;
  }, [scene.id]);

  useEffect(() => {
    if (isTyping || !scene.audioTriggers?.length || !isReaderAudioSessionActive()) return;

    const key = `${scene.id}-${pageIndex}`;
    if (textCompleteFiredRef.current === key) return;
    textCompleteFiredRef.current = key;

    enhancedAudioManager
      .executeTriggersByType(scene.audioTriggers, 'text_complete')
      .catch(() => {});
  }, [isTyping, scene.id, scene.audioTriggers, pageIndex]);

  useEffect(() => {
    if (isTyping) return;
    const raw = pages[pageIndex] ?? '';
    const { speaker, body } = extractSpeaker(raw);
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last?.text === body) return h;
      return [...h, { id: `${scene.id}-${pageIndex}-${Date.now()}`, speaker: speaker ?? undefined, text: body, sceneId: scene.id }];
    });
  }, [isTyping, pageIndex, scene.id, pages]);

  // ── Auto-advance (Scene-level) ──────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (uiVisible && !isTyping && scene.autoAdvance?.enabled && scene.autoAdvance.nextSceneId) {
      const delay = scene.autoAdvance.delay || 3000;
      timer = setTimeout(() => {
        // Find the choice that leads to the next scene, or trigger a generic continue
        const autoChoice = scene.choices.find(c => c.nextSceneId === scene.autoAdvance?.nextSceneId);
        if (autoChoice) {
          onChoiceSelect(autoChoice);
        } else {
          // If no specific choice, we assume the user wants to trigger the next scene logic
          onContinue(scene.autoAdvance?.nextSceneId);
        }
      }, delay);
    }

    return () => { if (timer) clearTimeout(timer); };
  }, [uiVisible, isTyping, scene.id, scene.autoAdvance, scene.choices, onChoiceSelect, onContinue]);

  // ── Auto-play (Page-level) ────────────────────────────────────────────
  const isLastPage = pageIndex === pages.length - 1;

  useEffect(() => {
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    if (!autoPlayActive || isTyping) return;

    autoPlayTimer.current = setTimeout(() => {
      if (isLastPage) {
        if (scene.choices.length === 0) onContinue();
        // If there are choices, don't auto-advance page-level auto-play
      } else {
        setPageIndex((p) => p + 1);
      }
    }, AUTO_PLAY_DELAY_MS);

    return () => { if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current); };
  }, [autoPlayActive, isTyping, isLastPage, scene.choices.length, onContinue]);

  // ── Turbo skip ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!turbo) {
      if (turboInterval.current) clearInterval(turboInterval.current);
      return;
    }
    turboInterval.current = setInterval(() => {
      if (isTyping) {
        completeTypewriter();
      } else if (!isLastPage) {
        setPageIndex((p) => p + 1);
      } else if (scene.choices.length === 0) {
        onContinue();
      } else {
        setTurbo(false);
      }
    }, 180);
    return () => { if (turboInterval.current) clearInterval(turboInterval.current); };
  }, [turbo, isTyping, isLastPage, scene.choices.length, onContinue, completeTypewriter]);

  // ── Tap handler ────────────────────────────────────────────────────────
  const handleTap = () => {
    if (isLoading) return;
    if (isTyping) { completeTypewriter(); return; }
    if (!isLastPage) { setPageIndex((p) => p + 1); return; }
    if (scene.choices.length === 0) onContinue();
  };

  // ── Font size from settings ────────────────────────────────────────────
  const dialogueFontSize =
    textSize === 'small' ? fontSize.sm :
    textSize === 'large' ? fontSize.lg :
    fontSize.md;

  // ── Speaker ────────────────────────────────────────────────────────────
  const { speaker } = extractSpeaker(pages[pageIndex] ?? '');

  // ── Splash handlers ────────────────────────────────────────────────────
  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    setUiVisible(true);

    sceneOpacity.value = 0;
    bgScale.value = 1.04;

    sceneOpacity.value = withTiming(1, { duration: 380 });
    bgScale.value = withTiming(1, { duration: 700 });
  }, [bgScale, sceneOpacity]);

  const handleUIHidden = useCallback(() => {
    uiOpacity.value = withTiming(0, {
      duration: scene.splashScreen?.uiHideTransition?.duration || 500,
    });
  }, [scene.splashScreen, uiOpacity]);

  const handleUIShown = useCallback(() => {
    uiOpacity.value = withTiming(1, {
      duration: scene.splashScreen?.uiShowTransition?.duration || 500,
    });
  }, [scene.splashScreen, uiOpacity]);

  // ── Animated styles ─────────────────────────────────────────────────────
  const bgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value,
    transform: [{ scale: bgScale.value }],
  }));

  const charactersAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  const dialogueAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sceneOpacity.value * uiOpacity.value,
  }));

  // ── UI ──────────────────────────────────────────────────────────────────
  const isPortrait = layout.dialoguePosition === 'bottom';

  return (
    <View className="flex-1 bg-black" style={{ overflow: 'hidden' }}>

      {/* ── Splash Screen ──────────────────────────────────────────────── */}
      {showSplash && scene.splashScreen?.splash && (
        <SplashScreenComponent
          splash={scene.splashScreen.splash}
          uiHideTransition={scene.splashScreen.uiHideTransition}
          uiShowTransition={scene.splashScreen.uiShowTransition}
          onComplete={handleSplashComplete}
          onUIHidden={handleUIHidden}
          onUIShown={handleUIShown}
        />
      )}

      {/* ── Background ────────────────────────────────────────────────── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, bgAnimatedStyle]}
      >
        {bgSource ? (
          <Image
            source={bgSource}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoad={() => {}}
            onError={(err) => { if (__DEV__) console.error('[StoryReader] Background load error:', err); }}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            transition={300}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1a1a2e' }]} />
        )}

      </Animated.View>

      {/* ── Characters ────────────────────────────────────────────────── */}
      {uiVisible && Object.keys(resolvedCharUris).length > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            charactersAnimatedStyle,
            {
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingBottom: isPortrait ? layout.dialogueHeight - 20 : 0,
            },
          ]}
          pointerEvents="none"
        >
          {scene.characters.map((char) => {
            const charSource = resolvedCharUris[char.id];
            if (!charSource) return null;
            const uri = typeof charSource === 'string' ? charSource : (charSource as { uri: string }).uri;
            return (
              <CharacterDisplay
                key={char.id}
                instance={{
                  id: char.id,
                  characterId: char.id,
                  spriteId: '',
                  position: 'center' as CharacterPosition,
                  zIndex: 0,
                  animatedOpacity: new (require('react-native').Animated.Value)(1),
                  animatedTranslateX: new (require('react-native').Animated.Value)(0),
                  animatedTranslateY: new (require('react-native').Animated.Value)(0),
                  animatedScale: new (require('react-native').Animated.Value)(1),
                }}
                spriteUri={uri}
                dialogueTop={isPortrait ? dims.height - layout.dialogueHeight : undefined}
              />
            );
          })}
        </Animated.View>
      )}


      {/* ── Main tappable area ────────────────────────────────────────── */}
      {uiVisible && (
        <Pressable
          style={{ flex: 1 }}
          onPress={handleTap}
          disabled={isLoading}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Continue reading"
          accessibilityHint="Tap to advance text or make a choice"
        />
      )}

      {/* ── Top controls ───────────────────────────────────────────────── */}
      {uiVisible && (
        <View
          className="absolute right-4 top-12 flex-row gap-2"
          pointerEvents="box-none"
        >
          <ControlButton
            label={autoPlayActive ? '⏸ Auto' : '▶ Auto'}
            active={autoPlayActive}
            onPress={() => setAutoPlayActive((a) => !a)}
            colors={colors}
            accessibilityLabel={autoPlayActive ? 'Stop auto-play' : 'Start auto-play'}
          />
          <ControlButton
            label="📖 Log"
            onPress={() => setShowHistory(true)}
            colors={colors}
            accessibilityLabel="Open dialogue history"
          />
        </View>
      )}

      {/* ── Dialogue box ──────────────────────────────────────────────── */}
      {uiVisible && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
            },
            dialogueAnimatedStyle,
          ]}
          pointerEvents="box-none"
        >
          <View className="mx-3 mb-7 rounded-2xl border overflow-hidden"
            style={{
              backgroundColor: colors.dialogueBg ?? 'rgba(15, 14, 23, 0.92)',
              borderColor: colors.border,
              marginBottom: DIALOGUE_MARGIN_BOTTOM,
            }}
          >
            {/* Speaker nameplate */}
            {speaker ? (
              <View
                className="self-start px-3.5 py-1 rounded-br-lg rounded-tl-xl"
                style={{
                  backgroundColor: colors.nameBg ?? colors.primary,
                }}
              >
                <Text className="text-white text-xs font-bold tracking-wider">
                  {speaker}
                </Text>
              </View>
            ) : null}

            <View className="p-4 min-h-[80]">
              <Text
                style={{
                  fontSize: dialogueFontSize,
                  lineHeight: dialogueFontSize * 1.65,
                  color: colors.foreground,
                  fontWeight: '400',
                }}
              >
                {displayedText}
                {isTyping && (
                  <Text style={{ color: colors.primary, opacity: 0.8 }}>█</Text>
                )}
              </Text>
            </View>

            {/* Choices */}
            {isLastPage && !isTyping && scene.choices.length > 0 && (
              <View className="px-3 pt-1 pb-3 gap-2">
                {scene.choices.map((choice) => (
                  <Pressable
                    key={choice.id}
                    style={({ pressed }) => ({
                      borderRadius: 12,
                      borderWidth: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      backgroundColor: colors.choiceBg ?? 'rgba(124,58,237,0.12)',
                      borderColor: colors.choiceBorder ?? colors.primary,
                      opacity: pressed ? 0.75 : 1,
                    })}
                    onPress={() => onChoiceSelect(choice)}
                    accessibilityRole="button"
                    accessibilityLabel={choice.text}
                  >
                    <Text
                      className="text-center font-medium leading-5"
                      style={{
                        color: colors.foreground,
                        fontSize: fontSize.sm,
                      }}
                      numberOfLines={3}
                    >
                      {choice.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Bottom bar: page indicator + skip */}
            <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
              {/* Page dots */}
              {pages.length > 1 ? (
                <View className="flex-row gap-1">
                  {pages.map((_, i) => (
                    <View
                      key={`dot-${i}`}
                      className={cn('rounded-full', i === pageIndex ? 'w-4 h-1.5' : 'w-1.5 h-1.5')}
                      style={{
                        backgroundColor: i === pageIndex ? colors.primary : colors.border,
                      }}
                    />
                  ))}
                </View>
              ) : <View />}

              <View className="flex-row gap-2 items-center">
                {/* Skip / fast-forward button */}
                {!isTyping && !isLastPage && (
                  <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>tap to continue ▼</Text>
                )}
                {isLastPage && !isTyping && scene.choices.length === 0 && (
                  <Text style={[{ color: colors.muted }, { fontSize: 12 }]}>tap to continue ▼</Text>
                )}
                <Pressable
                  style={{
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: turbo ? colors.primary : colors.border,
                    backgroundColor: turbo ? colors.primary : 'transparent',
                  }}
                  onPressIn={() => setTurbo(true)}
                  onPressOut={() => setTurbo(false)}
                  accessibilityRole="button"
                  accessibilityLabel={turbo ? 'Stop skip' : 'Skip text'}
                >
                  <Text className={cn('text-xs font-semibold', turbo ? 'text-white' : 'text-muted')}>
                    ⏩ Skip
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ── Dialogue history drawer ───────────────────────────────────── */}
      <DialogueHistory
        visible={showHistory}
        entries={history}
        onClose={() => setShowHistory(false)}
      />
    </View>
  );
}

// ── Small control button ───────────────────────────────────────────────────

function ControlButton({
  label,
  active = false,
  onPress,
  colors,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active
          ? colors.primary
          : 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: active ? colors.primary : 'rgba(255,255,255,0.18)',
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}