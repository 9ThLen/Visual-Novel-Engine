/**
 * Renders a single scene inside the continuous document. Mounted scenes host
 * the live PlateWebViewEditor (a full iframe); unmounted scenes render a
 * lightweight placeholder at the last known (or estimated) height so the
 * surrounding document keeps its scroll position stable.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import {
  PlateWebViewEditor,
  getMinFrameHeight,
  type PlateWebViewEditorHandle,
} from '@/components/vn-plate-editor/PlateWebViewEditor';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import type { Character } from '@/lib/character-types';
import type { IncomingScenePath } from '@/lib/document-editor/story-path';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateBranchInfo, VNPlateFormatState, VNPlateSceneRef } from '@/lib/vn-plate-editor/types';

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
  /** Source scenes and trigger texts with a connection into this one; shown on hover/focus. */
  incomingPaths?: IncomingScenePath[];
  /** Accent color of the branch this scene belongs to; tints the page shadow inside the webview. */
  branchColor?: string;
  isPhone: boolean;
  isMounted: boolean;
  /** Last known rendered height for this scene, used to seed/replace the frame without a visible jump. */
  cachedHeight?: number;
  onChange: (scene: DocumentScene, characters: Character[]) => void;
  onCreateNextScene: (scene: DocumentScene, characters: Character[]) => void;
  onDuplicateScene: () => void;
  onRequestDeleteScene: () => void;
  onUploadBackgroundAsset?: (name: string, dataUri: string, purpose?: 'background' | 'sprite') => Promise<VNPlateBackgroundAsset | null>;
  onUploadAudioAsset?: (name: string, dataUri: string) => Promise<VNPlateAudioAsset | null>;
  registerEditorRef: (handle: PlateWebViewEditorHandle | null) => void;
  onHistoryStateChange: (canUndo: boolean, canRedo: boolean) => void;
  onFormatStateChange: (state: VNPlateFormatState) => void;
  onFrameLayout: (y: number, height: number) => void;
  /**
   * Bumped by the host after a document rebuild wipes its layout map. React
   * Native Web's onLayout does not re-fire for frames whose geometry did not
   * change, so each bump triggers an explicit DOM re-measure.
   */
  measureVersion?: number;
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
  incomingPaths,
  branchColor,
  isPhone,
  isMounted,
  cachedHeight,
  onChange,
  onCreateNextScene,
  onDuplicateScene,
  onRequestDeleteScene,
  onUploadBackgroundAsset,
  onUploadAudioAsset,
  registerEditorRef,
  onHistoryStateChange,
  onFormatStateChange,
  onFrameLayout,
  measureVersion,
}: DocumentSceneFrameProps) {
  const colors = useColors('light');
  const { t } = useI18n();
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const [isMergePointTooltipVisible, setIsMergePointTooltipVisible] = useState(false);
  const frameRef = useRef<View>(null);
  const sceneMenuRef = useRef<View>(null);
  const closeSceneMenu = useCallback(() => setIsSceneMenuOpen(false), []);
  const onFrameLayoutRef = useRef(onFrameLayout);
  onFrameLayoutRef.current = onFrameLayout;

  useEffect(() => {
    if (!isMounted) setIsOverlayActive(false);
  }, [isMounted]);

  useEffect(() => {
    if (!isSceneMenuOpen || typeof document === 'undefined') return;

    const handlePointerDown = (event: PointerEvent) => {
      const menuNode = sceneMenuRef.current as unknown as HTMLElement | null;
      const target = event.target;
      if (menuNode && target && !menuNode.contains(target as Node)) {
        closeSceneMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [closeSceneMenu, isSceneMenuOpen]);

  // Re-measure on mount and on every measureVersion bump. On web the View ref
  // is the DOM element; offsetTop/offsetHeight match the y/height onLayout
  // reports (both relative to the direct parent). A ResizeObserver on the
  // frame AND its parent keeps the host's layout map fresh when React Native
  // Web's onLayout does not re-fire: observing the parent catches position
  // shifts caused by sibling frames growing above this one.
  useEffect(() => {
    const node = frameRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.offsetTop !== 'number' || typeof node.offsetHeight !== 'number') return;
    const report = () => onFrameLayoutRef.current(node.offsetTop, node.offsetHeight);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    return () => observer.disconnect();
  }, [measureVersion]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    onFrameLayout(y, height);
  };

  const placeholderHeight = cachedHeight ?? getMinFrameHeight(isPhone);
  const isMergePoint = (incomingCount ?? 0) >= 2;
  const incomingPathDetails = (incomingPaths ?? []).map((path) => ({
    ...path,
    sceneName: storyScenes.find((storyScene) => storyScene.id === path.sceneId)?.name || path.sceneId,
  }));
  const mergePointAccessibilityLabel = [
    t('document.mergePointBanner', { count: String(incomingCount ?? 0) }),
    ...incomingPathDetails.map(({ sceneName, triggerTexts }) =>
      `${sceneName}: ${triggerTexts.length > 0 ? triggerTexts.join(', ') : t('document.mergePointTooltipDirect')}`,
    ),
  ].join('. ');

  return (
    <View
      ref={frameRef}
      onLayout={handleLayout}
      style={{
        width: '100%',
        maxWidth: isPhone ? undefined : 920,
        alignSelf: 'center',
        position: 'relative',
        zIndex: isOverlayActive || isMergePointTooltipVisible || isSceneMenuOpen ? 80 : 0,
      }}
    >
      {isMergePoint ? (
        <View
          style={{
            alignSelf: 'flex-start',
            position: 'relative',
            zIndex: isMergePointTooltipVisible ? 100 : 1,
          }}
        >
          <Pressable
            accessibilityRole="text"
            accessibilityLabel={mergePointAccessibilityLabel}
            onHoverIn={() => setIsMergePointTooltipVisible(true)}
            onHoverOut={() => setIsMergePointTooltipVisible(false)}
            onFocus={() => setIsMergePointTooltipVisible(true)}
            onBlur={() => setIsMergePointTooltipVisible(false)}
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
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
              {t('document.mergePointBanner', { count: String(incomingCount) })}
            </Text>
          </Pressable>
          {isMergePointTooltipVisible ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                minWidth: 230,
                maxWidth: 340,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: colors['surface-1'],
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: '#000',
                shadowOpacity: 0.16,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 5,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700', marginBottom: 5 }}>
                {t('document.mergePointTooltipTitle')}
              </Text>
              {incomingPathDetails.map(({ sceneId, sceneName, triggerTexts }) => (
                <View key={sceneId} style={{ marginBottom: 6 }}>
                  <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>
                    {sceneName}
                  </Text>
                  {triggerTexts.length > 0 ? triggerTexts.map((text, index) => (
                    <Text key={`${sceneId}-trigger-${index}`} style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                      • “{text}”
                    </Text>
                  )) : (
                    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                      • {t('document.mergePointTooltipDirect')}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ width: '100%', position: 'relative' }}>
        <View ref={sceneMenuRef} style={{ position: 'absolute', top: isPhone ? 40 : 56, right: isPhone ? 24 : 82, alignItems: 'flex-end', zIndex: 120 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('editor.scenes')}
            hitSlop={6}
          onPress={() => setIsSceneMenuOpen((open) => !open)}
            style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', padding: 2 }}
          >
            <Text style={{ color: colors.muted, fontSize: 22, lineHeight: 22, fontWeight: '800' }}>⋯</Text>
          </Pressable>
          {isSceneMenuOpen ? (
            <View
              style={{
                minWidth: 150,
                marginTop: 6,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: colors['surface-container'],
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: '#000',
                shadowOpacity: 0.16,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 5,
              }}
            >
              <Pressable
                onPress={() => {
                  setIsSceneMenuOpen(false);
                  onDuplicateScene();
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>
                  {t('common.duplicate')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIsSceneMenuOpen(false);
                  onRequestDeleteScene();
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: withAlpha(colors.error, 0.08) }}
              >
                <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>
                  {t('editor.deleteScene')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
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
          onInteraction={closeSceneMenu}
          onHistoryStateChange={onHistoryStateChange}
          onFormatStateChange={onFormatStateChange}
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
    </View>
  );
}

export const DocumentSceneFrame = memo(DocumentSceneFrameImpl);
