/**
 * Scripted stand-in for a real model, used to drive the Phase 0 chat UI
 * before the bridge/provider exists. Recognizes one command ("rewrite the
 * dialogue") and emits a real, validator-passing AiScenePatch; anything else
 * gets a canned text reply. The artificial delay mimics "thinking" latency.
 */
import { generateId } from '@/lib/id-utils';
import type { DialogueBlockData, TimelineStep } from '@/lib/engine/types';
import { allTranslations, type Language } from '@/lib/translations';
import { useAppStore } from '@/stores/use-app-store';
import type { AiSceneView, AiStoryContext } from './story-context';
import type { AiScenePatch } from './scene-patch-types';

export type FakeAgentResponse = { kind: 'text'; text: string } | { kind: 'patch'; patch: AiScenePatch };

const THINKING_DELAY_MS = 600;
const REWRITE_PATTERN = /перепиши|rewrite/i;

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

export async function respond(userText: string, ctx: AiStoryContext): Promise<FakeAgentResponse> {
  await new Promise((resolve) => setTimeout(resolve, THINKING_DELAY_MS));

  if (ctx.activeScene && REWRITE_PATTERN.test(userText)) {
    const dialogueStep = findFirstDialogueStep(ctx.activeScene);
    if (dialogueStep) {
      return { kind: 'patch', patch: buildRewritePatch(ctx.story.id, ctx.activeScene, dialogueStep) };
    }
  }

  return { kind: 'text', text: translate('aiChat.fakeAgent.fallback') };
}
