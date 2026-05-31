import type { BlockData } from '@/lib/engine/types';
import { isBlockComplete, getBlockEmptyFields } from '@/lib/editor/block-validation';

// ── Factory helpers ─────────────────────────────────────────────────────────

const validBackground: BlockData = {
    assetId: 'bg-forest',
    transition: 'fade',
    duration: 500,
};

const invalidBackground: BlockData = {
    assetId: null,
    transition: 'fade',
    duration: 500,
};

const validCharacter: BlockData = {
    characterId: 'hero',
    spriteId: 'hero-happy',
    position: 'center',
    transition: 'fade',
    delay: 0,
    duration: null,
};

const invalidCharacter: BlockData = {
    characterId: '',
    spriteId: 'hero-happy',
    position: 'center',
    transition: 'fade',
    delay: 0,
    duration: null,
};

const validText: BlockData = {
    content: 'Once upon a time…',
    typewriterSpeed: 0.5,
    anchorTo: 'background',
};

const invalidText: BlockData = {
    content: '   ',
    typewriterSpeed: 0.5,
    anchorTo: 'background',
};

const validDialogue: BlockData = {
    entries: [
        { id: '1', characterId: 'hero', spriteId: 'hero-happy', text: 'Hello!' },
        { id: '2', characterId: 'sidekick', spriteId: 'sidekick-default', text: 'Hi!' },
    ],
    currentEntryIndex: 0,
};

const invalidDialogue: BlockData = {
    entries: [],
    currentEntryIndex: 0,
};

const partiallyEmptyDialogue: BlockData = {
    entries: [
        { id: '1', characterId: 'hero', spriteId: 'hero-happy', text: 'Hello!' },
        { id: '2', characterId: '', spriteId: '', text: '' },
    ],
    currentEntryIndex: 0,
};

const validChoice: BlockData = {
    options: [
        { id: 'c1', text: 'Go left', targetSceneId: 'scene-left' },
        { id: 'c2', text: 'Go right', targetSceneId: 'scene-right' },
    ],
};

const invalidChoice: BlockData = {
    options: [],
};

const partiallyEmptyChoice: BlockData = {
    options: [
        { id: 'c1', text: 'Go left', targetSceneId: 'scene-left' },
        { id: 'c2', text: '', targetSceneId: 'scene-right' },
    ],
};

const validMusicPlay: BlockData = {
    assetId: 'bgm-battle',
    action: 'play',
    volume: 0.8,
    loop: true,
    fadeDuration: 500,
};

const validMusicStop: BlockData = {
    assetId: null,
    action: 'stop',
    volume: 0,
    loop: false,
    fadeDuration: 0,
};

const invalidMusic: BlockData = {
    assetId: null,
    action: 'play',
    volume: 0.8,
    loop: true,
    fadeDuration: 500,
};

const validSoundPlay: BlockData = {
    assetId: 'sfx-boom',
    action: 'play',
    volume: 0.5,
    loop: false,
    pitchVariation: 0.1,
};

const validSoundStop: BlockData = {
    assetId: null,
    action: 'stop',
    volume: 0,
    loop: false,
    pitchVariation: 0,
};

const invalidSound: BlockData = {
    assetId: null,
    action: 'play',
    volume: 0.5,
    loop: false,
    pitchVariation: 0.1,
};

const validVariable: BlockData = {
    variableName: 'health',
    operation: 'set',
    value: 100,
};

const invalidVariable: BlockData = {
    variableName: '',
    operation: 'set',
    value: 100,
};

const validInteractiveObject: BlockData = {
    objectId: 'door-01',
    name: 'Mysterious Door',
    assetId: 'door-front',
    position: { x: 50, y: 30, width: 10, height: 20 },
    actions: [],
    oneTimeOnly: false,
    pulseAnimation: false,
};

const invalidInteractiveObject: BlockData = {
    objectId: 'door-01',
    name: '',
    assetId: 'door-front',
    position: { x: 50, y: 30, width: 10, height: 20 },
    actions: [],
    oneTimeOnly: false,
    pulseAnimation: false,
};

const validEffect: BlockData = {
    effectType: 'shake',
    target: 'screen',
    intensity: 50,
    duration: 1,
};

const validCamera: BlockData = {
    action: 'zoom',
    zoomLevel: 1.5,
    duration: 2,
    easing: 'ease-in-out',
};

const validTransition: BlockData = {
    targetSceneId: 'scene-2',
    transitionType: 'fade',
    duration: 1,
};

// ── isBlockComplete ─────────────────────────────────────────────────────────

