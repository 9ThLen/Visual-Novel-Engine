import React from 'react';
import { ScrollView, Text } from 'react-native';
import { SceneGraph } from '@/components/scene-graph';
import { Story } from '@/lib/types';

interface GraphTabProps {
  currentStory: Story;
  sceneId: string;
  handleGraphNavigate: (id: string) => void;
  handleGraphLink: (from: string, to: string) => void;
  colors: any;
}

export const GraphTab: React.FC<GraphTabProps> = ({
  currentStory,
  sceneId,
  handleGraphNavigate,
  handleGraphLink,
  colors,
}) => {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}>
        Tap a node to navigate to that scene. Use Link Mode to connect scenes with a new choice.
      </Text>
      <SceneGraph
        story={currentStory}
        currentSceneId={sceneId}
        onNavigate={handleGraphNavigate}
        onLinkScenes={handleGraphLink}
      />
    </ScrollView>
  );
};
