import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ComicPanelSection } from '@/components/document-editor/inspector/ComicPanelSection';
import { ComicReadOverlay } from '@/components/document-editor/inspector/ComicReadOverlay';
import { ScenePreviewCard } from '@/components/document-editor/inspector/ScenePreviewCard';
import { ScenePreviewOverlay } from '@/components/document-editor/inspector/ScenePreviewOverlay';
import { SceneFactsCard, type SceneRef } from '@/components/document-editor/inspector/SceneFactsCard';
import { INSPECTOR_RAIL_PADDING, INSPECTOR_RAIL_WIDTH } from '@/components/document-editor/inspector/rail-metrics';
import { useColors } from '@/hooks/use-colors';
import { withAlpha } from '@/lib/_core/theme';
import { addressSentences } from '@/lib/comic/comic-anchors';
import { buildAuthorComicPlan, type ComicPagePlan, type ComicPanel, type ComicPanelElement } from '@/lib/comic/comic-layout';
import { resolveScenePresentation } from '@/lib/comic/comic-presentation';
import {
  comicEditsOf,
  resolveComicSettings,
  withComicEdits,
  withElementEdit,
  withoutPanelEdits,
  withPanelEdit,
  type ComicEdits,
  type ComicElementChange,
  type ComicPanelChange,
} from '@/lib/comic/comic-settings';
import { documentSceneNovelOnly, selectionComicAnchor } from '@/lib/document-editor/document-comic';
import { documentSceneToTimelineWithOrigins } from '@/lib/document-editor/document-scene';
import { buildPreviewFrames } from '@/lib/document-editor/preview-frames';
import type { PreviewFormat } from '@/lib/document-editor/preview-viewport';
import { sanitizeReaderLayoutPreset } from '@/lib/story-theme';
import { useAppStore } from '@/stores/use-app-store';
import { useEditorContextStore } from '@/stores/editor-context-store';
import { useEditorPreviewDevice } from '@/components/document-editor/inspector/useEditorPreviewDevice';
import type { ColorScheme } from '@/constants/theme';
import type { Character } from '@/lib/character-types';
import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import type { SceneComicSettings, TimelineStep } from '@/lib/engine/types';

type InspectorTab = 'block' | 'scene' | 'issues';

const EMPTY_COMIC_PLAN: ComicPagePlan = { panels: [] };
/** How many of a scene's comic edits the Panel section can undo, newest kept. */
const COMIC_UNDO_DEPTH = 50;

/** Changes a scene's comic settings as they are in the store. */
export type ComicSettingsUpdate = (settings: SceneComicSettings | undefined) => SceneComicSettings | undefined;

/** Every sentence of a panel, in order: what its edit is fastened to. */
function sentencesOfPanel(panel: ComicPanel) {
  return panel.elements.flatMap((element) => element.sentences);
}

interface DocumentInspectorPanelProps {
  colorScheme?: ColorScheme;
  scene: DocumentScene | null;
  storyId: string;
  characters: Character[];
  storyScenes: SceneRef[];
  onOpenScene?: (sceneId: string) => void;
  /** The scene's comic settings, from its record: how it is read, and the author's edits of its panels. */
  comicSettings?: SceneComicSettings;
  /** Writes the scene's comic settings: the Panel section's edits. Left out, the section is not shown. */
  onUpdateComicSettings?: (update: ComicSettingsUpdate) => void;
}

