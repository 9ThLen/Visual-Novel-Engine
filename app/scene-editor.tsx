import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenContainer } from '@/components/screen-container';
import { useStory } from '@/lib/story-context';
import { useColors } from '@/hooks/use-colors';
import { Story, StoryScene, Choice } from '@/lib/types';
import * as storyContextEnhanced from '@/lib/story-context-enhanced';
import { MediaLibrary, LibraryAsset, addAssetToLibrary } from '@/components/media-library';
import { SplashScreenEditor } from '@/components/SplashScreenEditor';
import { useSceneEditorMedia } from '@/hooks/useSceneEditorMedia';
import { useSceneEditorActions } from '@/hooks/useSceneEditorActions';

import { Block, ROOT_BLOCK, createDefaultBlock } from '@/lib/block-types';
import { BlockFlowCanvas, BlockToolbar } from '@/components/block-editor';
import { getCharacterLibrary } from '@/lib/character-library';
import { InteractiveObjectsEditor } from '@/components/InteractiveObjectsEditor';
import type { SplashScreenConfig } from '@/lib/splash-types';
import type { InteractiveObject } from '@/lib/interactive-types';
import { LanguageSelector } from '@/components/LanguageSelector';
import { BlocksTab } from '@/components/scene-editor/BlocksTab';
import { EditTab } from '@/components/scene-editor/EditTab';

// LEGO editor imports
import LegoCanvas from '@/components/lego-editor/LegoCanvas';
import TimelineEditor from '@/components/lego-editor/TimelineEditor';
import { useSceneManagement } from '@/hooks/lego/useSceneManagement';
import { useLegoDnD } from '@/hooks/lego/useLegoDnD';
import type { AtomBlock } from '@/lib/atom-types';

type Tab = 'blocks' | 'edit' | 'lego';

// ── Reusable file-picker row component ────────────────────────────────────
interface FilePickerRowProps {
  label: string;
  value: string;
  onPick: () => void;
  onLibrary: () => void;
  onClear: () => void;
  isImage?: boolean;
  colors: ReturnType<typeof useColors>;
}

