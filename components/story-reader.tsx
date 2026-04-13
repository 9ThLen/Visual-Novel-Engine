import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { StoryScene, Choice } from '@/lib/types';

interface StoryReaderProps {
  scene: StoryScene;
  onContinue: () => void;
  onChoiceSelect: (choice: Choice) => void;
  isLoading?: boolean;
}

export function StoryReader({
  scene,
  onContinue,
  onChoiceSelect,
  isLoading = false,
}: StoryReaderProps) {
  const colors = useColors();
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  // Split dialogue into lines for better formatting
  const dialogueLines = scene.text.split('\n\n');

  useEffect(() => {
    setDialogueIndex(0);
  }, [scene.id]);

  const handleTap = () => {
    if (dialogueIndex < dialogueLines.length - 1) {
      setDialogueIndex(dialogueIndex + 1);
    } else if (scene.choices.length === 0) {
      onContinue();
    }
  };

  const isLastDialogue = dialogueIndex === dialogueLines.length - 1;
  const currentDialogue = dialogueLines[dialogueIndex];

  return (
    <Pressable
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
      onPress={handleTap}
      disabled={isLoading}
    >
      {/* Background Image */}
      {scene.backgroundImageUri && (
        <Image
          source={{ uri: scene.backgroundImageUri }}
          style={[
            styles.background,
            { height: screenHeight * 0.6 },
          ]}
          resizeMode="cover"
        />
      )}

      {/* Character Sprites */}
      {scene.characters.length > 0 && (
        <View style={styles.charactersContainer}>
          {scene.characters.map((char) => (
            <Image
              key={char.id}
              source={{ uri: char.imageUri }}
              style={[
                styles.character,
                {
                  height: screenHeight * 0.5,
                  left: char.position === 'left' ? 0 : char.position === 'right' ? screenWidth * 0.3 : screenWidth * 0.15,
                },
              ]}
              resizeMode="contain"
            />
          ))}
        </View>
      )}

      {/* Dialogue Box */}
      <View
        style={[
          styles.dialogueBox,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <ScrollView
          style={styles.dialogueContent}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.dialogueText,
              { color: colors.foreground },
            ]}
          >
            {currentDialogue}
          </Text>
        </ScrollView>

        {/* Choices */}
        {isLastDialogue && scene.choices.length > 0 && (
          <View style={styles.choicesContainer}>
            {scene.choices.map((choice) => (
              <Pressable
                key={choice.id}
                style={({ pressed }) => [
                  styles.choiceButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                onPress={() => onChoiceSelect(choice)}
              >
                <Text
                  style={[
                    styles.choiceText,
                    { color: colors.background },
                  ]}
                  numberOfLines={2}
                >
                  {choice.text}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Tap to Continue Indicator */}
        {!isLastDialogue && (
          <View style={styles.continueIndicator}>
            <Text
              style={[
                styles.continueText,
                { color: colors.muted },
              ]}
            >
              ▼ Tap to continue
            </Text>
          </View>
        )}

        {/* Auto-play Indicator (if enabled) */}
        {isLastDialogue && scene.choices.length === 0 && (
          <View style={styles.continueIndicator}>
            <Text
              style={[
                styles.continueText,
                { color: colors.muted },
              ]}
            >
              ▼ Tap to continue
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  background: {
    width: '100%',
    position: 'absolute',
    top: 0,
  },
  charactersContainer: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: '60%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  character: {
    width: '60%',
    aspectRatio: 1,
  },
  dialogueBox: {
    minHeight: '40%',
    padding: 16,
    borderTopWidth: 1,
  },
  dialogueContent: {
    flex: 1,
    minHeight: 80,
  },
  dialogueText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  choicesContainer: {
    marginTop: 16,
    gap: 8,
  },
  choiceButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  continueIndicator: {
    marginTop: 12,
    alignItems: 'center',
  },
  continueText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
