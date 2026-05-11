import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Story, SaveSlot, PlaybackState, UserSettings, StoryScene } from './types';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './error-handler';
import { withLogging } from './state-logger';
import { StoryMetadata, StoryDomain } from './story-domain';
import { StoryRepository } from './story-repository';
import { useAutoSave } from '../hooks/useAutoSave';
import demoStory from '../assets/demo-story.json';

interface State {
  stories: StoryMetadata[];
  currentStory: Story | null;
  playbackState: PlaybackState | null;
  saveSlots: SaveSlot[];
  settings: UserSettings;
  isLoading: boolean;
}

interface StoryActions {
  loadStories: () => Promise<void>;
  setCurrentStory: (storyId: string | null) => Promise<void>;
  updatePlaybackState: (state: PlaybackState) => void;
  saveGame: (slotId: string) => Promise<void>;
  loadGame: (slotId: string) => Promise<void>;
  deleteGame: (slotId: string) => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => void;
  addStory: (story: Story) => Promise<void>;
  deleteStory: (storyId: string) => void;
  syncSaveSlots: (newSlot: SaveSlot) => Promise<void>;
}

const StoryStateContext = createContext<State | undefined>(undefined);
const StoryActionsContext = createContext<StoryActions | undefined>(undefined);

type Action =
  | { type: 'SET_STORIES'; payload: StoryMetadata[] }
  | { type: 'SET_CURRENT_STORY'; payload: Story | null }
  | { type: 'UPDATE_PLAYBACK_STATE'; payload: PlaybackState }
  | { type: 'SET_SAVE_SLOTS'; payload: SaveSlot[] }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'ADD_STORY_METADATA'; payload: StoryMetadata }
  | { type: 'DELETE_STORY_METADATA'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
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
  isLoading: true,
};

function storyReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STORIES':
      return { ...state, stories: action.payload };
    case 'SET_CURRENT_STORY':
      return { 
        ...state, 
        currentStory: action.payload,
        playbackState: state.currentStory?.id === action.payload?.id ? state.playbackState : null 
      };
    case 'UPDATE_PLAYBACK_STATE':
      return { ...state, playbackState: action.payload };
    case 'SET_SAVE_SLOTS':
      return { ...state, saveSlots: action.payload };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'ADD_STORY_METADATA': {
      const exists = state.stories.find(s => s.id === action.payload.id);
      if (exists) {
        return {
          ...state,
          stories: state.stories.map(s => s.id === action.payload.id ? action.payload : s)
        };
      }
      return { ...state, stories: [...state.stories, action.payload] };
    }
    case 'DELETE_STORY_METADATA':
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
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(withLogging(storyReducer), initialState);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [stories, saveSlots, settings] = await Promise.all([
          StoryRepository.getAllStoriesMetadata(),
          StoryRepository.getSaveSlots(),
          StoryRepository.getSettings(),
        ]);

        dispatch({ type: 'SET_STORIES', payload: stories });
        dispatch({ type: 'SET_SAVE_SLOTS', payload: saveSlots });
        if (settings) {
          dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
        }
      } catch (error) {
        ErrorHandler.handleStorageError('load initial data', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    loadData();
  }, []);

  // Issue 6: Persistence synchronization effect
  useEffect(() => {
    if (state.isLoading) return;

    const timer = setTimeout(() => {
      StoryRepository.saveSaveSlots(state.saveSlots);
      StoryRepository.saveSettings(state.settings);
    }, 1000); // 1s debounce to avoid excessive writes

    return () => clearTimeout(timer);
  }, [state.saveSlots, state.settings, state.isLoading]);

  const loadStories = useCallback(async () => {
    try {
      const stories = await StoryRepository.getAllStoriesMetadata();
      dispatch({ type: 'SET_STORIES', payload: stories });
    } catch (error) {
      ErrorHandler.handleStorageError('load stories', error);
      throw error;
    }
  }, []);


  const setCurrentStory = useCallback(async (storyId: string | null) => {
    if (!storyId) {
      dispatch({ type: 'SET_CURRENT_STORY', payload: null });
      return;
    }

    try {
      // Special case for demo story
      if (storyId === (demoStory as any).id) {
        dispatch({ type: 'SET_CURRENT_STORY', payload: demoStory as unknown as Story });
        return;
      }

      const metadata = state.stories.find(s => s.id === storyId);
      if (!metadata) return;

      const scenes = await StoryRepository.getStoryScenes(storyId);
      const fullStory: Story = {
        ...metadata,
        scenes,
        audioLibrary: [] // TODO: Load if needed
      };
      
      dispatch({ type: 'SET_CURRENT_STORY', payload: fullStory });
    } catch (error) {
      ErrorHandler.handleStorageError('set current story', error, { storyId });
    }
  }, [state.stories]);

  const updatePlaybackState = useCallback((playbackState: PlaybackState) => {
    dispatch({ type: 'UPDATE_PLAYBACK_STATE', payload: playbackState });
  }, []);

  const saveGame = useCallback(async (slotId: string) => {
    if (!state.playbackState || !state.currentStory) {
      ErrorHandler.handleValidationError('Cannot save game: no active story or playback state');
      return;
    }

    const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];
    const newSlot = StoryDomain.createSaveSlot(
      slotId,
      state.currentStory,
      state.playbackState,
      currentScene
    );

    const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
    updatedSlots.push(newSlot);

    dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
    // Persistence handled by useEffect
  }, [state.playbackState, state.currentStory, state.saveSlots]);

  const syncSaveSlots = useCallback(async (newSlot: SaveSlot) => {
    dispatch({ 
      type: 'SET_SAVE_SLOTS', 
      payload: [...state.saveSlots.filter(s => s.id !== 'autosave'), newSlot]
    });
  }, [state.saveSlots]);

  // Issue 1: Delegate auto-save to hook
  useAutoSave({
    playbackState: state.playbackState,
    currentStory: state.currentStory,
    saveSlots: state.saveSlots,
    onAutoSave: syncSaveSlots,
    enabled: !!state.playbackState?.isPlaying
  });

  const loadGame = useCallback(async (slotId: string) => {
    try {
      const slot = state.saveSlots.find((s) => s.id === slotId);
      if (!slot) {
        ErrorHandler.handleValidationError(`Save slot not found: ${slotId}`);
        return;
      }

      const metadata = state.stories.find((s) => s.id === slot.storyId);
      if (!metadata) {
        ErrorHandler.handleValidationError(`Story metadata not found for slot: ${slot.storyId}`);
        return;
      }

      const scenes = await StoryRepository.getStoryScenes(slot.storyId);
      const story: Story = { ...metadata, scenes };

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
      ErrorHandler.handle('Failed to load game', error, ErrorCategory.UNKNOWN, ErrorSeverity.HIGH);
      throw error;
    }
  }, [state.saveSlots, state.stories]);

  const deleteGame = useCallback(async (slotId: string) => {
    const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
    dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
    // Persistence handled by useEffect
  }, [state.saveSlots]);

  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
    // Persistence handled by useEffect
  }, []);

  const addStory = useCallback(async (story: Story) => {
    try {
      await StoryRepository.saveStory(story);
      const metadata = StoryDomain.extractMetadata(story);
      dispatch({ type: 'ADD_STORY_METADATA', payload: metadata });
    } catch (error) {
      ErrorHandler.handleStorageError('add story', error, { storyId: story.id });
    }
  }, []);

  const deleteStory = useCallback(async (storyId: string) => {
    try {
      await StoryRepository.deleteStory(storyId);
      dispatch({ type: 'DELETE_STORY_METADATA', payload: storyId });
    } catch (error) {
      ErrorHandler.handleStorageError('delete story', error, { storyId });
    }
  }, []);

  const actions = useMemo(() => ({
    loadStories,
    setCurrentStory,
    updatePlaybackState,
    saveGame,
    loadGame,
    deleteGame,
    updateSettings,
    addStory,
    deleteStory,
    syncSaveSlots,
  }), [
    loadStories,
    setCurrentStory,
    updatePlaybackState,
    saveGame,
    loadGame,
    deleteGame,
    updateSettings,
    addStory,
    deleteStory,
    syncSaveSlots,
  ]);

  return (
    <StoryStateContext.Provider value={state}>
      <StoryActionsContext.Provider value={actions}>
        {children}
      </StoryActionsContext.Provider>
    </StoryStateContext.Provider>
  );
}

export function useStoryState() {
  const context = useContext(StoryStateContext);
  if (context === undefined) {
    throw new Error('useStoryState must be used within a StoryProvider');
  }
  return context;
}

export function useStoryActions() {
  const context = useContext(StoryActionsContext);
  if (context === undefined) {
    throw new Error('useStoryActions must be used within a StoryProvider');
  }
  return context;
}

// Backward compatibility hook
export function useStory() {
  const state = useStoryState();
  const actions = useStoryActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
