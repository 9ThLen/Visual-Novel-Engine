import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import LegoCanvas from '@/components/lego-editor/LegoCanvas';
import TimelineEditor from '@/components/lego-editor/TimelineEditor';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { Scene } from '@/lib/scene-types';
import type { AtomBlock } from '@/lib/atom-types';
import { Tooltip } from '@/components/common/Tooltip';
import { TourGuide } from '@/components/common/TourGuide';
import { DropProvider, Droppable } from 'react-native-reanimated-dnd';
import { useSceneManagement } from '@/hooks/lego/useSceneManagement';
import { useLegoTabs, type TabType } from '@/hooks/lego/useLegoTabs';
import { useLegoDnD } from '@/hooks/lego/useLegoDnD';

const TAB_CONFIG = [
  { key: 'canvas' as const, label: '🎨 Canvas', icon: '🎨' },
  { key: 'timeline' as const, label: '📅 Timeline', icon: '📅' },
  { key: 'graph' as const, label: '🕸️ Graph', icon: '🕸️' },
];

export default function LegoEditorScreen() {
  const {
    scenes,
    activeScene,
    activeSceneId,
    setActiveScene,
    handleAddScene,
    handleAtomsChange,
  } = useSceneManagement();

  const { activeTab, fadeAnim, switchTab } = useLegoTabs();
  const { handleSceneDrop } = useLegoDnD();

  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [tourVisible, setTourVisible] = useState(false);
  const layout = useResponsiveLayout();
  const isTabletLandscape = layout.isTablet && layout.isLandscape;

  const tourSteps = [
    { id: 'welcome', title: 'Ласкаво просимо! 👋', description: 'Це LEGO Editor для створення візуальних новел. Давайте пройдемо короткий тур.' },
    { id: 'tabs', title: 'Вкладки навігації', description: 'Використовуйте Canvas для редагування атомів, Timeline для послідовності подій, та Graph для зв\'язків між сценами.' },
    { id: 'scenes', title: 'Список сцен', description: 'Тут відображаються всі ваші сцени. Натисніть на сцену, щоб вибрати її для редагування.' },
    { id: 'add-scene', title: 'Додавання сцен', description: 'Натисніть цю кнопку, щоб створити нову сцену.' },
    { id: 'canvas', title: 'Робоча область', description: 'Тут ви перетягуєте атоми (діалоги, персонажі, зображення) для створення сцени.' },
  ];

  // Render workspace content based on active tab
  const renderWorkspace = () => {
    if (activeTab === 'canvas' && activeScene) {
      return (
        <LegoCanvas
          atoms={activeScene.elements.filter((e): e is AtomBlock => 'snapPoints' in e)}
          onAtomsChange={handleAtomsChange}
          selectedAtomId={selectedAtomId}
          onAtomSelect={setSelectedAtomId}
        />
      );
    }
    if (activeTab === 'timeline' && activeScene) {
      return <TimelineEditor sceneId={activeScene.id} />;
    }
    if (activeTab === 'graph') {
      return (
        <View style={styles.placeholderView}>
          <Text style={styles.placeholderText}>🕸️ Graph View - Coming Soon</Text>
        </View>
      );
    }
    return (
      <View style={styles.noScenePlaceholder}>
        <Text style={styles.noSceneText}>Оберіть або створіть сцену зліва</Text>
      </View>
    );
  };

  return (
    <DropProvider>
    <View style={styles.container}>
      <View style={[styles.header, layout.isTablet && styles.headerTablet]}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, layout.isTablet && styles.titleTablet]}>🧱 LEGO Editor</Text>
          {/* Tab Selector */}
          <View style={[styles.tabBar, layout.isTablet && styles.tabBarTablet]}>
            {TAB_CONFIG.map((tab) => (
              <Tooltip key={tab.key} text={`Перейти до вкладки ${tab.label}`}>
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabButton,
                    layout.isTablet && styles.tabButtonTablet,
                    activeTab === tab.key && styles.tabButtonActive,
                    activeTab === tab.key && layout.isTablet && styles.tabButtonActiveTablet,
                  ]}
                  onPress={() => switchTab(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      layout.isTablet && styles.tabTextTablet,
                      activeTab === tab.key && styles.tabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              </Tooltip>
            ))}
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.addButton, layout.isTablet && styles.addButtonTablet]} onPress={handleAddScene}>
            <Text style={styles.addButtonText}>+ Нова сцена</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tourButton, layout.isTablet && styles.tourButtonTablet]} onPress={() => setTourVisible(true)}>
            <Text style={styles.tourButtonText}>❓ Тур</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.body, isTabletLandscape && styles.bodyLandscape]}>
        {/* Scene List Sidebar */}
        <View style={[styles.sidebar, layout.isTablet && { width: layout.sidebarWidth }]}>
          <ScrollView style={styles.sceneList}>
            {scenes.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Немає сцен.{'\n'}Створіть першу!</Text>
              </View>
            ) : (
              scenes.map((scene: Scene) => (
                <Droppable
                  key={scene.id}
                  droppableId={scene.id}
                  onDrop={(data: { elementId: string; sourceSceneId: string }) =>
                    handleSceneDrop(scene.id, data)
                  }
                  activeStyle={styles.sceneCardDropTarget}
                >
                  <TouchableOpacity
                    style={[
                      styles.sceneCard,
                      layout.isTablet && styles.sceneCardTablet,
                      scene.id === activeSceneId && styles.sceneCardActive,
                    ]}
                    onPress={() => setActiveScene(scene.id)}
                  >
                    <Text style={[styles.sceneName, layout.isTablet && styles.sceneNameTablet]}>{scene.name}</Text>
                    <Text style={styles.sceneInfo}>
                      🧩 {scene.elements.length} | ⏱ {scene.timeline.length}
                    </Text>
                  </TouchableOpacity>
                </Droppable>
              ))
            )}
          </ScrollView>
        </View>

        {/* Split View for tablets in landscape */}
        {isTabletLandscape ? (
          <View style={styles.splitViewContainer}>
            <View style={styles.splitPaneLeft}>
              <Animated.View style={[styles.workspace, { opacity: fadeAnim }]}>
                {renderWorkspace()}
              </Animated.View>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.splitPaneRight}>
              {activeTab === 'canvas' && activeScene ? (
                <TimelineEditor sceneId={activeScene.id} />
              ) : activeTab === 'timeline' && activeScene ? (
                <LegoCanvas
                  atoms={activeScene.elements.filter((e): e is AtomBlock => 'snapPoints' in e)}
                  onAtomsChange={handleAtomsChange}
                  selectedAtomId={selectedAtomId}
                  onAtomSelect={setSelectedAtomId}
                />
              ) : (
                <View style={styles.placeholderView}>
                  <Text style={styles.placeholderText}>Оберіть вкладку для перегляду</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Normal view for phones and portrait tablets */
          <Animated.View style={[styles.workspace, { opacity: fadeAnim }]}>
            {renderWorkspace()}
          </Animated.View>
        )}
      </View>
      <TourGuide
        visible={tourVisible}
        steps={tourSteps}
        onComplete={() => setTourVisible(false)}
        onSkip={() => setTourVisible(false)}
      />
    </View>
    </DropProvider>
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
  headerTablet: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
  titleTablet: {
    fontSize: 28,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },
  tabBarTablet: {
    borderRadius: 10,
    padding: 6,
    gap: 6,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tabButtonTablet: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#3b82f6',
  },
  tabButtonActiveTablet: {
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextTablet: {
    fontSize: 16,
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
  addButtonTablet: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  tourButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  tourButtonTablet: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginLeft: 12,
  },
  tourButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  bodyLandscape: {
    // Additional styles for landscape tablet if needed
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
  sceneCardTablet: {
    padding: 16,
    minHeight: 70,
    borderRadius: 10,
  },
  sceneCardActive: {
    borderColor: '#3b82f6',
  },
  sceneCardDropTarget: {
    borderColor: '#22c55e',
    borderWidth: 2,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  sceneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 2,
  },
  sceneNameTablet: {
    fontSize: 18,
  },
  sceneInfo: {
    fontSize: 12,
    color: '#94a3b8',
  },
  workspace: {
    flex: 1,
  },
  // Split view styles for tablets in landscape
  splitViewContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  splitPaneLeft: {
    flex: 3,
  },
  splitDivider: {
    width: 1,
    backgroundColor: '#1e293b',
  },
  splitPaneRight: {
    flex: 2,
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
