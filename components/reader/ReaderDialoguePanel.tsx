import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
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
    readerControls,
    layoutPreset = "classic",
  } = visible ? props : lastContent.current;
  const dense = layoutPreset !== "classic";
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const lineHeight =
    StyleSheet.flatten(dialogueTextStyle)?.lineHeight ?? choicesFontSize * 1.65;

  useEffect(() => {
    if (contentHeight === null) return;
    const resize = Animated.timing(height, {
      toValue: visible ? contentHeight + 2 : 0,
      duration: 240,
      easing: Easing.ease,
      useNativeDriver: false,
    });
    const fade = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    });
    resize.start();
    fade.start();
    return () => {
      resize.stop();
      fade.stop();
    };
  }, [contentHeight, height, opacity, visible]);

  return (
    <Animated.View
      className="rounded-2xl border overflow-hidden"
      testID={`reader-dialogue-panel-${layoutPreset}`}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      aria-hidden={!visible}
      style={{
        height: contentHeight === null && visible ? undefined : height,
        opacity,
        backgroundColor: colors.dialogueBg,
        borderColor: colors.dialogueBorder,
        marginHorizontal: dense ? 8 : 12,
        marginBottom: dense ? 12 : DIALOGUE_MARGIN_BOTTOM,
      }}
    >
      <View
        onLayout={(event) => {
          const measuredHeight = Math.ceil(event.nativeEvent.layout.height);
          if (contentHeight === null)
            height.setValue(visible ? measuredHeight + 2 : 0);
          setContentHeight(measuredHeight);
        }}
        style={
          contentHeight === null
            ? undefined
            : { position: "absolute", top: 0, left: 0, right: 0 }
        }
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

        <View
          className={
            dense
              ? "flex-row items-center justify-between"
              : "flex-row items-center justify-between px-4 pb-3 pt-1"
          }
          style={
            dense
              ? { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 }
              : undefined
          }
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

          {readerControls}
        </View>
      </View>
    </Animated.View>
  );
});
