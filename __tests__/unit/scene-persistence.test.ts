import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

// Mock zustand store
vi.mock('@/stores/scene-store', () => ({
  useSceneStore: vi.fn((selector) => {
    const state = {
      scenes: [
        {
          id: 'test-scene-1',
          name: 'Test Scene',
          elements: [],
          timeline: [],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      activeSceneId: 'test-scene-1',
    };
    return selector(state);
  }),
}));

// Mock React hooks
vi.mock('react', () => ({
  useState: vi.fn((initial) => [initial, vi.fn()]),
  useEffect: vi.fn((cb) => cb()),
  useRef: vi.fn(() => ({ current: null })),
  useCallback: vi.fn((cb) => cb),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  exportScene,
  importScene,
  exportAllScenes,
  importAllScenes,
  useAutoSave,
} from '@/lib/scene-persistence';
import type { Scene } from '@/lib/scene-types';

const mockAsyncStorage = AsyncStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

function createTestScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    name: 'Test Scene',
    elements: [],
    timeline: [],
    createdAt: new Date('2026-05-08T12:00:00.000Z'),
    updatedAt: new Date('2026-05-08T12:00:00.000Z'),
    ...overrides,
  };
}

// ── Export / Import Single Scene ─────────────────────────────────────────

describe('exportScene', () => {
  it('exports a scene to JSON string', () => {
    const scene = createTestScene();
    const json = exportScene(scene);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe('scene-1');
    expect(parsed.name).toBe('Test Scene');
  });

  it('produces pretty-printed JSON', () => {
    const scene = createTestScene();
    const json = exportScene(scene);
    // Pretty-printed JSON has newlines and indentation
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  it('serializes dates as ISO strings', () => {
    const scene = createTestScene();
    const json = exportScene(scene);
    expect(json).toContain('2026-05-08T12:00:00.000Z');
  });
});

describe('importScene', () => {
  it('imports a valid scene JSON', () => {
    const scene = createTestScene();
    const json = exportScene(scene);
    const imported = importScene(json);
    expect(imported.id).toBe('scene-1');
    expect(imported.name).toBe('Test Scene');
  });

  it('deserializes dates back to Date objects', () => {
    const scene = createTestScene();
    const json = exportScene(scene);
    const imported = importScene(json);
    expect(imported.createdAt).toBeInstanceOf(Date);
    expect(imported.updatedAt).toBeInstanceOf(Date);
  });

  it('throws on invalid JSON', () => {
    expect(() => importScene('not json')).toThrow('Невалідний JSON');
  });

  it('throws on missing id', () => {
    const badScene = { name: 'No ID', elements: [], timeline: [] };
    expect(() => importScene(JSON.stringify(badScene))).toThrow('id');
  });

  it('throws on missing name', () => {
    const badScene = { id: 'x', elements: [], timeline: [] };
    expect(() => importScene(JSON.stringify(badScene))).toThrow('name');
  });

  it('throws on missing elements array', () => {
    const badScene = { id: 'x', name: 'n', timeline: [] };
    expect(() => importScene(JSON.stringify(badScene))).toThrow('elements');
  });

  it('throws on missing timeline array', () => {
    const badScene = { id: 'x', name: 'n', elements: [] };
    expect(() => importScene(JSON.stringify(badScene))).toThrow('timeline');
  });

  it('throws on non-object input', () => {
    expect(() => importScene('42')).toThrow();
  });
});

// ── Export / Import All Scenes ───────────────────────────────────────────

describe('exportAllScenes', () => {
  it('exports array of scenes to JSON', () => {
    const scenes = [createTestScene({ id: 'a' }), createTestScene({ id: 'b' })];
    const json = exportAllScenes(scenes);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('a');
    expect(parsed[1].id).toBe('b');
  });

  it('handles empty array', () => {
    const json = exportAllScenes([]);
    expect(JSON.parse(json)).toEqual([]);
  });
});

describe('importAllScenes', () => {
  it('imports array of scenes', () => {
    const scenes = [createTestScene({ id: 'a' }), createTestScene({ id: 'b' })];
    const json = exportAllScenes(scenes);
    const imported = importAllScenes(json);
    expect(imported).toHaveLength(2);
    expect(imported[0].id).toBe('a');
    expect(imported[1].id).toBe('b');
  });

  it('deserializes dates for all scenes', () => {
    const scenes = [createTestScene()];
    const json = exportAllScenes(scenes);
    const imported = importAllScenes(json);
    expect(imported[0].createdAt).toBeInstanceOf(Date);
  });

  it('throws on invalid JSON', () => {
    expect(() => importAllScenes('not json')).toThrow('Невалідний JSON');
  });

  it('throws when input is not an array', () => {
    expect(() => importAllScenes('"hello"')).toThrow('масив');
  });

  it('throws with scene index on invalid scene in array', () => {
    const badScenes = [{ bad: 'data' }];
    expect(() => importAllScenes(JSON.stringify(badScenes))).toThrow('Сцена 0');
  });
});

// ── Auto-save Hook ───────────────────────────────────────────────────────

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('returns initial state with null lastSaved', () => {
    const result = useAutoSave(30000);
    expect(result.lastSaved).toBeNull();
    expect(result.isSaving).toBe(false);
    expect(typeof result.saveNow).toBe('function');
  });

  it('provides saveNow function', () => {
    const result = useAutoSave(30000);
    expect(typeof result.saveNow).toBe('function');
  });

  it('saveNow calls AsyncStorage.setItem', async () => {
    const result = useAutoSave(30000);
    await result.saveNow();
    expect(mockAsyncStorage.setItem).toHaveBeenCalled();
  });
});
