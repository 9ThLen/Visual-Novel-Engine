/**
 * Security utilities for validating and sanitizing story data
 */

import type { Story, StoryScene, Choice } from '@/lib/scene-operations';
import type { CharacterPosition, CharacterSprite } from './character-types';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '@/lib/error-handler';
import { Platform } from 'react-native';

/**
 * Unified URI safety check.
 * Returns true for safe URIs, false for dangerous/invalid ones.
 * Accepts http:, https:, file:, asset:, relative paths;
 * rejects javascript:, data:, vbscript: protocols.
 * Also rejects path traversal sequences.
 */
export function isSafeUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (!trimmed) return false;
  if (trimmed.includes('..')) return false;
  if (trimmed.includes('\0')) return false;
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  const lowerUri = trimmed.toLowerCase();
  for (const protocol of dangerousProtocols) {
    if (lowerUri.startsWith(protocol)) return false;
  }
  // file:// is allowed ONLY on native platforms (Expo FileSystem compatibility).
  // Web blocks file:// via the Platform.OS !== 'web' gate to prevent XSS / SSRF
  // via local file URIs in the web bundle.
  const allowedPrefixes = ['http://', 'https://', '/', './', 'asset://', 'assets/', 'blob:'];
  if (Platform.OS !== 'web') {
    allowedPrefixes.push('file://');
  }
  const isAllowed = allowedPrefixes.some((p) => lowerUri.startsWith(p));
  if (!isAllowed) return false;
  return true;
}

/**
 * Validation errors
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const SAFE_CHARACTER_POSITIONS = new Set<CharacterPosition>([
  'left',
  'center',
  'right',
  'far-left',
  'far-right',
]);

function validateCharacterPosition(value: unknown): CharacterPosition | undefined {
  return typeof value === 'string' && SAFE_CHARACTER_POSITIONS.has(value as CharacterPosition)
    ? value as CharacterPosition
    : undefined;
}

function validateCharacterScale(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 3
    ? value
    : undefined;
}

/**
 * Story validator
 */
export class StoryValidator {
  /**
   * Validate imported legacy story JSON.
   *
   * @deprecated Returns the legacy Story shape. Use importStory() for canonical SceneRecord output.
   */
  static validateStory(data: unknown): Story {
    if (!isRecord(data)) {
      throw new ValidationError('Invalid story data: must be an object');
    }

    // Required fields
    const storyId = data.id;
    const title = data.title;
    const startSceneId = data.startSceneId;

    if (!storyId || typeof storyId !== 'string') {
      throw new ValidationError('Invalid or missing story ID', 'id');
    }

    if (!title || typeof title !== 'string') {
      throw new ValidationError('Invalid or missing story title', 'title');
    }

    if (!isRecord(data.scenes)) {
      throw new ValidationError('Invalid or missing scenes', 'scenes');
    }

    // Validate ID format (alphanumeric + underscore only)
    if (!/^[a-zA-Z0-9_-]+$/.test(storyId)) {
      throw new ValidationError('Story ID contains invalid characters', 'id');
    }

    // Validate title length
    if (title.length > 200) {
      throw new ValidationError('Story title is too long (max 200 characters)', 'title');
    }

    // Validate scenes
    const validatedScenes: Record<string, StoryScene> = {};
    for (const [sceneId, scene] of Object.entries(data.scenes)) {
      validatedScenes[sceneId] = this.validateScene(scene, sceneId);
    }

    // Validate startSceneId exists
    if (!startSceneId || typeof startSceneId !== 'string' || !validatedScenes[startSceneId]) {
      throw new ValidationError('Invalid or missing startSceneId', 'startSceneId');
    }

    // Check for circular references in choices
    this.checkCircularReferences(validatedScenes, startSceneId);

    return {
      id: storyId,
      title,
      description: this.sanitizeString(typeof data.description === 'string' ? data.description : ''),
      author: this.sanitizeString(typeof data.author === 'string' ? data.author : 'Unknown'),
      thumbnailUri: this.validateUri(
        typeof data.thumbnailUri === 'string'
          ? data.thumbnailUri
          : typeof data.coverImageUri === 'string'
            ? data.coverImageUri
            : undefined,
      ),
      startSceneId,
      scenes: validatedScenes,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    };
  }

