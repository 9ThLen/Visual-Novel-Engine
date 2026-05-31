import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function SceneEditorRedirect() {
  const { storyId, sceneId } = useLocalSearchParams<{
    storyId: string;
    sceneId: string;
  }>();

  if (!storyId || !sceneId) {
    return <Redirect href="/editor" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/document-editor',
        params: { storyId, sceneId },
      }}
    />
  );
}
