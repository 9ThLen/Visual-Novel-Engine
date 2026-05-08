import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Story, SaveSlot, PlaybackState, UserSettings } from './types';
import { ErrorHandler, ErrorCategory, ErrorSeverity, retryAsync } from './error-handler';
import { withLogging } from './state-logger';

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
  | { type: 'DELETE_STORY'; payload: string }
  | { type: 'LOAD_GAME_STATE'; payload: { story: Story; playbackState: PlaybackState } };

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
      return { 
        ...state, 
        currentStory: action.payload,
        playbackState: null // Reset playback state when switching stories to prevent stale data
      };
    case 'UPDATE_PLAYBACK_STATE':
      return { ...state, playbackState: action.payload };
    case 'SET_SAVE_SLOTS':
      return { ...state, saveSlots: action.payload };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'ADD_STORY': {
      const exists = state.stories.find(s => s.id === action.payload.id);
      if (exists) {
        return {
          ...state,
          stories: state.stories.map(s => s.id === action.payload.id ? action.payload : s)
        };
      }
      return { ...state, stories: [...state.stories, action.payload] };
    }
    case 'DELETE_STORY':
      return {
        ...state,
        stories: state.stories.filter((s) => s.id !== action.payload),
      };
    case 'LOAD_GAME_STATE':
      return {
        ...state,
        currentStory: action.payload.story,
        playbackState: action.payload.playbackState,
      };
    default:
      return state;
  }
}

