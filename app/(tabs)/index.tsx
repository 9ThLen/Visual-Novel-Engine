import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useStory } from '@/lib/story-context';
import { Story } from '@/lib/types';
import { useColors } from '@/hooks/use-colors';
import { Button } from '@/components/ui/Button';
import demoStory from '@/assets/demo-story.json';

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { stories, loadStories, addStory } = useStory();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Read directly from AsyncStorage before loading into React state,
      // because `stories` from context is stale (still empty) at this point.
      const storiesJson = await AsyncStorage.getItem('stories');
      const existingStories: Story[] = storiesJson ? JSON.parse(storiesJson) : [];

      await loadStories();

      // Add demo story only if none exist yet
      if (existingStories.length === 0) {
        const demo = demoStory as Story;
        await addStory(demo);
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setIsInitialized(true);
    }
  };

  const handlePlayStory = (story: Story) => {
    router.push({
      pathname: '../reader',
      params: { storyId: story.id },
    });
  };

  const handleOpenEditor = () => {
    router.push('../editor');
  };

  const handleOpenSettings = () => {
    router.push('../settings');
  };

  const renderStoryCard = ({ item }: { item: Story }) => (
    <Pressable
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() => handlePlayStory(item)}
    >
      <View style={{ gap: 8 }}>
        {item.thumbnailUri && (
          <Image
            source={{ uri: item.thumbnailUri }}
            style={{
              width: '100%',
              height: 120,
              borderRadius: 8,
              backgroundColor: colors.background,
            }}
            resizeMode="cover"
          />
        )}
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.foreground,
          }}
        >
          {item.title}
        </Text>
        {item.description && (
          <Text
            style={{
              fontSize: 13,
              color: colors.muted,
              lineHeight: 18,
            }}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
        {item.author && (
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 4,
            }}
          >
            by {item.author}
          </Text>
        )}
      </View>
    </Pressable>
  );

  if (!isInitialized) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>
          Loading...
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4">
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: colors.foreground,
          }}
        >
          Stories
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            variant="primary"
            size="sm"
            onPress={handleOpenEditor}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={handleOpenSettings}
          >
            ⚙️
          </Button>
        </View>
      </View>

      {stories.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              color: colors.muted,
              textAlign: 'center',
            }}
          >
            No stories yet. Create one using the editor!
          </Text>
          <Button
            variant="primary"
            size="base"
            onPress={handleOpenEditor}
          >
            Create Story
          </Button>
        </View>
      ) : (
        <FlatList
          data={stories}
          renderItem={renderStoryCard}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </ScreenContainer>
  );
}
