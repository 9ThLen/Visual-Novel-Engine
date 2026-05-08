import { describe, it, expect } from 'vitest';
import {
  validateBlockData,
  dialogueSchema,
  narrationSchema,
  showCharacterSchema,
  hideCharacterSchema,
  playMusicSchema,
  choiceSchema,
  conditionSchema,
  blockSchemas,
} from '../../lib/block-schemas';

describe('block-schemas', () => {
  describe('validateBlockData', () => {
    it('should return valid true for unknown block type', () => {
      const result = validateBlockData('unknown_type', {});
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate dialogue block with valid data', () => {
      const data = { character: 'hero', text: 'Hello world' };
      const result = validateBlockData('dialogue', data);
      
      expect(result.valid).toBe(true);
    });

    it('should fail validation for dialogue with missing text', () => {
      const data = { character: 'hero' };
      const result = validateBlockData('dialogue', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('expected string, received undefined');
    });

    it('should fail validation for dialogue with empty text', () => {
      const data = { character: 'hero', text: '' };
      const result = validateBlockData('dialogue', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors![0]).toContain('Text is required');
    });

    it('should fail validation for dialogue with empty text', () => {
      const data = { character: 'hero', text: '' };
      const result = validateBlockData('dialogue', data);
      
      expect(result.valid).toBe(false);
    });

    it('should validate narration block', () => {
      const data = { text: 'Once upon a time...' };
      const result = validateBlockData('narration', data);
      
      expect(result.valid).toBe(true);
    });

    it('should validate show_character block with defaults', () => {
      const data = { characterId: 'hero' };
      const result = validateBlockData('show_character', data);
      
      expect(result.valid).toBe(true);
    });

    it('should validate show_character block with position', () => {
      const data = { characterId: 'hero', position: 'left' as const, expression: 'happy' };
      const result = validateBlockData('show_character', data);
      
      expect(result.valid).toBe(true);
    });

    it('should fail show_character with invalid position', () => {
      const data = { characterId: 'hero', position: 'invalid' as any };
      const result = validateBlockData('show_character', data);
      
      // Zod will fail on invalid enum
      expect(result.valid).toBe(false);
    });

    it('should validate play_music block with defaults', () => {
      const data = { musicUri: './music.mp3' };
      const result = validateBlockData('play_music', data);

      expect(result.valid).toBe(true);
    });

    it('should validate play_music block with custom volume', () => {
      const data = { musicUri: './music.mp3', volume: 50, loop: false };
      const result = validateBlockData('play_music', data);

      expect(result.valid).toBe(true);
    });

    it('should fail play_music with invalid volume', () => {
      const data = { musicUri: 'music.mp3', volume: 150 };
      const result = validateBlockData('play_music', data);
      
      expect(result.valid).toBe(false);
    });

    it('should validate choice block', () => {
      const data = { text: 'Go left', nextSceneId: 'scene_2' };
      const result = validateBlockData('choice', data);
      
      expect(result.valid).toBe(true);
    });

    it('should fail choice with missing nextSceneId', () => {
      const data = { text: 'Go left' };
      const result = validateBlockData('choice', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('expected string, received undefined');
    });

    it('should validate condition block', () => {
      const data = { variable: 'score', operator: 'greater_than' as const, value: '100' };
      const result = validateBlockData('condition', data);
      
      expect(result.valid).toBe(true);
    });

    it('should use default operator for condition', () => {
      const data = { variable: 'score', value: '100' };
      const result = validateBlockData('condition', data);
      
      expect(result.valid).toBe(true);
    });

    it('should validate transition block', () => {
      const data = { type: 'fade' as const, duration: 1000 };
      const result = validateBlockData('transition', data);
      
      expect(result.valid).toBe(true);
    });

    it('should validate wait block', () => {
      const data = { duration: 2000 };
      const result = validateBlockData('wait', data);
      
      expect(result.valid).toBe(true);
    });

    it('should use default duration for wait', () => {
      const data = {};
      const result = validateBlockData('wait', data);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('blockSchemas object', () => {
    it('should have schema for all block types', () => {
      expect(blockSchemas.dialogue).toBeDefined();
      expect(blockSchemas.narration).toBeDefined();
      expect(blockSchemas.show_character).toBeDefined();
      expect(blockSchemas.hide_character).toBeDefined();
      expect(blockSchemas.play_music).toBeDefined();
      expect(blockSchemas.choice).toBeDefined();
      expect(blockSchemas.condition).toBeDefined();
      expect(blockSchemas.transition).toBeDefined();
      expect(blockSchemas.wait).toBeDefined();
    });

    it('should correctly parse data with dialogueSchema directly', () => {
      const result = dialogueSchema.safeParse({ character: 'test', text: 'hi' });
      expect(result.success).toBe(true);
    });

    it('should fail with dialogueSchema on invalid data', () => {
      const result = dialogueSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
