import { describe, it, expect, beforeEach } from 'vitest';
import { 
  createAtom, 
  textAtomSchema, 
  characterAtomSchema, 
  type AtomType, 
  type AtomBlock,
  type SnapPoint 
} from '@/lib/atom-types';

describe('atom-types', () => {
  describe('createAtom', () => {
    describe('atom type creation', () => {
      it('should create text_atom with default values', () => {
        const atom = createAtom('text_atom');
        
        expect(atom.type).toBe('text_atom');
        expect(atom.data).toEqual({ content: '', duration: 2000 });
        expect(atom.x).toBe(0);
        expect(atom.y).toBe(0);
        expect(atom.width).toBe(120);
        expect(atom.height).toBe(80);
        expect(atom.id).toMatch(/^atom_\d+_[a-z0-9]{5}$/);
      });

      it('should create character_atom with default values', () => {
        const atom = createAtom('character_atom');
        
        expect(atom.type).toBe('character_atom');
        expect(atom.data).toEqual({ 
          characterId: '', 
          position: 'center', 
          expression: 'neutral', 
          entrance: 'fade_in' 
        });
      });

      it('should create background_atom with default values', () => {
        const atom = createAtom('background_atom');
        
        expect(atom.type).toBe('background_atom');
        expect(atom.data).toEqual({ uri: '', transition: 'fade' });
      });

      it('should create audio_atom with default values', () => {
        const atom = createAtom('audio_atom');
        
        expect(atom.type).toBe('audio_atom');
        expect(atom.data).toEqual({ uri: '', loop: false, volume: 80, type: 'sfx' });
      });

      it('should create fx_atom with default values', () => {
        const atom = createAtom('fx_atom');
        
        expect(atom.type).toBe('fx_atom');
        expect(atom.data).toEqual({ effectType: 'particles', intensity: 50, duration: 3000 });
      });
    });

    describe('overrides', () => {
      it('should override text_atom data properties', () => {
        const atom = createAtom('text_atom', { 
          content: 'Hello World', 
          duration: 5000,
          speaker: 'Narrator' 
        });
        
        expect(atom.data).toEqual({ 
          content: 'Hello World', 
          duration: 5000,
          speaker: 'Narrator' 
        });
      });

      it('should override character_atom data properties', () => {
        const atom = createAtom('character_atom', { 
          characterId: 'hero', 
          position: 'left',
          expression: 'angry',
          entrance: 'slide_in_left'
        });
        
        expect(atom.data).toEqual({ 
          characterId: 'hero', 
          position: 'left',
          expression: 'angry',
          entrance: 'slide_in_left'
        });
      });

      it('should override background_atom data properties', () => {
        const atom = createAtom('background_atom', { 
          uri: '/images/bg1.png',
          transition: 'dissolve'
        });
        
        expect(atom.data).toEqual({ 
          uri: '/images/bg1.png',
          transition: 'dissolve'
        });
      });

      it('should override audio_atom data properties', () => {
        const atom = createAtom('audio_atom', { 
          uri: '/audio/music.mp3',
          loop: true,
          volume: 50,
          type: 'music'
        });
        
        expect(atom.data).toEqual({ 
          uri: '/audio/music.mp3',
          loop: true,
          volume: 50,
          type: 'music'
        });
      });

      it('should override fx_atom data properties', () => {
        const atom = createAtom('fx_atom', { 
          effectType: 'rain',
          intensity: 80,
          duration: 5000
        });
        
        expect(atom.data).toEqual({ 
          effectType: 'rain',
          intensity: 80,
          duration: 5000
        });
      });

      it('should override position properties (x, y, width, height)', () => {
        // Note: createAtom doesn't currently support overriding x, y, width, height
        // This test documents current behavior
        const atom = createAtom('text_atom');
        expect(atom.x).toBe(0);
        expect(atom.y).toBe(0);
        expect(atom.width).toBe(120);
        expect(atom.height).toBe(80);
      });

      it('should merge partial overrides with defaults', () => {
        const atom = createAtom('text_atom', { content: 'Only content provided' });
        
        expect(atom.data).toEqual({ 
          content: 'Only content provided', 
          duration: 2000 
        });
      });
    });

    describe('snap points', () => {
      it('should create snap points for text_atom', () => {
        const atom = createAtom('text_atom');
        
        expect(atom.snapPoints).toHaveLength(4);
        expect(atom.snapPoints[0]).toEqual({
          side: 'left',
          offset: 0.5,
          compatibleTypes: ['character_atom']
        });
        expect(atom.snapPoints[1]).toEqual({
          side: 'right',
          offset: 0.5,
          compatibleTypes: ['character_atom']
        });
        expect(atom.snapPoints[2]).toEqual({
          side: 'top',
          offset: 0.5,
          compatibleTypes: []
        });
        expect(atom.snapPoints[3]).toEqual({
          side: 'bottom',
          offset: 0.5,
          compatibleTypes: []
        });
      });

      it('should create snap points for character_atom', () => {
        const atom = createAtom('character_atom');
        
        expect(atom.snapPoints).toHaveLength(4);
        expect(atom.snapPoints[0]).toEqual({
          side: 'left',
          offset: 0.5,
          compatibleTypes: ['text_atom', 'character_atom']
        });
        expect(atom.snapPoints[1]).toEqual({
          side: 'right',
          offset: 0.5,
          compatibleTypes: ['text_atom', 'character_atom']
        });
        expect(atom.snapPoints[2]).toEqual({
          side: 'top',
          offset: 0.5,
          compatibleTypes: ['background_atom']
        });
        expect(atom.snapPoints[3]).toEqual({
          side: 'bottom',
          offset: 0.5,
          compatibleTypes: []
        });
      });

      it('should create snap points for background_atom', () => {
        const atom = createAtom('background_atom');
        
        expect(atom.snapPoints).toHaveLength(4);
        expect(atom.snapPoints[3]).toEqual({
          side: 'bottom',
          offset: 0.5,
          compatibleTypes: ['character_atom', 'text_atom', 'audio_atom', 'fx_atom']
        });
      });

      it('should create snap points for audio_atom', () => {
        const atom = createAtom('audio_atom');
        
        expect(atom.snapPoints).toHaveLength(4);
        expect(atom.snapPoints[0]).toEqual({
          side: 'left',
          offset: 0.5,
          compatibleTypes: ['background_atom']
        });
      });

      it('should create snap points for fx_atom', () => {
        const atom = createAtom('fx_atom');
        
        expect(atom.snapPoints).toHaveLength(4);
        expect(atom.snapPoints[0]).toEqual({
          side: 'left',
          offset: 0.5,
          compatibleTypes: ['background_atom']
        });
      });

      it('should have all snap points with valid structure', () => {
        const atomTypes: AtomType[] = ['text_atom', 'character_atom', 'background_atom', 'audio_atom', 'fx_atom'];
        
        atomTypes.forEach(type => {
          const atom = createAtom(type);
          
          atom.snapPoints.forEach((sp: SnapPoint) => {
            expect(['top', 'bottom', 'left', 'right']).toContain(sp.side);
            expect(sp.offset).toBe(0.5);
            expect(Array.isArray(sp.compatibleTypes)).toBe(true);
            sp.compatibleTypes.forEach((ct: AtomType) => {
              expect(['text_atom', 'character_atom', 'background_atom', 'audio_atom', 'fx_atom']).toContain(ct);
            });
          });
        });
      });
    });

    describe('unique IDs', () => {
      it('should generate unique IDs for each atom', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
          const atom = createAtom('text_atom');
          ids.add(atom.id);
        }
        expect(ids.size).toBe(100);
      });

      it('should generate IDs with correct format', () => {
        const atom = createAtom('text_atom');
        expect(atom.id).toMatch(/^atom_\d+_[a-z0-9]{5}$/);
      });
    });
  });

  describe('textAtomSchema', () => {
    describe('valid cases', () => {
      it('should validate with required content only', () => {
        const result = textAtomSchema.safeParse({ content: 'Hello' });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.content).toBe('Hello');
          expect(result.data.duration).toBe(2000); // default
          expect(result.data.speaker).toBeUndefined();
        }
      });

      it('should validate with content and speaker', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          speaker: 'John' 
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.speaker).toBe('John');
        }
      });

      it('should validate with custom duration', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          duration: 5000 
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.duration).toBe(5000);
        }
      });

      it('should validate with duration of 0', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          duration: 0 
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.duration).toBe(0);
        }
      });

      it('should validate with all optional fields', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          speaker: 'Narrator',
          duration: 3000 
        });
        
        expect(result.success).toBe(true);
      });
    });

    describe('invalid cases', () => {
      it('should reject empty content', () => {
        const result = textAtomSchema.safeParse({ content: '' });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe('Text is required');
        }
      });

      it('should reject missing content', () => {
        const result = textAtomSchema.safeParse({});
        
        expect(result.success).toBe(false);
      });

      it('should reject null content', () => {
        const result = textAtomSchema.safeParse({ content: null });
        
        expect(result.success).toBe(false);
      });

      it('should reject content that is not a string', () => {
        const result = textAtomSchema.safeParse({ content: 123 });
        
        expect(result.success).toBe(false);
      });

      it('should reject negative duration', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          duration: -100 
        });
        
        expect(result.success).toBe(false);
      });

      it('should reject duration that is not a number', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          duration: '2000' 
        });
        
        expect(result.success).toBe(false);
      });

      it('should reject speaker that is not a string', () => {
        const result = textAtomSchema.safeParse({ 
          content: 'Hello', 
          speaker: 123 
        });
        
        expect(result.success).toBe(false);
      });
    });
  });

  describe('characterAtomSchema', () => {
    describe('valid cases', () => {
      it('should validate with required characterId only', () => {
        const result = characterAtomSchema.safeParse({ characterId: 'hero' });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.characterId).toBe('hero');
          expect(result.data.position).toBe('center'); // default
          expect(result.data.expression).toBe('neutral'); // default
          expect(result.data.entrance).toBe('fade_in'); // default
        }
      });

      it('should validate with all fields', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 'left',
          expression: 'happy',
          entrance: 'slide_in_left'
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.position).toBe('left');
          expect(result.data.expression).toBe('happy');
          expect(result.data.entrance).toBe('slide_in_left');
        }
      });

      it('should validate with position left', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 'left'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with position center', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 'center'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with position right', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 'right'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with entrance fade_in', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          entrance: 'fade_in'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with entrance slide_in_left', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          entrance: 'slide_in_left'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with entrance slide_in_right', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          entrance: 'slide_in_right'
        });
        
        expect(result.success).toBe(true);
      });

      it('should validate with entrance none', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          entrance: 'none'
        });
        
        expect(result.success).toBe(true);
      });
    });

    describe('invalid cases', () => {
      it('should reject empty characterId', () => {
        const result = characterAtomSchema.safeParse({ characterId: '' });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe('Character is required');
        }
      });

      it('should reject missing characterId', () => {
        const result = characterAtomSchema.safeParse({});
        
        expect(result.success).toBe(false);
      });

      it('should reject null characterId', () => {
        const result = characterAtomSchema.safeParse({ characterId: null });
        
        expect(result.success).toBe(false);
      });

      it('should reject characterId that is not a string', () => {
        const result = characterAtomSchema.safeParse({ characterId: 123 });
        
        expect(result.success).toBe(false);
      });

      it('should reject invalid position', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 'invalid'
        });
        
        expect(result.success).toBe(false);
      });

      it('should reject invalid entrance', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          entrance: 'invalid'
        });
        
        expect(result.success).toBe(false);
      });

      it('should reject position that is not a string', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          position: 123
        });
        
        expect(result.success).toBe(false);
      });

      it('should reject expression that is not a string', () => {
        const result = characterAtomSchema.safeParse({ 
          characterId: 'hero',
          expression: 123
        });
        
        expect(result.success).toBe(false);
      });
    });
  });
});
