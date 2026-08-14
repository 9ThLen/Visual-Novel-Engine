import { z } from 'zod';

const sceneBackgroundPlacementSchema = z.discriminatedUnion('operation', [
  z.object({
    kind: z.literal('scene_background'), operation: z.literal('insert'), sceneId: z.string().min(1),
    afterStepId: z.string().nullable().optional(), transition: z.enum(['fade', 'dissolve', 'instant', 'wipe']).optional(),
    duration: z.number().min(0).max(30).optional(),
  }),
  z.object({
    kind: z.literal('scene_background'), operation: z.literal('replace'), sceneId: z.string().min(1), stepId: z.string().min(1),
    transition: z.enum(['fade', 'dissolve', 'instant', 'wipe']).optional(), duration: z.number().min(0).max(30).optional(),
  }),
]);
const characterScenePlacementSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('insert'), sceneId: z.string().min(1), afterStepId: z.string().nullable().optional(),
    position: z.enum(['left', 'center', 'right', 'far-left', 'far-right']).optional(),
    transition: z.enum(['instant', 'fade', 'slide-left', 'slide-right', 'zoom']).optional(), duration: z.number().min(0).max(30).nullable().optional(),
  }),
  z.object({
    operation: z.literal('replace'), sceneId: z.string().min(1), stepId: z.string().min(1),
    position: z.enum(['left', 'center', 'right', 'far-left', 'far-right']).optional(),
    transition: z.enum(['instant', 'fade', 'slide-left', 'slide-right', 'zoom']).optional(), duration: z.number().min(0).max(30).nullable().optional(),
  }),
]);
const imagePlacementSchema = z.union([
  sceneBackgroundPlacementSchema,
  z.object({
    kind: z.literal('character_sprite'), characterId: z.string().min(1), spriteName: z.string().min(1),
    tags: z.array(z.string().min(1)).max(20).optional(), setAsDefault: z.boolean().optional(), scenePlacement: characterScenePlacementSchema.optional(),
  }),
]);
import { aiReaderAppearancePatchSchema } from './appearance-patch';
import { aiScenePatchSchema } from './scene-patch-types';
import { aiChangeSetSchema } from './change-set';
import { AI_CAPABILITIES } from './permissions';

export interface BridgeToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  exposure: 'model' | 'internal';
  site: 'app' | 'bridge';
  requiresCapability?: string;
  timeoutMs?: number;
  binaryResult?: boolean;
  effect: 'read' | 'mutation' | 'cost';
}

export const BRIDGE_TOOLS: BridgeToolDef[] = [
  { name: 'get_story_overview', description: 'Get the current story summary, including the reader theme and its revision.', inputSchema: z.object({}), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'list_scenes', description: 'List scenes in the current story.', inputSchema: z.object({}), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'get_scene', description: 'Read a canonical scene including its revision.', inputSchema: z.object({ sceneId: z.string().min(1) }), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'list_story_images', description: "List images already in this story's library, with how often each is used.", inputSchema: z.object({}), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'get_image_details', description: 'Details for one story image, including every block that references it.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'find_asset_usage', description: 'Find every scene and block that references an asset.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app', effect: 'read' },
  { name: 'propose_scene_patch', description: 'Propose a scene patch for user review. This never applies it.', inputSchema: z.object({ patch: aiScenePatchSchema }), exposure: 'model', site: 'app', effect: 'mutation', requiresCapability: 'scene_edit', timeoutMs: 600_000 },
  { name: 'propose_appearance_patch', description: 'Propose reader theme colors and/or one closed layout preset (classic, compact, top) for user review. This never applies them.', inputSchema: z.object({ patch: aiReaderAppearancePatchSchema }), exposure: 'model', site: 'app', effect: 'mutation', requiresCapability: 'appearance', timeoutMs: 600_000 },
  { name: 'propose_changeset', description: 'Propose an atomic multi-scene, character, and branching change set for user review. This never applies it.', inputSchema: aiChangeSetSchema, exposure: 'model', site: 'app', effect: 'mutation', requiresCapability: 'changeset', timeoutMs: 600_000 },
  { name: 'authorize_capability', description: 'Ask the app to authorize an internal AI capability before bridge-side work begins.', inputSchema: z.object({ capability: z.enum(AI_CAPABILITIES), estimate: z.union([z.string(), z.object({ provider: z.string().min(1).optional(), costUsdRange: z.object({ min: z.number(), max: z.number(), currency: z.literal('USD') }), model: z.string(), size: z.string(), quality: z.string() })]).optional() }), exposure: 'internal', site: 'app', effect: 'cost', timeoutMs: 600_000 },
  { name: 'get_image_binary', description: 'Read the bytes for an image in the active story.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'internal', site: 'app', effect: 'read', binaryResult: true },
  { name: 'remove_background', description: 'Remove the background from an image in the active story and offer the result for import.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app', effect: 'cost', requiresCapability: 'image_generate', timeoutMs: 600_000 },
  { name: 'generate_image', description: 'Generate a new story image and offer it for import, optionally placing a background or attaching a character sprite after user approval.', inputSchema: z.object({ prompt: z.string().min(1), aspectRatio: z.enum(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']).optional(), resolution: z.enum(['1K', '2K', '4K']).optional(), quality: z.enum(['draft', 'standard', 'high']).optional(), outputFormat: z.enum(['webp', 'jpeg', 'png']).optional(), purpose: z.enum(['background', 'character', 'item', 'other']), placement: imagePlacementSchema.optional() }), exposure: 'model', site: 'bridge', effect: 'cost', requiresCapability: 'image_generate' },
  { name: 'edit_image', description: 'Edit an existing story image and offer it for import, optionally placing a background or attaching a character sprite after user approval.', inputSchema: z.object({ assetId: z.string().min(1), prompt: z.string().min(1), aspectRatio: z.enum(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']).optional(), resolution: z.enum(['1K', '2K', '4K']).optional(), quality: z.enum(['draft', 'standard', 'high']).optional(), outputFormat: z.enum(['webp', 'jpeg', 'png']).optional(), purpose: z.enum(['background', 'character', 'item', 'other']).optional(), placement: imagePlacementSchema.optional() }), exposure: 'model', site: 'bridge', effect: 'cost', requiresCapability: 'image_generate' },
];

export const MODEL_BRIDGE_TOOLS = BRIDGE_TOOLS.filter(tool => tool.exposure === 'model');
export const APP_BRIDGE_TOOL_NAMES = BRIDGE_TOOLS.filter(tool => tool.site === 'app').map(tool => tool.name);
export const BRIDGE_HANDLER_TOOL_NAMES = BRIDGE_TOOLS.filter(tool => tool.site === 'bridge').map(tool => tool.name);

export function getBridgeTool(name: string): BridgeToolDef | undefined {
  return BRIDGE_TOOLS.find(tool => tool.name === name);
}
