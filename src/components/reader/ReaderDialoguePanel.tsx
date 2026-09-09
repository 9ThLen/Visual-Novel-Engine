import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native";
import type { useColors } from "@/hooks/use-colors";
import type { ReaderChoice } from "@/lib/reader-runtime";
import { RichText } from "@/components/RichText";
import { ReaderChoices } from "@/components/reader/ReaderChoices";
import type { StoryReaderLayoutPreset } from "@/lib/story-theme";
import { stripRichText } from "@/lib/rich-text";

const DIALOGUE_MARGIN_BOTTOM = 28;

interface ReaderDialoguePanelProps {
  colors: ReturnType<typeof useColors>;
  speaker: string | null;
  speakerTextStyle: StyleProp<TextStyle>;
  displayedText: string;
  /** Visible-character limit for the typewriter reveal; omit to show all text. */
  visibleCount?: number;
  isTyping: boolean;
  dialogueTextStyle: StyleProp<TextStyle>;
  cursorStyle: StyleProp<TextStyle>;
  choices: ReaderChoice[];
  choicesFontSize: number;
  getChoiceAccessibilityLabel: (text: string) => string;
  onSelectChoice: (choiceId: string) => void;
  onTap: () => void;
  pagesLength: number;
  pageIndex: number;
  readerControls: React.ReactNode;
  layoutPreset?: StoryReaderLayoutPreset;
}

export const ReaderDialoguePanel = React.memo(function ReaderDialoguePanel(
  props: ReaderDialoguePanelProps,
) {
  const visible =
    stripRichText(props.displayedText).trim().length > 0 ||
    props.choices.length > 0;
  const lastContent = useRef(props);
  // Preserve the outgoing content until the panel has finished collapsing.
  useEffect(() => {
    if (visible) lastContent.current = props;
  }, [props, visible]);
  const {
    colors,
    speaker,
    speakerTextStyle,
    displayedText,
    visibleCount,
    isTyping,
    dialogueTextStyle,
    cursorStyle,
    choices,
    choicesFontSize,
    getChoiceAccessibilityLabel,
    onSelectChoice,
    onTap,
    pagesLength,
    pageIndex,
    layoutPreset = "classic",
  } = visible ? props : lastContent.current;
  const dense = layoutPreset !== "classic";
  const { height: windowHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  /** 1 while open, 0 while collapsed; only ever constrains a closing panel. */
  const openness = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const lineHeight =
    StyleSheet.flatten(dialogueTextStyle)?.lineHeight ?? choicesFontSize * 1.65;

  useEffect(() => {
    const collapse = Animated.timing(openness, {
      toValue: visible ? 1 : 0,
      duration: 240,
      easing: Easing.ease,
      useNativeDriver: false,
    });
    const fade = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    });
    collapse.start();
    fade.start();
    return () => {
      collapse.stop();
      fade.stop();
    };
  }, [opacity, openness, visible]);

  /**
   * A ceiling, and only while closing.
   *
   * The first version animated `height` to a measured value and made the
   * content absolute so that height would govern the box. That inverted the
   * measurement: an out-of-flow child cannot tell its parent how tall to be, so
   * the panel kept whatever height was measured once and the content grew past
   * it. At a large font on a narrow screen the controls row ended up outside
   * the panel's own background, hanging off the bottom of the screen.
   *
   * So an open panel is not constrained at all — its height is its content's,
   * and a longer line or a bigger font simply makes it taller. The measured
   * height is used for one thing: the ceiling to animate down from when the
   * panel closes.
   */
  const closingMaxHeight = openness.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight ?? 0],
  });

  return (
    <View
      testID={`reader-dialogue-${layoutPreset}`}
      style={{ marginBottom: dense ? 12 : DIALOGUE_MARGIN_BOTTOM }}
    >
      <ScrollView
        testID="reader-dialogue-scroll"
        style={{ maxHeight: windowHeight * 0.6, flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
      >
      <Animated.View
        className="rounded-2xl border"
        testID={`reader-dialogue-panel-${layoutPreset}`}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        aria-hidden={!visible}
        style={{
          // Unconstrained while open. `overflow` is set in the style rather
          // than through the class name because the class was not producing it
          // on web at all, which is the only reason the overflowing controls
          // were visible instead of cut off.
          maxHeight: visible ? undefined : closingMaxHeight,
          overflow: "hidden",
          opacity,
          backgroundColor: colors.dialogueBg,
          borderColor: colors.dialogueBorder,
          marginHorizontal: dense ? 8 : 12,
        }}
      >
        <View
          onLayout={(event) => {
            setContentHeight(Math.ceil(event.nativeEvent.layout.height));
          }}
        >
        <View style={{ minHeight: 28 }}>
          {speaker ? (
            <View
              className="self-start px-3.5 py-1 rounded-br-lg rounded-tl-xl"
              style={{ backgroundColor: colors.nameBg ?? colors.primary }}
            >
              <Text
                className="text-xs font-bold tracking-wider"
                style={speakerTextStyle}
              >
                {speaker}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={{
            padding: dense ? 12 : 16,
            minHeight: lineHeight * 3 + (dense ? 24 : 32),
          }}
          onPress={onTap}
          accessible={false}
        >
          <Text testID="reader-dialogue-text" style={dialogueTextStyle}>
            <RichText
              text={displayedText}
              visibleCount={visibleCount}
              reserveSpace
            />
            <Text
              aria-hidden
              style={[cursorStyle, { opacity: isTyping ? 0.8 : 0 }]}
            >
              |
            </Text>
          </Text>
        </Pressable>

        {!isTyping && (
          <ReaderChoices
            choices={choices}
            colors={colors}
            fontSize={choicesFontSize}
            getAccessibilityLabel={getChoiceAccessibilityLabel}
            onSelectChoice={onSelectChoice}
            layoutPreset={layoutPreset}
          />
        )}

        </View>
      </Animated.View>
      </ScrollView>

      {/*
        Outside the panel, deliberately.

        Auto, Back and History were inside it, so a scene with no text and no
        choices — which an author can write, and which nothing stops them
        writing — collapsed the panel and took the reader's only way out with
        it. There is no gesture that brings them back. They belong to the
        reader, not to the line, so they stay whatever the line is doing.
      */}
      <View
        testID="reader-controls-row"
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center",
          justifyContent: "flex-end", gap: 8, paddingHorizontal: dense ? 12 : 16,
          paddingBottom: dense ? 8 : 12, paddingTop: 4 }}
      >
        {false && pagesLength > 1 ? (
          <View className="flex-row gap-1">
            {Array.from({ length: pagesLength }).map((_, i) => (
              <View
                key={`dot-${i}`}
                className={
                  i === pageIndex
                    ? "rounded-full w-4 h-1.5"
                    : "rounded-full w-1.5 h-1.5"
                }
                style={{
                  backgroundColor:
                    i === pageIndex ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>
        ) : (
          <View />
        )}

        {props.readerControls}
      </View>
    </View>
  );
});
