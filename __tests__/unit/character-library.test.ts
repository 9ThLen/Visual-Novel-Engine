import { describe, it, expect, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCharacterLibrary,
  saveCharacterLibrary,
  addCharacter,
  updateCharacter,
  deleteCharacter,
  addSpriteToCharacter,
  searchCharacters,
  getCharacter,
} from '@/lib/character-library';
import type { Character } from '@/lib/character-types';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockAsyncStorage = AsyncStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

const STORAGE_PREFIX = 'character_library_';

describe('CharacterLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCharacterLibrary', () => {
    it('should return empty array when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await getCharacterLibrary('story1');

      expect(result).toEqual([]);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(`${STORAGE_PREFIX}story1`);
    });

    it('should return parsed characters from storage', async () => {
      const characters: Character[] = [
        {
          id: 'char1',
          name: 'Hero',
          sprites: [],
          createdAt: 1000,
        },
      ];
      const library = { characters };
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(library));

      const result = await getCharacterLibrary('story1');

      expect(result).toEqual(characters);
    });

    it('should return empty array on storage error', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await getCharacterLibrary('story1');

      expect(result).toEqual([]);
    });
  });

  describe('saveCharacterLibrary', () => {
    it('should save characters to storage', async () => {
      const characters: Character[] = [
        {
          id: 'char1',
          name: 'Hero',
          sprites: [],
          createdAt: 1000,
        },
      ];

      await saveCharacterLibrary('story1', characters);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        `${STORAGE_PREFIX}story1`,
        JSON.stringify({ characters })
      );
    });

    it('should throw on storage error', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));

      await expect(saveCharacterLibrary('story1', [])).rejects.toThrow('Storage full');
    });
  });

  describe('addCharacter', () => {
    it('should add a new character with generated id and createdAt', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const newChar = await addCharacter('story1', {
        name: 'New Hero',
        sprites: [],
      });

      expect(newChar.id).toMatch(/^char_\d+_[a-z0-9]+$/);
      expect(newChar.name).toBe('New Hero');
      expect(newChar.createdAt).toBeTypeOf('number');
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('updateCharacter', () => {
    it('should update character fields', async () => {
      const existingChar: Character = {
        id: 'char1',
        name: 'Old Name',
        sprites: [],
        createdAt: 1000,
      };
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: [existingChar] })
      );

      await updateCharacter('story1', 'char1', { name: 'New Name' });

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1]
      );
      expect(savedData.characters[0].name).toBe('New Name');
    });

    it('should throw error if character not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: [] })
      );

      await expect(
        updateCharacter('story1', 'nonexistent', { name: 'Test' })
      ).rejects.toThrow('Character not found');
    });
  });

  describe('deleteCharacter', () => {
    it('should remove character from library', async () => {
      const chars: Character[] = [
        { id: 'char1', name: 'Hero', sprites: [], createdAt: 1000 },
        { id: 'char2', name: 'Villain', sprites: [], createdAt: 1000 },
      ];
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: chars })
      );

      await deleteCharacter('story1', 'char1');

      const savedData = JSON.parse(
        mockAsyncStorage.setItem.mock.calls[0][1]
      );
      expect(savedData.characters).toHaveLength(1);
      expect(savedData.characters[0].id).toBe('char2');
    });
  });

  describe('searchCharacters', () => {
    it('should find characters by name', async () => {
      const chars: Character[] = [
        { id: 'char1', name: 'Hero', sprites: [], createdAt: 1000 },
        { id: 'char2', name: 'Villain', sprites: [], createdAt: 1000 },
        { id: 'char3', name: 'Heroine', sprites: [], createdAt: 1000 },
      ];
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: chars })
      );

      const results = await searchCharacters('story1', 'hero');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Hero');
      expect(results[1].name).toBe('Heroine');
    });

    it('should return empty array if no matches', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: [] })
      );

      const results = await searchCharacters('story1', 'nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('getCharacter', () => {
    it('should return character by id', async () => {
      const chars: Character[] = [
        { id: 'char1', name: 'Hero', sprites: [], createdAt: 1000 },
      ];
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: chars })
      );

      const result = await getCharacter('story1', 'char1');

      expect(result).toEqual(chars[0]);
    });

    it('should return undefined if character not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify({ characters: [] })
      );

      const result = await getCharacter('story1', 'nonexistent');

      expect(result).toBeUndefined();
    });
  });
});
