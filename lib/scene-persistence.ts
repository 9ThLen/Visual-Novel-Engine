/**
 * Scene Persistence Utilities
 * Auto-save hook, export/import for scene data
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSceneStore } from '../stores/scene-store';
import type { Scene } from './scene-types';

const AUTOSAVE_KEY = 'scene-store-autosave';
const AUTOSAVE_TIMESTAMP_KEY = 'scene-store-autosave-timestamp';

// ── Auto-save Hook ──────────────────────────────────────────────────────────

interface AutoSaveResult {
  lastSaved: Date | null;
  isSaving: boolean;
  saveNow: () => Promise<void>;
}

/**
 * Hook that auto-saves scene-store state to AsyncStorage at regular intervals.
 * Also provides a manual saveNow() function.
 */
export function useAutoSave(intervalMs: number = 30000): AutoSaveResult {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scenes = useSceneStore((s) => s.scenes);
  const activeSceneId = useSceneStore((s) => s.activeSceneId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveNow = useCallback(async () => {
    setIsSaving(true);
    try {
      const state = { scenes, activeSceneId };
      await AsyncStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
      const now = new Date();
      await AsyncStorage.setItem(AUTOSAVE_TIMESTAMP_KEY, now.toISOString());
      setLastSaved(now);
    } catch (error) {
      if (__DEV__) console.warn('[AutoSave] Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  }, [scenes, activeSceneId]);

  useEffect(() => {
    // Load last saved timestamp on mount
    AsyncStorage.getItem(AUTOSAVE_TIMESTAMP_KEY).then((iso) => {
      if (iso) {
        setLastSaved(new Date(iso));
      }
    });

    // Set up interval
    intervalRef.current = setInterval(() => {
      saveNow();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [intervalMs, saveNow]);

  return { lastSaved, isSaving, saveNow };
}

// ── Date Serialization Helpers ──────────────────────────────────────────────

/**
 * Recursively convert all Date-compatible string fields back to Date objects.
 * Handles createdAt / updatedAt at scene level.
 */
function deserializeDates(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string' && isISODateString(value) && isDateField(key)) {
      (obj as Record<string, unknown>)[key] = new Date(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      deserializeDates(value as Record<string, unknown>);
    }
  }
}

function isDateField(key: string): boolean {
  return key === 'createdAt' || key === 'updatedAt';
}

function isISODateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

// ── Export / Import Single Scene ─────────────────────────────────────────────

/**
 * Export a single scene to a JSON string.
 * Dates are serialized as ISO strings.
 */
export function exportScene(scene: Scene): string {
  return JSON.stringify(scene, null, 2);
}

/**
 * Import a single scene from a JSON string.
 * Validates structure and deserializes dates.
 * Throws Error on invalid data.
 */
export function importScene(jsonString: string): Scene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Невалідний JSON: не вдалося розібрати рядок');
  }

  validateSceneStructure(parsed);
  deserializeDates(parsed as Record<string, unknown>);
  return parsed as unknown as Scene;
}

// ── Export / Import All Scenes ───────────────────────────────────────────────

/**
 * Export an array of scenes to a JSON string.
 */
export function exportAllScenes(scenes: Scene[]): string {
  return JSON.stringify(scenes, null, 2);
}

/**
 * Import an array of scenes from a JSON string.
 * Validates each scene's structure and deserializes dates.
 * Throws Error on invalid data.
 */
export function importAllScenes(jsonString: string): Scene[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Невалідний JSON: не вдалося розібрати рядок');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Очікувався масив сцен, отримано: ' + typeof parsed);
  }

  for (let i = 0; i < parsed.length; i++) {
    try {
      validateSceneStructure(parsed[i]);
    } catch (err) {
      throw new Error(`Сцена ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
    deserializeDates(parsed[i] as Record<string, unknown>);
  }

  return parsed as Scene[];
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateSceneStructure(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    throw new Error('Дані не є обʼєктом');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new Error('Відсутнє або невалідне поле "id"');
  }

  if (typeof obj.name !== 'string') {
    throw new Error('Відсутнє або невалідне поле "name"');
  }

  if (!Array.isArray(obj.elements)) {
    throw new Error('Відсутнє або невалідне поле "elements" (має бути масивом)');
  }

  if (!Array.isArray(obj.timeline)) {
    throw new Error('Відсутнє або невалідне поле "timeline" (має бути масивом)');
  }
}
