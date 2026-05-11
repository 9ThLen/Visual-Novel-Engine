import { useState, useMemo, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import type { Character, CharacterSprite } from '@/lib/character-types';

const STORAGE_KEY = (storyId: string) => `character_library_${storyId}`;

function loadFromStorage(storyId: string): Promise<Character[]> {
  return AsyncStorage.getItem(STORAGE_KEY(storyId))
    .then((raw) => (raw ? JSON.parse(raw) : []))
    .catch(() => []);
}

function saveToStorage(storyId: string, characters: Character[]): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEY(storyId), JSON.stringify(characters));
}

export function useCharacterLibrary(storyId: string, enabled: boolean) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [editingSprite, setEditingSprite] = useState<CharacterSprite | null>(null);

  // Load characters from AsyncStorage
  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const data = await loadFromStorage(storyId);
      setCharacters(data);
    } finally {
      setIsLoading(false);
    }
  }, [storyId, enabled]);

  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);

  // Persist whenever characters change
  useEffect(() => {
    if (characters.length > 0 || !isLoading) {
      saveToStorage(storyId, characters).catch(() => {});
    }
  }, [characters, storyId, isLoading]);

  // Memoized derived state
  const filteredCharacters = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return characters.filter((char) => char.name.toLowerCase().includes(query));
  }, [characters, searchQuery]);

  const selectedCharacter = useMemo(() => {
    return characters.find((c) => c.id === selectedCharId) || null;
  }, [characters, selectedCharId]);

  const [inputModal, setInputModal] = useState<{
    type: 'character' | 'sprite';
    title: string;
    message?: string;
    defaultValue?: string;
    pendingUri?: string;
  } | null>(null);

  // Actions
  const addCharacter = useCallback(() => {
    setInputModal({
      type: 'character',
      title: 'New Character',
      message: 'Enter character name:',
    });
  }, []);

  const handleInputSave = useCallback(async (text: string) => {
    if (!text.trim() || !inputModal) return;

    try {
      if (inputModal.type === 'character') {
        const id = `char_${Date.now()}`;
        const newChar: Character = {
          id,
          name: text,
          sprites: [],
          createdAt: Date.now(),
        };
        setCharacters((prev) => {
          const next = [...prev, newChar];
          saveToStorage(storyId, next).catch(() => {});
          return next;
        });
        setSelectedCharId(id);
      } else if (inputModal.type === 'sprite' && inputModal.pendingUri) {
        if (!selectedCharId) return;
        const newSprite: CharacterSprite = {
          id: `sprite_${Date.now()}`,
          name: text,
          uri: inputModal.pendingUri,
          tags: [],
          createdAt: Date.now(),
        };
        setCharacters((prev) => {
          const next = prev.map((c) =>
            c.id === selectedCharId
              ? { ...c, sprites: [...c.sprites, newSprite] }
              : c
          );
          saveToStorage(storyId, next).catch(() => {});
          return next;
        });
      }
      setInputModal(null);
    } catch (error) {
      Alert.alert('Error', `Failed to save ${inputModal.type}`);
    }
  }, [storyId, inputModal, selectedCharId]);

  const deleteCharacter = useCallback((characterId: string) => {
    Alert.alert('Delete Character', 'Are you sure? All sprites will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setCharacters((prev) => {
            const next = prev.filter((c) => c.id !== characterId);
            saveToStorage(storyId, next).catch(() => {});
            return next;
          });
          setSelectedCharId(null);
        },
      },
    ]);
  }, [storyId]);

  const addSprite = useCallback(async () => {
    if (!selectedCharId) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const { uri, name } = result.assets[0];

      setInputModal({
        type: 'sprite',
        title: 'Sprite Name',
        message: 'Enter name (e.g., Happy, Sad, Casual):',
        defaultValue: name.replace(/\.[^/.]+$/, ''),
        pendingUri: uri,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to open picker');
    }
  }, [selectedCharId]);

  const deleteSprite = useCallback((spriteId: string) => {
    Alert.alert('Delete Sprite', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setCharacters((prev) => {
            const next = prev.map((c) => ({
              ...c,
              sprites: c.sprites.filter((s) => s.id !== spriteId),
            }));
            saveToStorage(storyId, next).catch(() => {});
            return next;
          });
        },
      },
    ]);
  }, [storyId]);

  const saveSprite = useCallback(async () => {
    if (!editingSprite) return;

    setCharacters((prev) => {
      const next = prev.map((c) => ({
        ...c,
        sprites: c.sprites.map((s) =>
          s.id === editingSprite.id
            ? { ...s, name: editingSprite.name, tags: editingSprite.tags }
            : s
        ),
      }));
      saveToStorage(storyId, next).catch(() => {});
      return next;
    });
    setEditingSprite(null);
  }, [storyId, editingSprite]);

  return {
    characters,
    filteredCharacters,
    selectedCharacter,
    selectedCharId,
    setSelectedCharId,
    searchQuery,
    setSearchQuery,
    editingSprite,
    setEditingSprite,
    inputModal,
    setInputModal,
    isLoading,
    actions: {
      addCharacter,
      deleteCharacter,
      addSprite,
      deleteSprite,
      saveSprite,
      handleInputSave,
    }
  };
}