  /**
   * Validate a legacy scene.
   *
   * @deprecated Returns StoryScene. Canonical code should validate/import through importStory().
   */
  static validateScene(data: unknown, sceneId: string): StoryScene {
    if (!isRecord(data)) {
      throw new ValidationError(`Invalid scene data for ${sceneId}`);
    }

    const id = data.id;
    const text = data.text;

    if (!id || typeof id !== 'string') {
      throw new ValidationError(`Invalid scene ID for ${sceneId}`, 'id');
    }

    if (!text || typeof text !== 'string') {
      throw new ValidationError(`Invalid or missing text for scene ${sceneId}`, 'text');
    }

    // Validate text length (prevent DoS)
    if (text.length > 50000) {
      throw new ValidationError(`Scene text is too long (max 50000 characters) for ${sceneId}`, 'text');
    }

    // Validate choices
    const validatedChoices: Choice[] = [];
    if (data.choices && Array.isArray(data.choices)) {
      if (data.choices.length > 20) {
        throw new ValidationError(`Too many choices (max 20) for scene ${sceneId}`, 'choices');
      }

      for (const choice of data.choices) {
        validatedChoices.push(this.validateChoice(choice, sceneId));
      }
    }

    // Validate characters array
    const rawCharacters = Array.isArray(data.characters) ? data.characters : [];
    if (rawCharacters.length > 50) {
      throw new ValidationError(`Too many characters (max 50) for scene ${sceneId}`, 'characters');
    }
    const characters: CharacterSprite[] = rawCharacters.map((c: unknown) => {
      if (isRecord(c) && c.id && typeof c.uri === 'string') {
        const position = validateCharacterPosition(c.position);
        const scale = validateCharacterScale(c.scale);
        const expression = typeof c.expression === 'string'
          ? this.sanitizeString(c.expression)
          : undefined;

        return {
          id: this.sanitizeString(String(c.id)),
          name: c.name ? this.sanitizeString(String(c.name)) : this.sanitizeString(String(c.id)),
          uri: this.validateUri(c.uri) || '',
          createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
          ...(position ? { position } : {}),
          ...(scale ? { scale } : {}),
          ...(expression ? { expression } : {}),
        };
      }
      const str = this.sanitizeString(String(c));
      return {
        id: str || `char_${Date.now()}`,
        name: str || 'Unknown',
        uri: '',
        createdAt: Date.now(),
      };
    });

    return {
      id,
      text: this.sanitizeText(text),
      characters,
      backgroundImageUri: this.validateUri(typeof data.backgroundImageUri === 'string' ? data.backgroundImageUri : undefined),
      voiceAudioUri: this.validateUri(typeof data.voiceAudioUri === 'string' ? data.voiceAudioUri : undefined),
      musicUri: this.validateUri(typeof data.musicUri === 'string' ? data.musicUri : undefined),
      choices: validatedChoices,
      splashScreen: isRecord(data.splashScreen) ? data.splashScreen as StoryScene['splashScreen'] : undefined,
      interactiveObjects: Array.isArray(data.interactiveObjects) ? data.interactiveObjects as StoryScene['interactiveObjects'] : [],
      blocks: Array.isArray(data.blocks) ? data.blocks as StoryScene['blocks'] : undefined,
    };
  }

  /**
   * Validate a choice
   */
  static validateChoice(data: unknown, sceneId: string): Choice {
    if (!isRecord(data)) {
      throw new ValidationError(`Invalid choice data for scene ${sceneId}`);
    }

    const id = data.id;
    const text = data.text;
    const nextSceneId = data.targetSceneId || data.nextSceneId;

    if (!id || typeof id !== 'string') {
      throw new ValidationError(`Invalid choice ID for scene ${sceneId}`, 'choice.id');
    }

    if (!text || typeof text !== 'string') {
      throw new ValidationError(`Invalid choice text for scene ${sceneId}`, 'choice.text');
    }

    if (text.length > 500) {
      throw new ValidationError(`Choice text is too long (max 500 characters) for scene ${sceneId}`, 'choice.text');
    }

    if (!nextSceneId || typeof nextSceneId !== 'string') {
      throw new ValidationError(`Invalid targetSceneId for choice in scene ${sceneId}`, 'choice.targetSceneId');
    }

    return {
      id,
      text: this.sanitizeText(text),
      nextSceneId,
    };
  }

  /**
   * Check for direct self-loops in scene graph (choice pointing to its own scene)
   * Full-cycle detection is intentionally skipped — branching narratives commonly
   * have convergent paths and "return to hub" patterns that are not bugs.
   */
  static checkCircularReferences(scenes: Record<string, StoryScene>, startSceneId: string): void {
    for (const [sceneId, scene] of Object.entries(scenes)) {
      for (const choice of scene.choices) {
        if (choice.nextSceneId === sceneId) {
          throw new ValidationError(`Direct self-loop detected at scene ${sceneId}`, 'scenes');
        }
      }
    }
  }

  /**
   * Validate URI (prevent javascript:, data:, etc.)
   */
  static validateUri(uri: string | undefined): string | undefined {
    if (!uri) return undefined;
    const trimmed = uri.trim();
    if (!isSafeUri(trimmed)) {
      throw new ValidationError('Unsafe or invalid URI', 'uri');
    }
    return trimmed;
  }

  /**
   * Sanitize text content (remove potentially dangerous content)
   */
  static sanitizeText(text: string): string {
    if (typeof text !== 'string') return '';

    let sanitized = text.replace(/\0/g, '');

    // Remove all HTML tags (not just script)
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: and data: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:\s*text\/html/gi, '');

    return sanitized;
  }

  /**
   * Sanitize string (basic cleanup)
   */
  static sanitizeString(str: string): string {
    if (typeof str !== 'string') return '';
    const cleaned = str.replace(/\0/g, '').replace(/[\x00-\x1f\x7f]/g, '');
    return cleaned.trim().slice(0, 5000);
  }
}

/**
 * Validate and sanitize imported story
 */
export function validateImportedStory(jsonString: string): Story {
  try {
    const data = JSON.parse(jsonString);
    return StoryValidator.validateStory(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('Invalid JSON format');
    }
    throw error;
  }
}
