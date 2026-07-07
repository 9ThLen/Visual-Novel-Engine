/**
 * Renders a single scene inside the continuous document. Mounted scenes host
 * the live PlateWebViewEditor (a full iframe); unmounted scenes render a
 * lightweight placeholder at the last known (or estimated) height so the
 * surrounding document keeps its scroll position stable.
 */

import React, { memo, useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import {
  PlateWebViewEditor,
  getMinFrameHeight,
  type PlateWebViewEditorHandle,
} from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateBranchInfo, VNPlateSceneRef } from '@/lib/vn-plate-editor/types';

interface DocumentSceneFrameProps {
  scene: DocumentScene;
  editorId: string;
  characters: Character[];
  backgroundAssets: VNPlateBackgroundAsset[];
  audioAssets: VNPlateAudioAsset[];
  storyScenes: VNPlateSceneRef[];
  branchInfo?: VNPlateBranchInfo[];
  onSelectChoiceOption?: (choiceStepId: string, optionId: string) => void;
  onStartBranchOption?: (choiceStepId: string, optionId: string) => void;
  /** Distinct scenes with a connection into this one; ≥2 renders the merge-point banner. */
  incomingCount?: number;
  /** Accent color of the branch this scene belongs to; tints the page shadow inside the webview. */
  branchColor?: string;
  isPhone: boolean;
  isMounted: boolean;
  /** Last known rendered height for this scene, used to seed/replace the frame without a visible jump. */
  cachedHeight?: number;
  onChange: (scene: DocumentScene, characters: Character[]) => void;
  onCreateNextScene: (scene: DocumentScene, characters: Character[]) => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string) => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
  registerEditorRef: (handle: PlateWebViewEditorHandle | null) => void;
  onFrameLayout: (y: number, height: number) => void;
}

function DocumentSceneFrameImpl({
  scene,
  editorId,
  characters,
  backgroundAssets,
  audioAssets,
  storyScenes,
  branchInfo,
  onSelectChoiceOption,
  onStartBranchOption,
  incomingCount,
  branchColor,
  isPhone,
  isMounted,
  cachedHeight,
  onChange,
  onCreateNextScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
  registerEditorRef,
  onFrameLayout,
}: DocumentSceneFrameProps) {
  const colors = useColors('light');
  const { t } = useI18n();
  const [isOverlayActive, setIsOverlayActive] = useState(false);

  useEffect(() => {
    if (!isMounted) setIsOverlayActive(false);
  }, [isMounted]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    onFrameLayout(y, height);
  };

  const placeholderHeight = cachedHeight ?? getMinFrameHeight(isPhone);

  return (
    <View
      onLayout={handleLayout}
      style={{
        width: '100%',
        maxWidth: isPhone ? undefined : 920,
        alignSelf: 'center',
        position: 'relative',
        zIndex: isOverlayActive ? 80 : 0,
      }}
    >
      {(incomingCount ?? 0) >= 2 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginBottom: 6,
            borderRadius: 8,
            backgroundColor: colors['surface-1'],
            borderWidth: 1,
            borderColor: colors.border,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
            {t('document.mergePointBanner', { count: String(incomingCount) })}
          </Text>
        </View>
      ) : null}
      {isMounted ? (
        <PlateWebViewEditor
          ref={registerEditorRef}
          editorId={editorId}
          scene={scene}
          characters={characters}
          backgroundAssets={backgroundAssets}
          audioAssets={audioAssets}
          scenes={storyScenes}
          branchInfo={branchInfo}
          branchColor={branchColor}
          onSelectChoiceOption={onSelectChoiceOption}
          onStartBranchOption={onStartBranchOption}
          isPhone={isPhone}
          initialHeight={cachedHeight}
          style={{ width: '100%', overflow: 'visible' }}
          onChange={onChange}
          onCreateNextScene={onCreateNextScene}
          onUploadBackgroundAsset={onUploadBackgroundAsset}
          onUploadAudioAsset={onUploadAudioAsset}
          onOverlayActiveChange={setIsOverlayActive}
        />
      ) : (
        <View
          style={{
            height: placeholderHeight,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: branchColor ?? colors.border,
            backgroundColor: colors['surface-1'],
            alignItems: 'center',
            paddingTop: 28,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '600' }}>
            {scene.sceneName || t('document.untitledScene')}
          </Text>
        </View>
      )}
    </View>
  );
}

export const DocumentSceneFrame = memo(DocumentSceneFrameImpl);
