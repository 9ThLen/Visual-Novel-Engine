// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_BRIDGE_TOOL_NAMES, BRIDGE_HANDLER_TOOL_NAMES, BRIDGE_TOOLS, MODEL_BRIDGE_TOOLS } from '../../lib/ai/bridge-tools';

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
