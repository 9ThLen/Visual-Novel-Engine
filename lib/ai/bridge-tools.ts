import { z } from 'zod';
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
}

export const BRIDGE_TOOLS: BridgeToolDef[] = [
  { name: 'get_story_overview', description: 'Get the current story summary, including the reader theme and its revision.', inputSchema: z.object({}), exposure: 'model', site: 'app' },
  { name: 'list_scenes', description: 'List scenes in the current story.', inputSchema: z.object({}), exposure: 'model', site: 'app' },
  { name: 'get_scene', description: 'Read a canonical scene including its revision.', inputSchema: z.object({ sceneId: z.string().min(1) }), exposure: 'model', site: 'app' },
  { name: 'list_story_images', description: "List images already in this story's library, with how often each is used.", inputSchema: z.object({}), exposure: 'model', site: 'app' },
  { name: 'get_image_details', description: 'Details for one story image, including every block that references it.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app' },
  { name: 'find_asset_usage', description: 'Find every scene and block that references an asset.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app' },
  { name: 'propose_scene_patch', description: 'Propose a scene patch for user review. This never applies it.', inputSchema: z.object({ patch: aiScenePatchSchema }), exposure: 'model', site: 'app', timeoutMs: 600_000 },
  { name: 'propose_appearance_patch', description: 'Propose reader theme colors and/or one closed layout preset (classic, compact, top) for user review. This never applies them.', inputSchema: z.object({ patch: aiReaderAppearancePatchSchema }), exposure: 'model', site: 'app', timeoutMs: 600_000 },
  { name: 'propose_changeset', description: 'Propose an atomic multi-scene, character, and branching change set for user review. This never applies it.', inputSchema: aiChangeSetSchema, exposure: 'model', site: 'app', timeoutMs: 600_000 },
  { name: 'authorize_capability', description: 'Ask the app to authorize an internal AI capability before bridge-side work begins.', inputSchema: z.object({ capability: z.enum(AI_CAPABILITIES), estimate: z.union([z.string(), z.object({ costUsdRange: z.object({ min: z.number(), max: z.number(), currency: z.literal('USD') }), model: z.string(), size: z.string(), quality: z.string() })]).optional() }), exposure: 'internal', site: 'app', timeoutMs: 600_000 },
  { name: 'get_image_binary', description: 'Read the bytes for an image in the active story.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'internal', site: 'app', binaryResult: true },
  { name: 'remove_background', description: 'Remove the background from an image in the active story and offer the result for import.', inputSchema: z.object({ assetId: z.string().min(1) }), exposure: 'model', site: 'app', requiresCapability: 'image_generate', timeoutMs: 600_000 },
  { name: 'generate_image', description: 'Generate a new story image and offer the result to the user for import.', inputSchema: z.object({ prompt: z.string().min(1), size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(), quality: z.enum(['low', 'medium', 'high']).optional(), outputFormat: z.enum(['webp', 'jpeg', 'png']).optional(), purpose: z.enum(['background', 'character', 'item', 'other']) }), exposure: 'model', site: 'bridge', requiresCapability: 'image_generate' },
  { name: 'edit_image', description: 'Edit an existing story image and offer the result to the user for import.', inputSchema: z.object({ assetId: z.string().min(1), prompt: z.string().min(1), size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(), quality: z.enum(['low', 'medium', 'high']).optional(), outputFormat: z.enum(['webp', 'jpeg', 'png']).optional(), purpose: z.enum(['background', 'character', 'item', 'other']).optional() }), exposure: 'model', site: 'bridge', requiresCapability: 'image_generate' },
];

export const MODEL_BRIDGE_TOOLS = BRIDGE_TOOLS.filter(tool => tool.exposure === 'model');
export const APP_BRIDGE_TOOL_NAMES = BRIDGE_TOOLS.filter(tool => tool.site === 'app').map(tool => tool.name);
export const BRIDGE_HANDLER_TOOL_NAMES = BRIDGE_TOOLS.filter(tool => tool.site === 'bridge').map(tool => tool.name);

export function getBridgeTool(name: string): BridgeToolDef | undefined {
  return BRIDGE_TOOLS.find(tool => tool.name === name);
}
