/**
 * Security utilities for validating and sanitizing story data
 */

import { Story, StoryScene, Choice } from './types';

/**
 * Validation errors
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Story validator
 */
export class StoryValidator {
  /**
   * Validate imported story JSON
   */
  static validateStory(data: any): Story {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Invalid story data: must be an object');
    }

    // Required fields
    if (!data.id || typeof data.id !== 'string') {
      throw new ValidationError('Invalid or missing story ID', 'id');
    }

    if (!data.title || typeof data.title !== 'string') {
      throw new ValidationError('Invalid or missing story title', 'title');
    }

    if (!data.scenes || typeof data.scenes !== 'object') {
      throw new ValidationError('Invalid or missing scenes', 'scenes');
    }

    // Validate ID format (alphanumeric + underscore only)
    if (!/^[a-zA-Z0-9_-]+$/.test(data.id)) {
      throw new ValidationError('Story ID contains invalid characters', 'id');
    }

    // Validate title length
    if (data.title.length > 200) {
      throw new ValidationError('Story title is too long (max 200 characters)', 'title');
    }

    // Validate scenes
    const validatedScenes: Record<string, StoryScene> = {};
    for (const [sceneId, scene] of Object.entries(data.scenes)) {
      validatedScenes[sceneId] = this.validateScene(scene, sceneId);
    }

    // Validate startSceneId exists
    if (!data.startSceneId || !validatedScenes[data.startSceneId]) {
      throw new ValidationError('Invalid or missing startSceneId', 'startSceneId');
    }

    // Check for circular references in choices
    this.checkCircularReferences(validatedScenes, data.startSceneId);

    return {
      id: data.id,
      title: data.title,
      description: this.sanitizeString(data.description || ''),
      author: this.sanitizeString(data.author || 'Unknown'),
      coverImageUri: this.validateUri(data.coverImageUri),
      startSceneId: data.startSceneId,
      scenes: validatedScenes,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    };
  }

  /**
   * Validate a scene
   */
  static validateScene(data: any, sceneId: string): StoryScene {
    if (!data || typeof data !== 'object') {
      throw new ValidationError(`Invalid scene data for ${sceneId}`);
    }

    if (!data.id || typeof data.id !== 'string') {
      throw new ValidationError(`Invalid scene ID for ${sceneId}`, 'id');
    }

    if (!data.text || typeof data.text !== 'string') {
      throw new ValidationError(`Invalid or missing text for scene ${sceneId}`, 'text');
    }

    // Validate text length (prevent DoS)
    if (data.text.length > 50000) {
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
    const characters = Array.isArray(data.characters) ? data.characters : [];
    if (characters.length > 50) {
      throw new ValidationError(`Too many characters (max 50) for scene ${sceneId}`, 'characters');
    }

    return {
      id: data.id,
      text: this.sanitizeText(data.text),
      characters: characters.map((c: any) => this.sanitizeString(String(c))),
      backgroundImageUri: this.validateUri(data.backgroundImageUri),
      voiceAudioUri: this.validateUri(data.voiceAudioUri),
      musicUri: this.validateUri(data.musicUri),
      choices: validatedChoices,
      splashScreen: data.splashScreen, // TODO: Add validation for splash screen
      interactiveObjects: data.interactiveObjects, // TODO: Add validation for interactive objects
      blocks: data.blocks, // TODO: Add validation for blocks
    };
  }

  /**
   * Validate a choice
   */
  static validateChoice(data: any, sceneId: string): Choice {
    if (!data || typeof data !== 'object') {
      throw new ValidationError(`Invalid choice data for scene ${sceneId}`);
    }

    if (!data.id || typeof data.id !== 'string') {
      throw new ValidationError(`Invalid choice ID for scene ${sceneId}`, 'choice.id');
    }

    if (!data.text || typeof data.text !== 'string') {
      throw new ValidationError(`Invalid choice text for scene ${sceneId}`, 'choice.text');
    }

    if (data.text.length > 500) {
      throw new ValidationError(`Choice text is too long (max 500 characters) for scene ${sceneId}`, 'choice.text');
    }

    if (!data.targetSceneId || typeof data.targetSceneId !== 'string') {
      throw new ValidationError(`Invalid targetSceneId for choice in scene ${sceneId}`, 'choice.targetSceneId');
    }

    return {
      id: data.id,
      text: this.sanitizeText(data.text),
      targetSceneId: data.targetSceneId,
    };
  }

  /**
   * Check for circular references in scene graph
   */
  static checkCircularReferences(scenes: Record<string, StoryScene>, startSceneId: string): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (sceneId: string): boolean => {
      if (!scenes[sceneId]) {
        return false; // Dead end, not circular
      }

      if (recursionStack.has(sceneId)) {
        throw new ValidationError(`Circular reference detected at scene ${sceneId}`, 'scenes');
      }

      if (visited.has(sceneId)) {
        return false; // Already checked this path
      }

      visited.add(sceneId);
      recursionStack.add(sceneId);

      const scene = scenes[sceneId];
      for (const choice of scene.choices) {
        if (dfs(choice.targetSceneId)) {
          return true;
        }
      }

      recursionStack.delete(sceneId);
      return false;
    };

    dfs(startSceneId);
  }

  /**
   * Validate URI (prevent javascript:, data:, etc.)
   */
  static validateUri(uri: string | undefined): string | undefined {
    if (!uri) return undefined;

    const trimmed = uri.trim();

    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    const lowerUri = trimmed.toLowerCase();

    for (const protocol of dangerousProtocols) {
      if (lowerUri.startsWith(protocol)) {
        throw new ValidationError(`Dangerous URI protocol detected: ${protocol}`, 'uri');
      }
    }

    // Only allow http, https, and local file paths
    if (
      !lowerUri.startsWith('http://') &&
      !lowerUri.startsWith('https://') &&
      !lowerUri.startsWith('/') &&
      !lowerUri.startsWith('./') &&
      !lowerUri.startsWith('file://') &&
      !lowerUri.startsWith('asset://')
    ) {
      throw new ValidationError('Invalid URI format', 'uri');
    }

    return trimmed;
  }

  /**
   * Sanitize text content (remove potentially dangerous content)
   */
  static sanitizeText(text: string): string {
    if (typeof text !== 'string') return '';

    // Remove null bytes
    let sanitized = text.replace(/\0/g, '');

    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');

    return sanitized;
  }

  /**
   * Sanitize string (basic cleanup)
   */
  static sanitizeString(str: string): string {
    if (typeof str !== 'string') return '';
    return str.replace(/\0/g, '').trim();
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