export function StoryProvider({ children }: { children: ReactNode }) {
  // Wrap reducer with logging middleware
  const [state, dispatch] = useReducer(withLogging(storyReducer), initialState);
  const autoSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);

  // Load data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [storiesJson, slotsJson, settingsJson] = await retryAsync(
        () => Promise.all([
          AsyncStorage.getItem('stories'),
          AsyncStorage.getItem('saveSlots'),
          AsyncStorage.getItem('settings'),
        ]),
        {
          maxRetries: 3,
          delayMs: 500,
          onRetry: (attempt) => {
            console.log(`Retrying loadInitialData, attempt ${attempt}`);
          }
        }
      );

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
      ErrorHandler.handleStorageError('load initial data', error, {
        operation: 'loadInitialData'
      });
    }
  };

  const loadStories = useCallback(async () => {
    try {
      const storiesJson = await retryAsync(
        () => AsyncStorage.getItem('stories'),
        { maxRetries: 3, delayMs: 500 }
      );

      if (storiesJson) {
        const stories = JSON.parse(storiesJson);
        dispatch({ type: 'SET_STORIES', payload: stories });
      }
    } catch (error) {
      ErrorHandler.handleStorageError('load stories', error, {
        operation: 'loadStories'
      });
      throw error; // Re-throw so caller can handle
    }
  }, []);

  const setCurrentStory = useCallback((story: Story | null) => {
    dispatch({ type: 'SET_CURRENT_STORY', payload: story });
  }, []);

  const updatePlaybackState = useCallback((playbackState: PlaybackState) => {
    dispatch({ type: 'UPDATE_PLAYBACK_STATE', payload: playbackState });
  }, []);

  // saveGame зависит от current state
  const saveGame = useCallback(async (slotId: string) => {
    if (!state.playbackState || !state.currentStory) {
      ErrorHandler.handleValidationError('Cannot save game: no active story or playback state', {
        slotId,
        hasPlaybackState: !!state.playbackState,
        hasCurrentStory: !!state.currentStory
      });
      return;
    }

    try {
      const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];

      // Extract first line of dialogue for preview - safe access
      const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';

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

      await retryAsync(
        () => AsyncStorage.setItem('saveSlots', JSON.stringify(updatedSlots)),
        { maxRetries: 3, delayMs: 500 }
      );
    } catch (error) {
      ErrorHandler.handleStorageError('save game', error, {
        slotId,
        storyId: state.currentStory.id,
        sceneId: state.playbackState.currentSceneId
      });
      throw error;
    }
  }, [state.playbackState, state.currentStory, state.saveSlots]);

  // autoSave с debounce — не сохраняет слишком часто
  const autoSave = useCallback(async () => {
    // Clear existing timeout to debounce
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce auto-save to avoid excessive writes (500ms)
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Check if component is still mounted before async operations
        if (!isMountedRef.current) return;
        // Check if game is active and playing
        if (!state.playbackState || !state.currentStory || !state.playbackState.isPlaying) return;

        const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];
        const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';

        const newSlot: SaveSlot = {
          id: 'autosave',
          storyId: state.currentStory.id,
          sceneId: state.playbackState.currentSceneId,
          choicesMade: state.playbackState.choicesMade,
          timestamp: Date.now(),
          sceneName: currentScene?.id,
          thumbnailUri: currentScene?.backgroundImageUri || undefined,
          storyTitle: state.currentStory.title,
          sceneText,
          playTime: 0,
        };

        const updatedSlots = state.saveSlots.filter((s) => s.id !== 'autosave');
        updatedSlots.push(newSlot);

        // Check again before state updates
        if (!isMountedRef.current) return;

        dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
        await retryAsync(
          () => AsyncStorage.setItem('saveSlots', JSON.stringify(updatedSlots)),
          { maxRetries: 2, delayMs: 300 }
        );
      } catch (error) {
        ErrorHandler.handleStorageError('auto-save game', error, {
          storyId: state.currentStory.id,
          sceneId: state.playbackState.currentSceneId
        });
      }
    }, 500);
  }, [state.playbackState, state.currentStory, state.saveSlots]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // loadGame зависит от state.saveSlots
  const loadGame = useCallback(async (slotId: string) => {
    try {
      const slot = state.saveSlots.find((s) => s.id === slotId);
      if (!slot) {
        ErrorHandler.handleValidationError(`Save slot not found: ${slotId}`, { slotId });
        return;
      }

      const story = state.stories.find((s) => s.id === slot.storyId);
      if (!story) {
        ErrorHandler.handleValidationError(`Story not found for save slot: ${slot.storyId}`, {
          slotId,
          storyId: slot.storyId
        });
        return;
      }

      const playbackState: PlaybackState = {
        storyId: slot.storyId,
        currentSceneId: slot.sceneId,
        isPlaying: true,
        currentDialogueIndex: 0,
        choicesMade: slot.choicesMade,
      };

      dispatch({
        type: 'LOAD_GAME_STATE',
        payload: { story, playbackState }
      });
    } catch (error) {
      ErrorHandler.handle('Failed to load game', error, ErrorCategory.UNKNOWN, ErrorSeverity.HIGH, {
        slotId
      });
      throw error;
    }
  }, [state.saveSlots, state.stories]);

  // deleteGame зависит от state.saveSlots
  const deleteGame = useCallback(async (slotId: string) => {
    try {
      const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
      dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });

      await retryAsync(
        () => AsyncStorage.setItem('saveSlots', JSON.stringify(updatedSlots)),
        { maxRetries: 3, delayMs: 500 }
      );
    } catch (error) {
      ErrorHandler.handleStorageError('delete game save', error, { slotId });
      throw error;
    }
  }, [state.saveSlots]);

  // updateSettings зависит от state.settings
  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    try {
      const updated = { ...state.settings, ...newSettings };
      dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });

      await retryAsync(
        () => AsyncStorage.setItem('settings', JSON.stringify(updated)),
        { maxRetries: 3, delayMs: 500 }
      );
    } catch (error) {
      ErrorHandler.handleStorageError('update settings', error, { newSettings });
      throw error;
    }
  }, [state.settings]);

  // addStory зависит от state.stories
  const addStory = useCallback(async (story: Story) => {
    try {
      const exists = state.stories.find(s => s.id === story.id);
      let updatedStories: Story[];
      
      if (exists) {
        updatedStories = state.stories.map(s => s.id === story.id ? story : s);
      } else {
        updatedStories = [...state.stories, story];
      }
      
      dispatch({ type: 'ADD_STORY', payload: story });
      await AsyncStorage.setItem('stories', JSON.stringify(updatedStories));
    } catch (error) {
      console.error('Failed to add story:', error);
    }
  }, [state.stories]);

  // deleteStory зависит от state.stories
  const deleteStory = useCallback(async (storyId: string) => {
    try {
      const updatedStories = state.stories.filter((s) => s.id !== storyId);
      dispatch({ type: 'DELETE_STORY', payload: storyId });
      await AsyncStorage.setItem('stories', JSON.stringify(updatedStories));
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  }, [state.stories]);

  // Optimize: Split state and functions to reduce re-renders
  // State changes frequently, but functions are stable
  const stateValue = useMemo(() => ({
    stories: state.stories,
    currentStory: state.currentStory,
    playbackState: state.playbackState,
    saveSlots: state.saveSlots,
    settings: state.settings,
  }), [
    state.stories,
    state.currentStory,
    state.playbackState,
    state.saveSlots,
    state.settings,
  ]);

  // Functions are stable (wrapped in useCallback), so we can create this object once
  const functionsValue = useMemo(() => ({
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
  }), [
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
  ]);

  // Combine state and functions
  const value: StoryContextType = useMemo(() => ({
    ...stateValue,
    ...functionsValue,
  }), [stateValue, functionsValue]);

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStory must be used within a StoryProvider');
  }
  return context;
}
