import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useSceneStore } from '@/stores/scene-store';
import { createScene } from '@/lib/scene-types';
import LegoCanvas from '@/components/lego-editor/LegoCanvas';
import TimelineEditor from '@/components/lego-editor/TimelineEditor';
import type { Scene } from '@/lib/scene-types';
import type { AtomBlock } from '@/lib/atom-types';

type TabType = 'canvas' | 'timeline' | 'graph';

const TAB_CONFIG = [
  { key: 'canvas' as const, label: '🎨 Canvas', icon: '🎨' },
  { key: 'timeline' as const, label: '📅 Timeline', icon: '📅' },
  { key: 'graph' as const, label: '🕸️ Graph', icon: '🕸️' },
];

export default function LegoEditorScreen() {
  const scenes = useSceneStore((s) => s.scenes);
  const addScene = useSceneStore((s) => s.addScene);
  const setActiveScene = useSceneStore((s) => s.setActiveScene);
  const activeSceneId = useSceneStore((s) => s.activeSceneId);
  const addElement = useSceneStore((s) => s.addElement);
  const removeElement = useSceneStore((s) => s.removeElement);

  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('canvas');
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  
  const activeScene = scenes.find((s: Scene) => s.id === activeSceneId);

  const switchTab = (tab: TabType) => {
    // Fade out
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setActiveTab(tab);
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleAddScene = () => {
    const newScene = createScene(`Scene ${scenes.length + 1}`);
    addScene(newScene);
    setActiveScene(newScene.id);
  };

  const handleAtomsChange = (atoms: AtomBlock[]) => {
    if (!activeSceneId) return;
    // Update scene elements with changed atoms
    for (const atom of atoms) {
      const existing = activeScene?.elements.find((e) => e.id === atom.id);
      if (!existing) {
        addElement(activeSceneId, atom);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>🧱 LEGO Editor</Text>
          {/* Tab Selector */}
          <View style={styles.tabBar}>
            {TAB_CONFIG.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  activeTab === tab.key && styles.tabButtonActive,
                ]}
                onPress={() => switchTab(tab.key)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.key && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddScene}>
          <Text style={styles.addButtonText}>+ Нова сцена</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Scene List Sidebar */}
        <View style={styles.sidebar}>
          <ScrollView style={styles.sceneList}>
            {scenes.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Немає сцен.{"\n"}Створіть першу!</Text>
              </View>
            ) : (
              scenes.map((scene: Scene) => (
                <TouchableOpacity
                  key={scene.id}
                  style={[
                    styles.sceneCard,
                    scene.id === activeSceneId && styles.sceneCardActive,
                  ]}
                  onPress={() => setActiveScene(scene.id)}
                >
                  <Text style={styles.sceneName}>{scene.name}</Text>
                  <Text style={styles.sceneInfo}>
                    🧩 {scene.elements.length} | ⏱ {scene.timeline.length}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>

        {/* Animated Content Area */}
        <Animated.View style={[styles.workspace, { opacity: fadeAnim }]}>
          {activeTab === 'canvas' && activeScene ? (
            <LegoCanvas
              atoms={activeScene.elements.filter((e): e is AtomBlock => 'snapPoints' in e)}
              onAtomsChange={handleAtomsChange}
              selectedAtomId={selectedAtomId}
              onAtomSelect={setSelectedAtomId}
            />
          ) : activeTab === 'timeline' && activeScene ? (
            <TimelineEditor sceneId={activeScene.id} />
          ) : activeTab === 'graph' ? (
            <View style={styles.placeholderView}>
              <Text style={styles.placeholderText}>🕸️ Graph View - Coming Soon</Text>
            </View>
          ) : (
            <View style={styles.noScenePlaceholder}>
              <Text style={styles.noSceneText}>Оберіть або створіть сцену зліва</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  sceneList: {
    flex: 1,
    padding: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  sceneCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sceneCardActive: {
    borderColor: '#3b82f6',
  },
  sceneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 2,
  },
  sceneInfo: {
    fontSize: 12,
    color: '#94a3b8',
  },
  workspace: {
    flex: 1,
  },
  placeholderView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 18,
  },
  noScenePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSceneText: {
    color: '#64748b',
    fontSize: 18,
  },
});
