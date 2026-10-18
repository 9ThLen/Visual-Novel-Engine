// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_BRIDGE_TOOL_NAMES, BRIDGE_HANDLER_TOOL_NAMES, BRIDGE_TOOLS, EXTERNAL_BRIDGE_TOOLS, MODEL_BRIDGE_TOOLS } from '../../src/lib/ai/bridge-tools';

describe('bridge tool registry', () => {
  it('keeps every model and executor surface in parity', () => {
    const modelNames = MODEL_BRIDGE_TOOLS.map(tool => tool.name);
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'tools/ai-bridge/src/codex-response-schema.json'), 'utf8')) as {
      properties: { toolName: { enum: Array<string | null> } };
    };

    expect(schema.properties.toolName.enum.filter((name): name is string => name !== null)).toEqual(modelNames);
    expect(APP_BRIDGE_TOOL_NAMES).toEqual(BRIDGE_TOOLS.filter(tool => tool.site === 'app').map(tool => tool.name));
    expect(BRIDGE_HANDLER_TOOL_NAMES).toEqual(BRIDGE_TOOLS.filter(tool => tool.site === 'bridge').map(tool => tool.name));
    expect(BRIDGE_TOOLS.filter(tool => tool.exposure === 'internal').some(tool => modelNames.includes(tool.name))).toBe(false);
    expect(BRIDGE_TOOLS.every(tool => tool.description.trim().length > 0)).toBe(true);
  });

  it('keeps capability authorization internal and app-side', () => {
    const tool = BRIDGE_TOOLS.find(item => item.name === 'authorize_capability');
    expect(tool).toMatchObject({ exposure: 'internal', site: 'app', timeoutMs: 600_000 });
    expect(MODEL_BRIDGE_TOOLS).not.toContainEqual(tool);
    expect(tool?.inputSchema.parse({
      capability: 'image_generate',
      estimate: {
        provider: 'Google Gemini',
        costUsdRange: { min: 0.067, max: 0.067, currency: 'USD' },
        model: 'gemini-3.1-flash-image',
        size: '1K',
        quality: 'standard',
      },
    })).toMatchObject({ estimate: { provider: 'Google Gemini' } });
  });

  it('lets the model read the editor context, fixed by default or live on request', () => {
    const tool = BRIDGE_TOOLS.find(item => item.name === 'get_editor_context');

    expect(tool).toMatchObject({ exposure: 'model', site: 'app', effect: 'read' });
    expect(tool?.requiresCapability).toBeUndefined();
    expect(tool?.inputSchema.safeParse({}).success).toBe(true);
    expect(tool?.inputSchema.safeParse({ mode: 'live' }).success).toBe(true);
    expect(tool?.inputSchema.safeParse({ mode: 'screenshot' }).success).toBe(false);
  });

  // Being in the registry does not offer a tool to an agent outside the app: that takes saying so.
  it('offers an external agent the reads and the proposals, and nothing that costs money or returns bytes', () => {
    expect(EXTERNAL_BRIDGE_TOOLS.map(tool => tool.name)).toEqual([
      'get_story_overview', 'list_scenes', 'get_scene', 'get_editor_context', 'list_story_images', 'get_image_details', 'find_asset_usage',
      'propose_scene_patch', 'propose_appearance_patch', 'propose_changeset',
    ]);
    for (const tool of EXTERNAL_BRIDGE_TOOLS) {
      expect(tool.effect, tool.name).not.toBe('cost');
      expect(tool.binaryResult, tool.name).toBeUndefined();
      expect(tool, tool.name).toMatchObject({ exposure: 'model', site: 'app' });
      // What changes the story goes past the author, always.
      if (tool.effect === 'mutation') expect(tool.awaitsAuthor, tool.name).toBe(true);
      // The facade adds these two fields; a tool that had its own would lose them.
      expect(Object.keys(tool.inputSchema.shape), tool.name).not.toEqual(expect.arrayContaining(['binding']));
      expect(Object.keys(tool.inputSchema.shape), tool.name).not.toEqual(expect.arrayContaining(['requestId']));
    }
    expect(BRIDGE_TOOLS.filter(tool => tool.external === undefined).map(tool => tool.name)).toEqual([
      'authorize_capability', 'get_image_binary', 'remove_background', 'generate_image', 'edit_image',
    ]);
  });

  it('exposes only the closed reader layout preset enum', () => {
    const tool = BRIDGE_TOOLS.find(item => item.name === 'propose_appearance_patch');
    expect(tool?.inputSchema.safeParse({
      patch: { storyId: 'story-1', expectedRevision: 'rev', layoutPreset: 'top', explanation: 'Move it' },
    }).success).toBe(true);
    expect(tool?.inputSchema.safeParse({
      patch: { storyId: 'story-1', expectedRevision: 'rev', layoutPreset: 'floating', explanation: 'Move it' },
    }).success).toBe(false);
  });
});