export function DocumentInspectorPanel({
  colorScheme,
  scene,
  storyId,
  characters,
  storyScenes,
  onOpenScene,
  comicSettings,
  onUpdateComicSettings,
}: DocumentInspectorPanelProps) {
  const colors = useColors(colorScheme);
  const [tab, setTab] = useState<InspectorTab>('scene');
  const [device, setDevice] = useEditorPreviewDevice();
  const [frameIndex, setFrameIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const layoutPreset = useAppStore((state) =>
    sanitizeReaderLayoutPreset(state.storiesMetadata.find((story) => story.id === storyId)?.readerLayoutPreset),
  );
  const textSize = useAppStore((state) => state.settings.textSize);
  const readerFontScale = useAppStore((state) => state.settings.readerFontScale);
  const readerLineHeightScale = useAppStore((state) => state.settings.readerLineHeightScale);
  const readerSettings = useMemo(
    () => ({ textSize, readerFontScale, readerLineHeightScale }),
    [textSize, readerFontScale, readerLineHeightScale],
  );

  // Rebuilt on every keystroke in the editor, so it stays keyed to the scene
  // object identity the editor already replaces per edit.
  const frames = useMemo(() => buildPreviewFrames(scene, characters), [scene, characters]);
  const issues = useMemo(() => collectIssues(scene), [scene]);

  // Typing can shorten the scene under the stepper; clamp instead of resetting
  // so the author keeps their place.
  useEffect(() => {
    setFrameIndex((current) => Math.min(current, Math.max(0, frames.length - 1)));
  }, [frames.length]);

  // The Preview draws a scene the way it is read — a comic when it is set to
  // be one and nothing in it needs the novel — until the author picks a
  // format for that scene.
  const sceneId = scene?.sceneId ?? null;
  const readsAs = useMemo(() => resolveScenePresentation(
    undefined,
    null,
    comicSettings,
    { novelOnly: scene ? documentSceneNovelOnly(scene) : null },
  ).readAs, [comicSettings, scene]);
  const [formatChoice, setFormatChoice] = useState<{ sceneId: string; format: PreviewFormat } | null>(null);
  const format: PreviewFormat = sceneId && formatChoice?.sceneId === sceneId ? formatChoice.format : readsAs;
  const selectFormat = useCallback((next: PreviewFormat) => {
    if (sceneId) setFormatChoice({ sceneId, format: next });
  }, [sceneId]);

  // The author's plan: every step, as the comic would draw it. Built only
  // while the comic is shown, as it converts the whole scene on every edit.
  const comicTimeline = useMemo(
    () => (format === 'comic' && scene ? documentSceneToTimelineWithOrigins(scene, characters).timeline : null),
    [characters, format, scene],
  );
  const comicPlan = useMemo(
    () => (comicTimeline ? buildAuthorComicPlan(comicTimeline, comicSettings) : EMPTY_COMIC_PLAN),
    [comicSettings, comicTimeline],
  );
  const comicSentences = useMemo(() => (comicTimeline ? addressSentences(comicTimeline) : []), [comicTimeline]);
  const comicEdits = useMemo(() => resolveComicSettings(comicSettings, comicSentences).edits, [comicSentences, comicSettings]);
  const [panelIndex, setPanelIndex] = useState(0);
  useEffect(() => {
    setPanelIndex((current) => Math.min(current, Math.max(0, comicPlan.panels.length - 1)));
  }, [comicPlan.panels.length]);

  // The Preview follows the author's caret to the panel of its sentence: on a
  // new caret or selection only, so an edit that redraws the plan leaves the
  // panel the author stepped to.
  const selection = useEditorContextStore((state) => state.selection);
  const followedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!comicTimeline || !selection || selection.storyId !== storyId || selection.sceneId !== sceneId) return;
    const key = `${selection.sceneId}:${selection.seq}`;
    if (followedRef.current === key) return;
    followedRef.current = key;
    const anchor = selectionComicAnchor(selection, comicTimeline);
    if (!anchor) return;
    const index = comicPlan.panels.findIndex((panel) => sentencesOfPanel(panel).some((sentence) => sentence.anchor === anchor));
    if (index >= 0) setPanelIndex(index);
  }, [comicPlan, comicTimeline, sceneId, selection, storyId]);

  // The Panel section's own Undo: the scene's edits as they were before each
  // change made here, per scene, for as long as the editor is open.
  const [comicUndo, setComicUndo] = useState<{ sceneId: string; edits: ComicEdits }[]>([]);
  const changeComic = useCallback((change: (settings: SceneComicSettings | undefined) => SceneComicSettings | undefined) => {
    if (!sceneId || !onUpdateComicSettings) return;
    const before = comicEditsOf(comicSettings);
    if (JSON.stringify(comicEditsOf(change(comicSettings))) === JSON.stringify(before)) return;
    setComicUndo((stack) => [...stack, { sceneId, edits: before }].slice(-COMIC_UNDO_DEPTH));
    onUpdateComicSettings(change);
  }, [comicSettings, onUpdateComicSettings, sceneId]);
  const undoComic = useMemo(() => {
    const last = comicUndo.map((entry) => entry.sceneId).lastIndexOf(sceneId ?? '');
    if (last < 0 || !onUpdateComicSettings) return undefined;
    return () => {
      const { edits } = comicUndo[last];
      setComicUndo((stack) => stack.filter((_entry, index) => index !== last));
      onUpdateComicSettings((settings) => withComicEdits(settings, edits));
    };
  }, [comicUndo, onUpdateComicSettings, sceneId]);

  const shownPanel = format === 'comic' ? comicPlan.panels[panelIndex] ?? null : null;
  const changePanel = useCallback((change: ComicPanelChange) => {
    if (!shownPanel) return;
    const target = sentencesOfPanel(shownPanel);
    changeComic((settings) => withPanelEdit(settings, comicSentences, target, change));
  }, [changeComic, comicSentences, shownPanel]);
  const changeElement = useCallback((element: ComicPanelElement, change: ComicElementChange) => {
    changeComic((settings) => withElementEdit(settings, comicSentences, element.sentences, change));
  }, [changeComic, comicSentences]);
  const shownPanelEdited = Boolean(shownPanel && sentencesOfPanel(shownPanel).some(
    (sentence) => comicEdits.panels.has(sentence.anchor) || comicEdits.elements.has(sentence.anchor),
  ));
  const restorePanel = useCallback(() => {
    if (!shownPanel) return;
    const target = sentencesOfPanel(shownPanel);
    changeComic((settings) => withoutPanelEdits(settings, comicSentences, target));
  }, [changeComic, comicSentences, shownPanel]);

  // The scene as it was when the author asked to read it.
  const [reading, setReading] = useState<{ sceneId: string; timeline: TimelineStep[] } | null>(null);
  const readAsComic = useCallback(() => {
    if (scene) setReading({ sceneId: scene.sceneId, timeline: documentSceneToTimelineWithOrigins(scene, characters).timeline });
  }, [characters, scene]);
  const previewTotal = format === 'comic' ? comicPlan.panels.length : frames.length;

  return (
    <View
      style={{
        // As tall as the rail gives it, not as its content: otherwise the
        // panel outgrows the rail, its ScrollView never scrolls, and the
        // whole page grows instead.
        flex: 1,
        width: INSPECTOR_RAIL_WIDTH,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
        backgroundColor: colors['surface-1'],
      }}
    >
      <ScrollView contentContainerStyle={{ padding: INSPECTOR_RAIL_PADDING, gap: 16 }}>
        <ScenePreviewCard
          colorScheme={colorScheme}
          frames={frames}
          storyId={storyId}
          device={device}
          onSelectDevice={setDevice}
          layoutPreset={layoutPreset}
          settings={readerSettings}
          frameIndex={frameIndex}
          onFrameIndexChange={setFrameIndex}
          onExpand={previewTotal ? () => setExpanded(true) : undefined}
          format={format}
          onSelectFormat={selectFormat}
          comicPlan={comicPlan}
          panelIndex={panelIndex}
          onPanelIndexChange={setPanelIndex}
          onReadAsComic={readAsComic}
        />

        {shownPanel && onUpdateComicSettings ? (
          <ComicPanelSection
            colors={colors}
            storyId={storyId}
            characters={characters}
            panel={shownPanel}
            index={panelIndex}
            total={comicPlan.panels.length}
            edits={comicEdits}
            onChangePanel={changePanel}
            onChangeElement={changeElement}
            onRestore={shownPanelEdited ? restorePanel : undefined}
            onUndo={undoComic}
          />
        ) : null}

        <View>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
            Properties
          </Text>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {(['block', 'scene', 'issues'] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => setTab(item)}
                style={{
                  flex: 1,
                  minHeight: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: tab === item ? colors.primary : colors.border,
                  backgroundColor: tab === item ? withAlpha(colors.primary, 0.12) : colors.background,
                }}
              >
                <Text style={{ color: tab === item ? colors.primary : colors.foreground, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {tab === 'scene' ? (
          <SceneFactsCard
            scene={scene}
            frames={frames}
            storyScenes={storyScenes}
            onOpenScene={onOpenScene}
            colors={colors}
          />
        ) : null}
        {tab === 'block' ? (
          <BlockList scene={scene} colors={colors} />
        ) : null}
        {tab === 'issues' ? (
          <IssuesList issues={issues} colors={colors} />
        ) : null}
      </ScrollView>

      {expanded ? (
        <ScenePreviewOverlay
          onClose={() => setExpanded(false)}
          frames={frames}
          storyId={storyId}
          device={device}
          onSelectDevice={setDevice}
          layoutPreset={layoutPreset}
          settings={readerSettings}
          colorScheme={colorScheme}
          frameIndex={frameIndex}
          onFrameIndexChange={setFrameIndex}
          format={format}
          onSelectFormat={selectFormat}
          comicPlan={comicPlan}
          panelIndex={panelIndex}
          onPanelIndexChange={setPanelIndex}
        />
      ) : null}

      {reading ? (
        <ComicReadOverlay
          sceneId={reading.sceneId}
          timeline={reading.timeline}
          comic={comicSettings}
          storyId={storyId}
          device={device}
          settings={readerSettings}
          onClose={() => setReading(null)}
        />
      ) : null}
    </View>
  );
}

function BlockList({ scene, colors }: { scene: DocumentScene | null; colors: ReturnType<typeof useColors> }) {
  const blocks = scene?.blocks ?? [];
  return (
    <View style={{ gap: 7 }}>
      {blocks.map((block, index) => (
        <InfoCard
          key={block.id}
          title={`${index + 1}. ${blockLabel(block)}`}
          subtitle={blockSubtitle(block)}
          colors={colors}
        />
      ))}
    </View>
  );
}

function IssuesList({ issues, colors }: { issues: string[]; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {issues.length} issues
      </Text>
      {issues.length ? issues.map((issue) => (
        <InfoCard key={issue} title="Warning" subtitle={issue} colors={colors} tone="warning" />
      )) : (
        <InfoCard title="No issues" subtitle="Scene is ready for preview." colors={colors} />
      )}
    </View>
  );
}

function InfoCard({
  title,
  subtitle,
  colors,
  tone,
}: {
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useColors>;
  tone?: 'warning';
}) {
  const borderColor = tone === 'warning' ? '#d97706' : colors.border;
  const backgroundColor = tone === 'warning' ? '#fffbeb' : colors.background;
  return (
    <View style={{ borderWidth: 1, borderColor, backgroundColor, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>{title}</Text>
      <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 3 }}>{subtitle}</Text>
    </View>
  );
}

function blockLabel(block: DocumentBlock): string {
  if (block.kind === 'technical') return block.blockType;
  return block.kind;
}

function blockSubtitle(block: DocumentBlock): string {
  if (block.kind === 'text') return block.content.trim() || 'Draft text';
  if (block.kind === 'dialogue') return `${block.speakerName || 'Character'}: ${block.text || '...'}`;
  if (block.kind === 'choice') return `${block.question || 'Choice'} · ${block.options.length} options`;
  return block.summary || block.label || block.commandId;
}

function collectIssues(scene: DocumentScene | null): string[] {
  if (!scene) return ['No scene loaded.'];
  const issues: string[] = [];
  const hasBackground = scene.blocks.some((block) => block.kind === 'technical' && block.blockType === 'background');
  if (!hasBackground) issues.push('Choose a background.');
  const hasText = scene.blocks.some((block) => {
    if (block.kind === 'text') return Boolean(block.content.trim());
    if (block.kind === 'dialogue') return Boolean(block.text.trim());
    if (block.kind === 'choice') return block.options.length > 0;
    return false;
  });
  if (!hasText) issues.push('Add story text or dialogue.');
  return issues;
}
