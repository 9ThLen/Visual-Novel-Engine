/**
 * Scripted stand-in for a real model, used to drive the chat UI before a
 * provider is connected. It emits real, validator-passing patches so the whole
 * pipeline (validate → diff → apply → rollback) is exercisable without a bridge.
 *
 * Recognized commands: rewrite the dialogue, set an existing background, darken
 * the reader theme. Anything else gets a canned text reply.
 */
import { generateId } from '@/lib/id-utils';
import type { BackgroundBlockData, DialogueBlockData, TimelineStep } from '@/lib/engine/types';
import { STORY_THEME_PRESETS, type StoryReaderTheme } from '@/lib/story-theme';
import { allTranslations, type Language } from '@/lib/translations';
import { useAppStore } from '@/stores/use-app-store';
import type { AiReaderAppearancePatch, ThemeColorKey } from './appearance-patch';
import { listStoryImages } from './asset-tools';
import type { AiSceneView, AiStoryContext } from './story-context';
import type { AiScenePatch } from './scene-patch-types';

export type FakeAgentResponse =
  | { kind: 'text'; text: string }
  | { kind: 'patch'; patch: AiScenePatch }
  | { kind: 'appearance'; patch: AiReaderAppearancePatch };

const THINKING_DELAY_MS = 600;
const REWRITE_PATTERN = /перепиши|rewrite/i;
const BACKGROUND_PATTERN = /фон|background/i;
const THEME_PATTERN = /темніш|темнiш|темну|darker|theme|тему/i;

const BACKGROUND_KEYS: ThemeColorKey[] = ['dialogueBg', 'nameBg', 'choiceBg'];
const DARKEN_FACTOR = 0.6;

function translate(key: string): string {
  const language: Language = useAppStore.getState().language;
  return allTranslations[language]?.[key] ?? allTranslations.en[key] ?? key;
}

function findFirstDialogueStep(scene: AiSceneView): TimelineStep | null {
  return scene.timeline.find((step) => step.blockType === 'dialogue') ?? null;
}

function buildRewritePatch(storyId: string, scene: AiSceneView, dialogueStep: TimelineStep): AiScenePatch {
  const data = dialogueStep.data as DialogueBlockData;
  const suffix = translate('aiChat.fakeAgent.rewrittenSuffix');
  const rewrittenStep: TimelineStep = {
    ...dialogueStep,
    data: {
      ...data,
      entries: data.entries.map((entry) => ({ ...entry, text: `${entry.text}${suffix}` })),
    },
  };

  const firstEntry = data.entries[0];
  const insertedData: DialogueBlockData = {
    entries: [
      {
        id: generateId('ai-entry'),
        characterId: firstEntry?.characterId ?? '',
        speakerName: firstEntry?.speakerName,
        spriteId: firstEntry?.spriteId ?? '',
        text: translate('aiChat.fakeAgent.newLine'),
      },
    ],
    currentEntryIndex: 0,
  };
  const insertedStep: TimelineStep = {
    id: generateId('ai-step'),
    blockType: 'dialogue',
    data: insertedData,
    collapsed: false,
    enabled: true,
  };

  return {
    storyId,
    sceneId: scene.id,
    expectedRevision: scene.revision,
    explanation: translate('aiChat.fakeAgent.rewriteExplanation'),
    operations: [
      { op: 'replace_step', stepId: dialogueStep.id, step: rewrittenStep },
      { op: 'insert_steps', afterStepId: dialogueStep.id, steps: [insertedStep] },
    ],
  };
}

/** Uses an image already in the story library — the fake agent never invents an assetId. */
function buildBackgroundPatch(storyId: string, scene: AiSceneView, assetId: string): AiScenePatch {
  const existing = scene.timeline.find((step) => step.blockType === 'background') ?? null;
  const data: BackgroundBlockData = { assetId, transition: 'fade', duration: 0.6 };

  const step: TimelineStep = existing
    ? { ...existing, data }
    : { id: generateId('ai-step'), blockType: 'background', data, collapsed: false, enabled: true };

  return {
    storyId,
    sceneId: scene.id,
    expectedRevision: scene.revision,
    explanation: translate('aiChat.fakeAgent.backgroundExplanation'),
    operations: existing
      ? [{ op: 'replace_step', stepId: existing.id, step }]
      : [{ op: 'insert_steps', afterStepId: null, steps: [step] }],
  };
}

function darkenHex(color: string): string {
  const body = color.slice(1);
  const hasAlpha = body.length === 8;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(body.slice(offset, offset + 2), 16);
    return Math.round(value * DARKEN_FACTOR).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}${hasAlpha ? body.slice(6, 8) : ''}`;
}

function buildDarkerThemePatch(storyId: string, current: StoryReaderTheme, revision: string): AiReaderAppearancePatch {
  const base: StoryReaderTheme = { ...STORY_THEME_PRESETS[0].theme, ...current };

  const theme: Partial<Record<ThemeColorKey, string>> = {};
  for (const key of BACKGROUND_KEYS) {
    const color = base[key];
    if (!color) continue;
    const darker = darkenHex(color);
    if (darker !== current[key]) theme[key] = darker;
  }

  // Already as dark as this rule can make it — fall back to the night preset so
  // the demo always produces a reviewable diff instead of an empty patch.
  if (Object.keys(theme).length === 0) {
    const night = STORY_THEME_PRESETS.find((preset) => preset.id === 'night')?.theme ?? {};
    for (const [key, color] of Object.entries(night)) {
      if (color !== current[key as ThemeColorKey]) theme[key as ThemeColorKey] = color;
    }
  }

  return {
    storyId,
    expectedRevision: revision,
    theme,
    explanation: translate('aiChat.fakeAgent.themeExplanation'),
  };
}

export async function respond(userText: string, ctx: AiStoryContext): Promise<FakeAgentResponse> {
  await new Promise((resolve) => setTimeout(resolve, THINKING_DELAY_MS));

  if (THEME_PATTERN.test(userText)) {
    const patch = buildDarkerThemePatch(ctx.story.id, ctx.appearance.theme, ctx.appearance.revision);
    if (Object.keys(patch.theme).length > 0) return { kind: 'appearance', patch };
  }

  if (ctx.activeScene && BACKGROUND_PATTERN.test(userText)) {
    const images = listStoryImages(ctx.story.id);
    if (images.length === 0) return { kind: 'text', text: translate('aiChat.fakeAgent.noImages') };
    return { kind: 'patch', patch: buildBackgroundPatch(ctx.story.id, ctx.activeScene, images[0].id) };
  }

  if (ctx.activeScene && REWRITE_PATTERN.test(userText)) {
    const dialogueStep = findFirstDialogueStep(ctx.activeScene);
    if (dialogueStep) {
      return { kind: 'patch', patch: buildRewritePatch(ctx.story.id, ctx.activeScene, dialogueStep) };
    }
  }

  return { kind: 'text', text: translate('aiChat.fakeAgent.fallback') };
}