const FilePickerRow = React.memo(({
  label,
  value,
  onPick,
  onLibrary,
  onClear,
  isImage = false,
  colors,
}: FilePickerRowProps) => {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 6 }}>{label}</Text>
      {isImage && value ? (
        <Image
          source={{ uri: value }}
          style={{ width: '100%', height: 110, borderRadius: 8, marginBottom: 8, backgroundColor: colors.surface }}
          resizeMode="cover"
        />
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 8 }}>
        <Text style={{ color: value ? colors.foreground : colors.muted, fontSize: 13 }} numberOfLines={1}>
          {value ? value.split('/').pop() : 'No file selected'}
        </Text>
      </View>

      {/* Buttons Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => {
            onPick();
          }}
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>📂 Pick File</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            onLibrary();
          }}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: value ? 8 : 0,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>🗂 Library</Text>
        </Pressable>

        {value ? (
          <Pressable
            onPress={() => {
              onClear();
            }}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.error,
            }}
          >
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: '600' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

FilePickerRow.displayName = 'FilePickerRow';

export default function SceneEditorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { storyId, sceneId } = useLocalSearchParams();
  const [scene, setScene] = useState<StoryScene | null>(null);
  const [sceneText, setSceneText] = useState('');
  const [backgroundUri, setBackgroundUri] = useState('');
  const [voiceUri, setVoiceUri] = useState('');
  const [musicUri, setMusicUri] = useState('');
  const [splashConfig, setSplashConfig] = useState<SplashScreenConfig | undefined>(undefined);
  const [sceneBlocks, setSceneBlocks] = useState<Block[]>([]);
  const [sceneRoot, setSceneRoot] = useState<Block>(ROOT_BLOCK);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [interactiveObjects, setInteractiveObjects] = useState<InteractiveObject[]>([]);
  const [newChoiceText, setNewChoiceText] = useState('');
  const [newChoiceTarget, setNewChoiceTarget] = useState('');
  const [sceneList, setSceneList] = useState<string[]>([]);
  const [characterList, setCharacterList] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('blocks');
  const [legoSubTab, setLegoSubTab] = useState<'canvas' | 'timeline'>('canvas');
  
  const skipNextReloadRef = React.useRef(false);
  const { stories, loadStories, currentStory, setCurrentStory } = useStory();

  // LEGO hooks
  const {
    activeScene: legoScene,
    activeSceneId: legoActiveSceneId,
    handleAtomsChange,
  } = useSceneManagement();
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);

  // Media Hook
  const { 
    libraryTarget, 
    setLibraryTarget, 
    handlePickBg: pickBg, 
    handlePickAudio: pickAudio 
  } = useSceneEditorMedia();

  // Actions Hook
  const {
    handleSaveScene: saveScene,
    handleAddScene: addScene,
    handleDeleteScene: deleteScene,
    handleAddChoice: addChoice,
    handleDeleteChoice: deleteChoice,
  } = useSceneEditorActions(currentStory, scene, loadStories, skipNextReloadRef);

  // Load story on mount
  useEffect(() => {
    if (storyId && typeof storyId === 'string') {
      setCurrentStory(storyId);
    }
  }, [storyId, setCurrentStory]);

  // Memoize scene list
  const sceneListMemo = useMemo(() => {
    return currentStory ? Object.keys(currentStory.scenes) : [];
  }, [currentStory]);

  const loadSceneData = useCallback(() => {
    if (skipNextReloadRef.current) {
      skipNextReloadRef.current = false;
      return;
    }

    if (!currentStory) return;

    setSceneList(sceneListMemo);
    if (typeof storyId === "string") {
      getCharacterLibrary(storyId).then((chars) => {
        setCharacterList(chars.map((c) => c.name));
      }).catch(() => setCharacterList([]));
    }

    const sceneIdStr = typeof sceneId === 'string' ? sceneId : currentStory.startSceneId;
    const foundScene = currentStory.scenes[sceneIdStr];
    if (foundScene) {
      setScene(foundScene);
      setSceneText(foundScene.text);
      setBackgroundUri(foundScene.backgroundImageUri || '');
      setVoiceUri(foundScene.voiceAudioUri || '');
      setMusicUri(foundScene.musicUri || '');
      setSplashConfig(foundScene.splashScreen);
      setInteractiveObjects(foundScene.interactiveObjects || []);
      const blocks = (foundScene as any).blocks as Block[] | undefined;
      if (blocks && blocks.length > 0) {
        setSceneBlocks(blocks);
        const rootBlock: Block = {
          ...ROOT_BLOCK,
          id: `scene_${foundScene.id}_root`,
          data: { title: foundScene.id },
          children: blocks,
        };
        setSceneRoot(rootBlock);
      } else {
        setSceneBlocks([]);
        setSceneRoot({ ...ROOT_BLOCK, id: `scene_${foundScene.id}_root`, data: { title: foundScene.id } });
      }
    }
  }, [storyId, sceneId, currentStory, sceneListMemo]);

  useEffect(() => { loadSceneData(); }, [loadSceneData]);

  // Wrapper handlers for hooks
  const handlePickBg = () => pickBg(setBackgroundUri);
  const handlePickAudio = (target: 'voice' | 'music') => pickAudio(target, target === 'voice' ? setVoiceUri : setMusicUri);
  
  const handleLibrarySelect = useCallback((asset: LibraryAsset) => {
    if (libraryTarget === 'bg') setBackgroundUri(asset.uri);
    else if (libraryTarget === 'voice') setVoiceUri(asset.uri);
    else if (libraryTarget === 'music') setMusicUri(asset.uri);
    setLibraryTarget(null);
  }, [libraryTarget, setLibraryTarget]);

  const handleSaveScene = async () => {
    const updated = await saveScene({
      sceneText,
      backgroundUri,
      voiceUri,
      musicUri,
      splashConfig,
      interactiveObjects,
      sceneRoot,
    });
    if (updated) setScene(updated);
  };

  const handleAddScene = () => addScene(sceneList, setSceneList);
  const handleDeleteScene = (id: string) => deleteScene(id, sceneList, setSceneList);
  
  const handleAddChoice = async () => {
    const success = await addChoice(newChoiceText, newChoiceTarget, setScene);
    if (success) {
      setNewChoiceText('');
      setNewChoiceTarget('');
    }
  };

  const handleDeleteChoice = (id: string) => deleteChoice(id, setScene);

  if (!currentStory || !scene) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Loading scene...</Text>
      </ScreenContainer>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="p-4">
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>Scene Editor</Text>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 1 }}>{scene.id}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1, minWidth: 0 }}>
          <LanguageSelector style={{ flex: 1, minWidth: 0 }} />
          <Pressable
            style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 })}
            onPress={handleSaveScene}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>💾 Save</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
            onPress={() => router.back()}
          >
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Back</Text>
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 0, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: colors.border }}>
        {(['blocks', 'edit', 'lego'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 7, backgroundColor: activeTab === tab ? colors.primary : 'transparent', alignItems: 'center' }}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={{ color: activeTab === tab ? '#fff' : colors.muted, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
              {tab === 'blocks' ? '🧱 Blocks' : tab === 'edit' ? '✏️ Edit' : '🧱 LEGO'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── BLOCKS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'blocks' && sceneRoot && (
        <BlocksTab
          sceneRoot={sceneRoot}
          setSceneRoot={setSceneRoot}
          setSceneBlocks={setSceneBlocks}
          selectedBlockId={selectedBlockId}
          setSelectedBlockId={setSelectedBlockId}
          sceneList={sceneList}
          characterList={characterList}
          colors={colors}
        />
      )}

      {/* ── EDIT TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'edit' && (
        <EditTab
          scene={scene}
          sceneText={sceneText}
          setSceneText={setSceneText}
          backgroundUri={backgroundUri}
          setBackgroundUri={setBackgroundUri}
          voiceUri={voiceUri}
          setVoiceUri={setVoiceUri}
          musicUri={musicUri}
          setMusicUri={setMusicUri}
          splashConfig={splashConfig}
          setSplashConfig={setSplashConfig}
          interactiveObjects={interactiveObjects}
          setInteractiveObjects={setInteractiveObjects}
          newChoiceText={newChoiceText}
          setNewChoiceText={setNewChoiceText}
          newChoiceTarget={newChoiceTarget}
          setNewChoiceTarget={setNewChoiceTarget}
          sceneList={sceneList}
          handlePickBg={handlePickBg}
          handlePickAudio={handlePickAudio}
          setLibraryTarget={setLibraryTarget}
          handleGraphNavigate={() => {}}
          handleDeleteChoice={handleDeleteChoice}
          handleAddChoice={handleAddChoice}
          handleAddScene={handleAddScene}
          handleDeleteScene={handleDeleteScene}
          colors={colors}
          FilePickerRow={FilePickerRow}
          storyId={currentStory.id}
        />
      )}

      {/* ── LEGO TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'lego' && (
        <View style={{ flex: 1 }}>
          {/* LEGO sub-tab selector */}
          <View style={{ flexDirection: 'row', gap: 0, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 8, padding: 3, borderWidth: 1, borderColor: colors.border }}>
            {(['canvas', 'timeline'] as const).map((subTab) => (
              <Pressable
                key={subTab}
                style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: legoSubTab === subTab ? colors.primary : 'transparent', alignItems: 'center' }}
                onPress={() => setLegoSubTab(subTab)}
              >
                <Text style={{ color: legoSubTab === subTab ? '#fff' : colors.muted, fontWeight: '600', fontSize: 13 }}>
                  {subTab === 'canvas' ? '🎨 Canvas' : '📅 Timeline'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* LEGO workspace */}
          {legoSubTab === 'canvas' && legoScene ? (
            <LegoCanvas
              atoms={legoScene.elements.filter((e): e is AtomBlock => 'snapPoints' in e)}
              onAtomsChange={handleAtomsChange}
              selectedAtomId={selectedAtomId}
              onAtomSelect={setSelectedAtomId}
            />
          ) : legoSubTab === 'timeline' && legoScene ? (
            <TimelineEditor sceneId={legoScene.id} />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>
                Select a scene in the LEGO store to start editing
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Media Library drawer ────────────────────────────────────────── */}
      <MediaLibrary
        visible={libraryTarget !== null}
        type={libraryTarget === 'bg' ? 'image' : 'audio'}
        onSelect={handleLibrarySelect}
        onClose={() => setLibraryTarget(null)}
      />
    </ScreenContainer>
  );
}