describe('isBlockComplete', () => {
    it('returns true for valid background', () => {
        expect(isBlockComplete('background', validBackground)).toBe(true);
    });

    it('returns false for background without assetId', () => {
        expect(isBlockComplete('background', invalidBackground)).toBe(false);
    });

    it('returns true for valid character', () => {
        expect(isBlockComplete('character', validCharacter)).toBe(true);
    });

    it('returns false for character without characterId', () => {
        expect(isBlockComplete('character', invalidCharacter)).toBe(false);
    });

    it('returns true for text with non-empty content', () => {
        expect(isBlockComplete('text', validText)).toBe(true);
    });

    it('returns false for text with only whitespace', () => {
        expect(isBlockComplete('text', invalidText)).toBe(false);
    });

    it('returns true for dialogue with entries', () => {
        expect(isBlockComplete('dialogue', validDialogue)).toBe(true);
    });

    it('returns false for dialogue with no entries', () => {
        expect(isBlockComplete('dialogue', invalidDialogue)).toBe(false);
    });

    it('returns true for choice with options', () => {
        expect(isBlockComplete('choice', validChoice)).toBe(true);
    });

    it('returns false for choice with no options', () => {
        expect(isBlockComplete('choice', invalidChoice)).toBe(false);
    });

    it('returns true for music with action=stop (no assetId needed)', () => {
        expect(isBlockComplete('music', validMusicStop)).toBe(true);
    });

    it('returns true for music with assetId', () => {
        expect(isBlockComplete('music', validMusicPlay)).toBe(true);
    });

    it('returns false for music play without assetId', () => {
        expect(isBlockComplete('music', invalidMusic)).toBe(false);
    });

    it('returns true for sound with action=stop (no assetId needed)', () => {
        expect(isBlockComplete('sound', validSoundStop)).toBe(true);
    });

    it('returns true for sound with assetId', () => {
        expect(isBlockComplete('sound', validSoundPlay)).toBe(true);
    });

    it('returns false for sound play without assetId', () => {
        expect(isBlockComplete('sound', invalidSound)).toBe(false);
    });

    it('returns true for variable with variableName', () => {
        expect(isBlockComplete('variable', validVariable)).toBe(true);
    });

    it('returns false for variable without variableName', () => {
        expect(isBlockComplete('variable', invalidVariable)).toBe(false);
    });

    it('returns true for interactive_object with name', () => {
        expect(isBlockComplete('interactive_object', validInteractiveObject)).toBe(true);
    });

    it('returns false for interactive_object without name', () => {
        expect(isBlockComplete('interactive_object', invalidInteractiveObject)).toBe(false);
    });

    it('returns true for effect (no required fields)', () => {
        expect(isBlockComplete('effect', validEffect)).toBe(true);
    });

    it('returns true for camera (no required fields)', () => {
        expect(isBlockComplete('camera', validCamera)).toBe(true);
    });

    it('returns true for transition (no required fields)', () => {
        expect(isBlockComplete('transition', validTransition)).toBe(true);
    });
});

// ── getBlockEmptyFields ─────────────────────────────────────────────────────

describe('getBlockEmptyFields', () => {
    it('returns empty array for valid background', () => {
        expect(getBlockEmptyFields('background', validBackground)).toEqual([]);
    });

    it('returns ["Asset"] for background without assetId', () => {
        expect(getBlockEmptyFields('background', invalidBackground)).toEqual(['Asset']);
    });

    it('returns empty array for valid character', () => {
        expect(getBlockEmptyFields('character', validCharacter)).toEqual([]);
    });

    it('returns ["Character"] for character without characterId', () => {
        expect(getBlockEmptyFields('character', invalidCharacter)).toEqual(['Character']);
    });

    it('returns empty array for text with content', () => {
        expect(getBlockEmptyFields('text', validText)).toEqual([]);
    });

    it('returns ["Content"] for text with whitespace only', () => {
        expect(getBlockEmptyFields('text', invalidText)).toEqual(['Content']);
    });

    it('returns empty array for valid dialogue', () => {
        expect(getBlockEmptyFields('dialogue', validDialogue)).toEqual([]);
    });

    it('returns ["Speaker"] for dialogue with no entries', () => {
        expect(getBlockEmptyFields('dialogue', invalidDialogue)).toEqual(['Speaker']);
    });

    it('returns ["Speaker 2"] for dialogue with partially empty entry', () => {
        expect(getBlockEmptyFields('dialogue', partiallyEmptyDialogue)).toEqual(['Speaker 2']);
    });

    it('returns empty array for valid choice', () => {
        expect(getBlockEmptyFields('choice', validChoice)).toEqual([]);
    });

    it('returns ["Choices"] for choice with no options', () => {
        expect(getBlockEmptyFields('choice', invalidChoice)).toEqual(['Choices']);
    });

    it('returns ["Choice 2"] for choice with partially empty option', () => {
        expect(getBlockEmptyFields('choice', partiallyEmptyChoice)).toEqual(['Choice 2']);
    });

    it('returns empty array for music stop without assetId', () => {
        expect(getBlockEmptyFields('music', validMusicStop)).toEqual([]);
    });

    it('returns empty array for music with assetId', () => {
        expect(getBlockEmptyFields('music', validMusicPlay)).toEqual([]);
    });

    it('returns ["Asset"] for music play without assetId', () => {
        expect(getBlockEmptyFields('music', invalidMusic)).toEqual(['Asset']);
    });

    it('returns empty array for sound stop without assetId', () => {
        expect(getBlockEmptyFields('sound', validSoundStop)).toEqual([]);
    });

    it('returns empty array for sound with assetId', () => {
        expect(getBlockEmptyFields('sound', validSoundPlay)).toEqual([]);
    });

    it('returns ["Asset"] for sound play without assetId', () => {
        expect(getBlockEmptyFields('sound', invalidSound)).toEqual(['Asset']);
    });

    it('returns empty array for variable with variableName', () => {
        expect(getBlockEmptyFields('variable', validVariable)).toEqual([]);
    });

    it('returns ["Variable Name"] for variable without variableName', () => {
        expect(getBlockEmptyFields('variable', invalidVariable)).toEqual(['Variable Name']);
    });

    it('returns empty array for interactive_object with name', () => {
        expect(getBlockEmptyFields('interactive_object', validInteractiveObject)).toEqual([]);
    });

    it('returns ["Object Name"] for interactive_object without name', () => {
        expect(getBlockEmptyFields('interactive_object', invalidInteractiveObject)).toEqual(['Object Name']);
    });

    it('returns empty array for effect (no required fields)', () => {
        expect(getBlockEmptyFields('effect', validEffect)).toEqual([]);
    });

    it('returns empty array for camera (no required fields)', () => {
        expect(getBlockEmptyFields('camera', validCamera)).toEqual([]);
    });

    it('returns empty array for transition (no required fields)', () => {
        expect(getBlockEmptyFields('transition', validTransition)).toEqual([]);
    });
});