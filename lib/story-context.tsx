import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Story, SaveSlot, PlaybackState, UserSettings } from './types';

interface StoryContextType {
  stories: Story[];
  currentStory: Story | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;

  // Actions
  loadStories: () => Promise<void>;
  setCurrentStory: (story: Story | null) => void;
  updatePlaybackState: (state: PlaybackState) => void;
  saveGame: (slotId: string) => Promise<void>;
  autoSave: () => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  deleteGame: (slotId: string) => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  addStory: (story: Story) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

interface State {
  stories: Story[];
  currentStory: Story | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;
}

type Action =
  | { type: 'SET_STORIES'; payload: Story[] }
  | { type: 'SET_CURRENT_STORY'; payload: Story | null }
  | { type: 'UPDATE_PLAYBACK_STATE'; payload: PlaybackState }
  | { type: 'SET_SAVE_SLOTS'; payload: SaveSlot[] }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'ADD_STORY'; payload: Story }
  | { type: 'DELETE_STORY'; payload: string };

const initialSettings: UserSettings = {
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.6,
  textSpeed: 0.5,
  textSize: 'medium',
  autoPlay: false,
  darkMode: true,
};

const initialState: State = {
  stories: [],
  currentStory: null,
  playbackState: null,
  saveSlots: [],
  settings: initialSettings,
};

function storyReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STORIES':
      return { ...state, stories: action.payload };
    case 'SET_CURRENT_STORY':
      return { ...state, currentStory: action.payload };
    case 'UPDATE_PLAYBACK_STATE':
      return { ...state, playbackState: action.payload };
    case 'SET_SAVE_SLOTS':
      return { ...state, saveSlots: action.payload };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'ADD_STORY':
      return { ...state, stories: [...state.stories, action.payload] };
    case 'DELETE_STORY':
      return {
        ...state,
        stories: state.stories.filter((s) => s.id !== action.payload),
      };
    default:
      return state;
  }
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storyReducer, initialState);

  // Load data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [storiesJson, slotsJson, settingsJson] = await Promise.all([
        AsyncStorage.getItem('stories'),
        AsyncStorage.getItem('saveSlots'),
        AsyncStorage.getItem('settings'),
      ]);

      if (storiesJson) {
        dispatch({ type: 'SET_STORIES', payload: JSON.parse(storiesJson) });
      }
      if (slotsJson) {
        dispatch({ type: 'SET_SAVE_SLOTS', payload: JSON.parse(slotsJson) });
      }
      if (settingsJson) {
        dispatch({ type: 'UPDATE_SETTINGS', payload: JSON.parse(settingsJson) });
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadStories = async () => {
    try {
      const storiesJson = await AsyncStorage.getItem('stories');
      if (storiesJson) {
        const stories = JSON.parse(storiesJson);
        dispatch({ type: 'SET_STORIES', payload: stories });
      }
    } catch (error) {
      console.error('Failed to load stories:', error);
    }
  };

  const setCurrentStory = (story: Story | null) => {
    dispatch({ type: 'SET_CURRENT_STORY', payload: story });
  };

  const updatePlaybackState = (playbackState: PlaybackState) => {
    dispatch({ type: 'UPDATE_PLAYBACK_STATE', payload: playbackState });
  };

  const saveGame = async (slotId: string) => {
    if (!state.playbackState || !state.currentStory) return;

    try {
      const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];

      // Extract first line of dialogue for preview
      const sceneText = currentScene?.text.split('\n')[0].slice(0, 100) || '';

      const newSlot: SaveSlot = {
        id: slotId,
        storyId: state.currentStory.id,
        sceneId: state.playbackState.currentSceneId,
        choicesMade: state.playbackState.choicesMade,
        timestamp: Date.now(),
        sceneName: currentScene?.id,
        thumbnailUri: currentScene?.backgroundImageUri || undefined,
        storyTitle: state.currentStory.title,
        sceneText,
        playTime: 0, // TODO: Track actual play time
      };

      const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
      updatedSlots.push(newSlot);

      dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
      await AsyncStorage.setItem('saveSlots', JSON.stringify(updatedSlots));
    } catch (error) {
      console.error('Failed to save game:', error);
    }
  };

  const autoSave = async () => {
    // Auto-save to special slot
    await saveGame('autosave');
  };

  const loadGame = async (slotId: string) => {
    try {
      const slot = state.saveSlots.find((s) => s.id === slotId);
      if (!slot) return;

      const playbackState: PlaybackState = {
        storyId: slot.storyId,
        currentSceneId: slot.sceneId,
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: slot.choicesMade,
      };

      dispatch({ type: 'UPDATE_PLAYBACK_STATE', payload: playbackState });
    } catch (error) {
      console.error('Failed to load game:', error);
    }
  };

  const deleteGame = async (slotId: string) => {
    try {
      const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
      dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
      await AsyncStorage.setItem('saveSlots', JSON.stringify(updatedSlots));
    } catch (error) {
      console.error('Failed to delete game:', error);
    }
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const updated = { ...state.settings, ...newSettings };
      dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
      await AsyncStorage.setItem('settings', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  const addStory = async (story: Story) => {
    try {
      const updatedStories = [...state.stories, story];
      dispatch({ type: 'ADD_STORY', payload: story });
      await AsyncStorage.setItem('stories', JSON.stringify(updatedStories));
    } catch (error) {
      console.error('Failed to add story:', error);
    }
  };

  const deleteStory = async (storyId: string) => {
    try {
      const updatedStories = state.stories.filter((s) => s.id !== storyId);
      dispatch({ type: 'DELETE_STORY', payload: storyId });
      await AsyncStorage.setItem('stories', JSON.stringify(updatedStories));
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  };

  const value: StoryContextType = {
    stories: state.stories,
    currentStory: state.currentStory,
    playbackState: state.playbackState,
    saveSlots: state.saveSlots,
    settings: state.settings,
    loadStories,
    setCurrentStory,
    updatePlaybackState,
    saveGame,
    autoSave,
    loadGame,
    deleteGame,
    updateSettings,
    addStory,
    deleteStory,
  };

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStory must be used within a StoryProvider');
  }
  return context;
}
