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
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/use-colors';
import { StoryScene, Choice, UserSettings } from '@/lib/types';
import { getReaderLayout, getResponsiveFontSize } from '@/lib/responsive';
import { DialogueHistory, HistoryEntry } from './dialogue-history';
import { SplashScreenComponent } from './SplashScreen';
import { resolveAssetUri, getBundledAsset } from '@/lib/asset-resolver';

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSpeaker(text: string): { speaker: string | null; body: string } {
  // Support "Name: dialogue…" format
  const match = text.match(/^([A-Za-zА-Яа-яҐґЄєІіЇї\u4e00-\u9fff]{1,24})\s*:\s*([\s\S]+)$/);
  if (match) return { speaker: match[1], body: match[2] };
  return { speaker: null, body: text };
}

// Speed mapping: 0=slow (60ms/char) → 1=fast (12ms/char)
function charDelayMs(textSpeed: number): number {
  return Math.round(60 - textSpeed * 48);
}

// Auto-play delay after full text appears
const AUTO_PLAY_DELAY_MS = 2400;

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  scene: StoryScene;
  onContinue: () => void;
  onChoiceSelect: (choice: Choice) => void;
  isLoading?: boolean;
  settings?: Partial<UserSettings>;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StoryReaderResponsive({
  scene,
  onContinue,
  onChoiceSelect,
  isLoading = false,
  settings = {},
}: Props) {
  const colors = useColors();
  const layout = getReaderLayout();
  const fontSize = getResponsiveFontSize();

  const {
    textSpeed = 0.5,
    textSize = 'medium',
    autoPlay = false,
  } = settings;

  // ── Dialogue pages ──────────────────────────────────────────────────────
  const pages = useMemo(() => scene.text.split('\n\n').filter(Boolean), [scene.text]);

  const [pageIndex, setPageIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // ── Resolved asset URIs ─────────────────────────────────────────────────
  const [bgSource, setBgSource] = useState<any>(null);
  const [resolvedCharUris, setResolvedCharUris] = useState<Record<string, string>>({});

  // Resolve background image URI when scene changes
  useEffect(() => {
    let mounted = true;
    const bgUri = scene.backgroundImageUri;

    if (!bgUri) {
      setBgSource(null);
      return;
    }


    // Try direct bundled asset first
    const bundledAsset = getBundledAsset(bgUri);
    if (bundledAsset) {
      setBgSource(bundledAsset);
    } else {
      console.warn('[StoryReader] Bundled asset NOT found:', bgUri);
      // Try async resolution as fallback
      resolveAssetUri(bgUri).then((uri) => {
        if (!mounted) {
          return;
        }
        if (uri) {
          // Use direct URI string for consistency with bundled assets
          setBgSource(uri);
        } else {
          console.error('[StoryReader] Failed to resolve background:', bgUri);
          setBgSource(null);
        }
      }).catch((error) => {
        console.error('[StoryReader] Error resolving background:', error);
        if (mounted) setBgSource(null);
      });
    }

    return () => {
      mounted = false;
    };
  }, [scene.id]); // Only depend on scene.id to avoid re-renders

  // Resolve character image URIs when scene changes
  useEffect(() => {
    const chars = scene.characters;
    if (!chars || chars.length === 0) {
      setResolvedCharUris({});
      return;
    }


    const resolved: Record<string, any> = {};
    for (const char of chars) {
      const bundledAsset = getBundledAsset(char.imageUri);
      if (bundledAsset) {
        resolved[char.id] = bundledAsset;
      } else {
        console.warn('[StoryReader] Character asset NOT found:', char.id, char.imageUri);
      }
    }
    setResolvedCharUris(resolved);
  }, [scene.id]); // Only depend on scene.id

  // ── History ─────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Auto-play ───────────────────────────────────────────────────────────
  const [autoPlayActive, setAutoPlayActive] = useState(autoPlay);
  const autoPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ──────────────────────────────────────────────────────────
  const sceneOpacity = useRef(new Animated.Value(1)).current;
  const dialogueSlide = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1)).current;

  // ── Skip turbo mode ─────────────────────────────────────────────────────
  const [turbo, setTurbo] = useState(false);
  const turboInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Splash screen state ─────────────────────────────────────────────────
  const [showSplash, setShowSplash] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const uiOpacity = useRef(new Animated.Value(1)).current;

  // ── Typewriter ──────────────────────────────────────────────────────────
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTarget = useRef('');

  const startTypewriter = useCallback((text: string) => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    currentTarget.current = text;
    setDisplayedText('');
    setIsTyping(true);
    let idx = 0;
    const delay = charDelayMs(textSpeed);

    typewriterRef.current = setInterval(() => {
      idx++;
      setDisplayedText(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(typewriterRef.current!);
        typewriterRef.current = null;
        setIsTyping(false);
      }
    }, delay);
  }, [textSpeed]);

  const completeTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setDisplayedText(currentTarget.current);
    setIsTyping(false);
  }, []);

  // ── Scene change — fade in ───────────────────────────────────────────────
  useEffect(() => {
    setPageIndex(0);
    setDisplayedText('');

    // Check if scene has splash screen
    if (scene.splashScreen?.splash) {
      setShowSplash(true);
      setUiVisible(false);
      // Don't return - let background load in parallel
    } else {
      // Entrance animation
      sceneOpacity.setValue(0);
      dialogueSlide.setValue(40);
      bgScale.setValue(1.04);

      Animated.parallel([
        Animated.timing(sceneOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(dialogueSlide, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
        Animated.timing(bgScale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]).start();
    }
  }, [scene.id]);

  // ── Start typewriter when page changes ──────────────────────────────────
  useEffect(() => {
    const { body } = extractSpeaker(pages[pageIndex] ?? '');
    startTypewriter(body);
  }, [pageIndex, pages]);

  // ── Push to history when page fully shown ───────────────────────────────
  useEffect(() => {
    if (isTyping) return;
    const raw = pages[pageIndex] ?? '';
    const { speaker, body } = extractSpeaker(raw);
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last?.text === body) return h;
      return [...h, { id: `${scene.id}-${pageIndex}-${Date.now()}`, speaker: speaker ?? undefined, text: body, sceneId: scene.id }];
    });
  }, [isTyping, pageIndex, scene.id]);

  // ── Auto-play ────────────────────────────────────────────────────────────
  const isLastPage = pageIndex === pages.length - 1;

  useEffect(() => {
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    if (!autoPlayActive || isTyping) return;

    autoPlayTimer.current = setTimeout(() => {
      if (isLastPage) {
        if (scene.choices.length === 0) onContinue();
        // If there are choices, don't auto-advance
      } else {
        setPageIndex((p) => p + 1);
      }
    }, AUTO_PLAY_DELAY_MS);

    return () => { if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current); };
  }, [autoPlayActive, isTyping, isLastPage, scene.choices.length, onContinue];

  // ── Turbo skip ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!turbo) {
      if (turboInterval.current) clearInterval(turboInterval.current);
      return;
    }
    turboInterval.current = setInterval(() => {
      if (typewriterRef.current) {
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
  }, [turbo, isLastPage, scene.choices.length, onContinue]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    if (turboInterval.current) clearInterval(turboInterval.current);
  }, []);

  // ── Tap handler ──────────────────────────────────────────────────────────
  const handleTap = () => {
    if (isLoading) return;
    if (isTyping) { completeTypewriter(); return; }
    if (!isLastPage) { setPageIndex((p) => p + 1); return; }
    if (scene.choices.length === 0) onContinue();
  };

  // ── Font size from settings ───────────────────────────────────────────────
  const dialogueFontSize =
    textSize === 'small' ? fontSize.sm :
    textSize === 'large' ? fontSize.lg :
    fontSize.md;

  // ── Speaker ───────────────────────────────────────────────────────────────
  const { speaker } = extractSpeaker(pages[pageIndex] ?? '');

  // ── Splash handlers ───────────────────────────────────────────────────────
  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    setUiVisible(true);

    // Start normal scene entrance animation
    sceneOpacity.setValue(0);
    dialogueSlide.setValue(40);
    bgScale.setValue(1.04);

    Animated.parallel([
      Animated.timing(sceneOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(dialogueSlide, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(bgScale, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleUIHidden = useCallback(() => {
    Animated.timing(uiOpacity, {
      toValue: 0,
      duration: scene.splashScreen?.uiHideTransition?.duration || 500,
      useNativeDriver: true,
    }).start();
  }, [scene.splashScreen]);

  const handleUIShown = useCallback(() => {
    Animated.timing(uiOpacity, {
      toValue: 1,
      duration: scene.splashScreen?.uiShowTransition?.duration || 500,
      useNativeDriver: true,
    }).start();
  }, [scene.splashScreen]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const isPortrait = layout.dialoguePosition === 'bottom';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── Splash Screen ─────────────────────────────────────────────────── */}
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

      {/* ── Background ────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: uiVisible ? sceneOpacity : 0, transform: [{ scale: bgScale }] },
        ]}
      >
        {bgSource ? (
          <Image
            source={bgSource}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoad={() => console.log('[StoryReader] Background image loaded successfully')}
            onError={(error) => console.error('[StoryReader] Background image load error:', error)}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            transition={300}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1a1a2e' }]} />
        )}
      </Animated.View>

      {/* ── Characters ────────────────────────────────────────────────────── */}
      {uiVisible && scene.characters.length > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingBottom: isPortrait ? layout.dialogueHeight - 20 : 0,
              opacity: Animated.multiply(sceneOpacity, uiOpacity),
            },
          ]}
          pointerEvents="none"
        >
          {scene.characters.map((char) => {
            const charSource = resolvedCharUris[char.id];
            if (!charSource) return null;
            return (
              <Image
                key={char.id}
                source={charSource}
                style={{
                  height: layout.backgroundHeight * 0.78,
                  width: layout.backgroundHeight * 0.45,
                  marginHorizontal: -16,
                }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            );
          })}
        </Animated.View>
      )}

      {/* ── Gradient overlay ──────────────────────────────────────────────── */}
      {uiVisible && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              justifyContent: 'flex-end',
            },
          ]}
          pointerEvents="none"
        >
        {[0.0, 0.08, 0.20, 0.42, 0.68, 0.88].map((opacity, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: (isPortrait ? layout.dialogueHeight : layout.backgroundHeight) + 60,
              backgroundColor: `rgba(0,0,0,${opacity * 0.7})`,
              opacity: (i + 1) / 6,
            }}
          />
        ))}
      </View>
      )}

      {/* ── Main tappable area ────────────────────────────────────────────── */}
      {uiVisible && (
        <Pressable
          style={{ flex: 1 }}
          onPress={handleTap}
          disabled={isLoading}
        />
      )}

      {/* ── Top controls ──────────────────────────────────────────────────── */}
      {uiVisible && (
        <View
          style={{
            position: 'absolute',
            top: 48,
            right: 16,
            flexDirection: 'row',
            gap: 8,
          }}
          pointerEvents="box-none"
        >
        <ControlButton
          label={autoPlayActive ? '⏸ Auto' : '▶ Auto'}
          active={autoPlayActive}
          onPress={() => setAutoPlayActive((a) => !a)}
          colors={colors}
        />
        <ControlButton
          label="📖 Log"
          onPress={() => setShowHistory(true)}
          colors={colors}
        />
      </View>
      )}

      {/* ── Dialogue box ──────────────────────────────────────────────────── */}
      {uiVisible && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            transform: [{ translateY: dialogueSlide }],
            opacity: Animated.multiply(sceneOpacity, uiOpacity),
          }}
          pointerEvents="box-none"
        >
        <View
          style={{
            margin: 12,
            marginBottom: Platform.OS === 'web' ? 16 : 28,
            borderRadius: 16,
            backgroundColor: colors.dialogueBg ?? 'rgba(15,14,23,0.88)',
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Speaker nameplate */}
          {speaker ? (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: colors.nameBg ?? colors.primary,
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderBottomRightRadius: 10,
                borderTopLeftRadius: 14,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                {speaker}
              </Text>
            </View>
          ) : null}

          <View style={{ padding: 16, minHeight: 80 }}>
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
            <View style={{ padding: 12, paddingTop: 4, gap: 8 }}>
              {scene.choices.map((choice) => (
                <Pressable
                  key={choice.id}
                  style={({ pressed }) => ({
                    backgroundColor: colors.choiceBg ?? 'rgba(124,58,237,0.12)',
                    borderWidth: 1,
                    borderColor: colors.choiceBorder ?? colors.primary,
                    borderRadius: 10,
                    paddingVertical: 11,
                    paddingHorizontal: 16,
                    opacity: pressed ? 0.75 : 1,
                  })}
                  onPress={() => onChoiceSelect(choice)}
                >
                  <Text
                    style={{
                      color: colors.foreground,
                      fontSize: fontSize.sm,
                      fontWeight: '500',
                      textAlign: 'center',
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingBottom: 12,
              paddingTop: 4,
            }}
          >
            {/* Page dots */}
            {pages.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {pages.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === pageIndex ? 16 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i === pageIndex ? colors.primary : colors.border,
                    }}
                  />
                ))}
              </View>
            ) : <View />}

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {/* Skip / fast-forward button */}
              {!isTyping && !isLastPage && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>tap to continue ▼</Text>
              )}
              {isLastPage && !isTyping && scene.choices.length === 0 && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>tap to continue ▼</Text>
              )}
              <Pressable
                onPressIn={() => setTurbo(true)}
                onPressOut={() => setTurbo(false)}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: turbo ? colors.primary : 'transparent',
                  borderWidth: 1,
                  borderColor: turbo ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: turbo ? '#fff' : colors.muted, fontSize: 11, fontWeight: '600' }}>
                  ⏩ Skip
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
      )}

      {/* ── Dialogue history drawer ────────────────────────────────────────── */}
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
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: active
          ? colors.primary
          : 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: active ? colors.primary : 'rgba(255,255,255,0.18)',
        opacity: pressed ? 0.75 : 1,
      })}
      onPress={onPress}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
