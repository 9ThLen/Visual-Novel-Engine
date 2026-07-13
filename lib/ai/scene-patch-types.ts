import { z } from 'zod';

import type { TimelineStep } from '@/lib/engine/types';

const conditionSchema = z.object({
  variableName: z.string().min(1),
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains', 'isEmpty', 'has', 'not_has']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const baseDataSchemas = {
  background: z.object({ assetId: z.string().nullable(), transition: z.enum(['fade', 'dissolve', 'instant', 'wipe']), duration: z.number(), delay: z.number().optional() }),
  character: z.object({ characterId: z.string().min(1), spriteId: z.string(), position: z.enum(['left', 'center', 'right', 'far-left', 'far-right']), transition: z.enum(['instant', 'fade', 'slide-left', 'slide-right', 'zoom']), delay: z.number(), duration: z.number().nullable() }),
  text: z.object({ content: z.string(), typewriterSpeed: z.number(), anchorTo: z.enum(['background', 'character']), characterId: z.string().optional(), spriteId: z.string().optional() }),
  dialogue: z.object({ entries: z.array(z.object({ id: z.string().min(1), characterId: z.string().min(1), speakerName: z.string().optional(), spriteId: z.string(), text: z.string() })), currentEntryIndex: z.number().int() }),
  choice: z.object({ options: z.array(z.object({ id: z.string().min(1), text: z.string(), targetSceneId: z.string().nullable(), condition: conditionSchema.optional() })) }),
  effect: z.object({ effectType: z.enum(['shake', 'flash', 'blur', 'rain', 'snow', 'fog', 'glitch', 'vignette']), target: z.enum(['screen', 'character', 'background']), characterId: z.string().optional(), intensity: z.number(), duration: z.number() }),
  stop_effect: z.object({ effectType: z.enum(['shake', 'flash', 'blur', 'rain', 'snow', 'fog', 'glitch', 'vignette', 'all']), target: z.enum(['screen', 'character', 'background', 'all']).optional() }),
  music: z.object({ mode: z.enum(['track', 'silence']), assetId: z.string().nullable(), volume: z.number(), loop: z.boolean(), fadeIn: z.number(), fadeOut: z.number(), boundTo: z.enum(['scene', 'continuous']) }),
  sound: z.object({ mode: z.enum(['track', 'silence']), assetId: z.string().nullable(), volume: z.number(), loop: z.boolean(), fadeIn: z.number(), fadeOut: z.number(), pitchVariation: z.number() }),
  interactive_object: z.object({ objectId: z.string(), name: z.string(), assetId: z.string().nullable(), position: z.object({}).passthrough(), actions: z.array(z.unknown()), oneTimeOnly: z.boolean(), pulseAnimation: z.boolean() }),
  camera: z.object({ action: z.enum(['zoom', 'pan', 'focus', 'reset']), target: z.string().optional(), duration: z.number(), easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']) }),
  variable: z.object({ variableName: z.string().min(1), operation: z.enum(['set', 'add', 'subtract', 'multiply', 'toggle']), value: z.union([z.string(), z.number(), z.boolean()]) }),
  transition: z.object({ mode: z.enum(['next', 'scene', 'end']), targetSceneId: z.string().nullable(), transitionType: z.enum(['fade', 'slide', 'instant']), duration: z.number() }),
  label: z.object({ name: z.string().min(1) }),
  goto: z.object({ targetLabel: z.string().min(1), condition: conditionSchema.nullish(), elseTargetLabel: z.string().nullish() }),
} as const;

const blockTypes = Object.keys(baseDataSchemas) as Array<keyof typeof baseDataSchemas>;

export const timelineStepSchema = z.object({
  id: z.string().min(1),
  blockType: z.enum(blockTypes),
  data: z.record(z.string(), z.unknown()),
  collapsed: z.boolean(),
  enabled: z.boolean(),
  conditions: z.array(conditionSchema).optional(),
}).superRefine((step, ctx) => {
  const result = baseDataSchemas[step.blockType].safeParse(step.data);
  if (!result.success) result.error.issues.forEach(issue => ctx.addIssue({ ...issue, path: ['data', ...issue.path] }));
}) as unknown as z.ZodType<TimelineStep>;

export type ScenePatchOperation =
  | { op: 'insert_steps'; afterStepId: string | null; steps: TimelineStep[] }
  | { op: 'replace_step'; stepId: string; step: TimelineStep }
  | { op: 'delete_steps'; stepIds: string[] }
  | { op: 'update_scene_metadata'; updates: { name?: string; description?: string; tags?: string[] } }
  | { op: 'set_connection'; outputPort: string; targetSceneId: string | null; label?: string };

export const scenePatchOperationSchema: z.ZodType<ScenePatchOperation> = z.discriminatedUnion('op', [
  z.object({ op: z.literal('insert_steps'), afterStepId: z.string().nullable(), steps: z.array(timelineStepSchema) }),
  z.object({ op: z.literal('replace_step'), stepId: z.string(), step: timelineStepSchema }),
  z.object({ op: z.literal('delete_steps'), stepIds: z.array(z.string()) }),
  z.object({ op: z.literal('update_scene_metadata'), updates: z.object({ name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() }) }),
  z.object({ op: z.literal('set_connection'), outputPort: z.string(), targetSceneId: z.string().nullable(), label: z.string().optional() }),
]);

export interface AiScenePatch { storyId: string; sceneId: string; expectedRevision: string; operations: ScenePatchOperation[]; explanation: string }

export const aiScenePatchSchema: z.ZodType<AiScenePatch> = z.object({
  storyId: z.string().min(1), sceneId: z.string().min(1), expectedRevision: z.string().min(1),
  operations: z.array(scenePatchOperationSchema), explanation: z.string(),
});
