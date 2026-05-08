     1|import React, { createContext, useContext, useReducer, useEffect, ReactNode, useMemo, useCallback } from 'react';
     2|import AsyncStorage from '@react-native-async-storage/async-storage';
     3|import { Story, SaveSlot, PlaybackState, UserSettings } from './types';
     4|import { ErrorHandler, ErrorCategory, ErrorSeverity, retryAsync } from './error-handler';
     5|import { withLogging } from './state-logger';
     6|import { STORAGE_KEYS } from './storage-keys';
     7|
     8|interface StoryContextType {
     9|  stories: Story[];
    10|  currentStory: Story | null;
    11|  playbackState: PlaybackState | null;
    12|  saveSlots: SaveSlot[];
    13|  settings: UserSettings;
    14|
    15|  // Actions
    16|  loadStories: () => Promise<void>;
    17|  setCurrentStory: (story: Story | null) => void;
    18|  updatePlaybackState: (state: PlaybackState) => void;
    19|  saveGame: (slotId: string) => Promise<void>;
    20|  autoSave: () => Promise<void>;
    21|  loadGame: (slotId: string) => Promise<void>;
    22|  deleteGame: (slotId: string) => Promise<void>;
    23|  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
    24|  addStory: (story: Story) => Promise<void>;
    25|  deleteStory: (storyId: string) => Promise<void>;
    26|}
    27|
    28|const StoryContext = createContext<StoryContextType | undefined>(undefined);
    29|
    30|interface State {
    31|  stories: Story[];
    32|  currentStory: Story | null;
    33|  playbackState: PlaybackState | null;
    34|  saveSlots: SaveSlot[];
    35|  settings: UserSettings;
    36|}
    37|
    38|type Action =
    39|  | { type: 'SET_STORIES'; payload: Story[] }
    40|  | { type: 'SET_CURRENT_STORY'; payload: Story | null }
    41|  | { type: 'UPDATE_PLAYBACK_STATE'; payload: PlaybackState }
    42|  | { type: 'SET_SAVE_SLOTS'; payload: SaveSlot[] }
    43|  | { type: 'UPDATE_SETTINGS'; payload: Partial<UserSettings> }
    44|  | { type: 'ADD_STORY'; payload: Story }
    45|  | { type: 'DELETE_STORY'; payload: string }
    46|  | { type: 'LOAD_GAME_STATE'; payload: { story: Story; playbackState: PlaybackState } };
    47|
    48|const initialSettings: UserSettings = {
    49|  bgmVolume: 0.7,
    50|  voiceVolume: 0.8,
    51|  sfxVolume: 0.6,
    52|  textSpeed: 0.5,
    53|  textSize: 'medium',
    54|  autoPlay: false,
    55|  darkMode: true,
    56|};
    57|
    58|const initialState: State = {
    59|  stories: [],
    60|  currentStory: null,
    61|  playbackState: null,
    62|  saveSlots: [],
    63|  settings: initialSettings,
    64|};
    65|
    66|function storyReducer(state: State, action: Action): State {
    67|  switch (action.type) {
    68|    case 'SET_STORIES':
    69|      return { ...state, stories: action.payload };
    70|    case 'SET_CURRENT_STORY':
    71|      return { 
    72|        ...state, 
    73|        currentStory: action.payload,
    74|        playbackState: null // Reset playback state when switching stories to prevent stale data
    75|      };
    76|    case 'UPDATE_PLAYBACK_STATE':
    77|      return { ...state, playbackState: action.payload };
    78|    case 'SET_SAVE_SLOTS':
    79|      return { ...state, saveSlots: action.payload };
    80|    case 'UPDATE_SETTINGS':
    81|      return { ...state, settings: { ...state.settings, ...action.payload } };
    82|    case 'ADD_STORY': {
    83|      const exists = state.stories.find(s => s.id === action.payload.id);
    84|      if (exists) {
    85|        return {
    86|          ...state,
    87|          stories: state.stories.map(s => s.id === action.payload.id ? action.payload : s)
    88|        };
    89|      }
    90|      return { ...state, stories: [...state.stories, action.payload] };
    91|    }
    92|    case 'DELETE_STORY':
    93|      return {
    94|        ...state,
    95|        stories: state.stories.filter((s) => s.id !== action.payload),
    96|      };
    97|    case 'LOAD_GAME_STATE':
    98|      return {
    99|        ...state,
   100|        currentStory: action.payload.story,
   101|        playbackState: action.payload.playbackState,
   102|      };
   103|    default:
   104|      return state;
   105|  }
   106|}
   107|
   108|export function StoryProvider({ children }: { children: ReactNode }) {
   109|  // Wrap reducer with logging middleware
   110|  const [state, dispatch] = useReducer(withLogging(storyReducer), initialState);
   111|  const autoSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
   112|  const isMountedRef = React.useRef(true);
   113|
   114|  // Load data on mount
   115|  useEffect(() => {
   116|    loadInitialData();
   117|  }, []);
   118|
   119|  const loadInitialData = async () => {
   120|    try {
   121|      const [storiesJson, slotsJson, settingsJson] = await retryAsync(
   122|        () => Promise.all([
   123|          AsyncStorage.getItem(STORAGE_KEYS.STORIES),
   124|          AsyncStorage.getItem(STORAGE_KEYS.SAVE_SLOTS),
   125|          AsyncStorage.getItem(STORAGE_KEYS.SETTINGS),
   126|        ]),
   127|        {
   128|          maxRetries: 3,
   129|          delayMs: 500,
   130|          onRetry: (attempt) => {
   131|            console.log(`Retrying loadInitialData, attempt ${attempt}`);
   132|          }
   133|        }
   134|      );
   135|
   136|      if (storiesJson) {
   137|        dispatch({ type: 'SET_STORIES', payload: JSON.parse(storiesJson) });
   138|      }
   139|      if (slotsJson) {
   140|        dispatch({ type: 'SET_SAVE_SLOTS', payload: JSON.parse(slotsJson) });
   141|      }
   142|      if (settingsJson) {
   143|        dispatch({ type: 'UPDATE_SETTINGS', payload: JSON.parse(settingsJson) });
   144|      }
   145|    } catch (error) {
   146|      ErrorHandler.handleStorageError('load initial data', error, {
   147|        operation: 'loadInitialData'
   148|      });
   149|    }
   150|  };
   151|
   152|  const loadStories = useCallback(async () => {
   153|    try {
   154|      const storiesJson = await retryAsync(
   155|        () => AsyncStorage.getItem(STORAGE_KEYS.STORIES),
   156|        { maxRetries: 3, delayMs: 500 }
   157|      );
   158|
   159|      if (storiesJson) {
   160|        const stories = JSON.parse(storiesJson);
   161|        dispatch({ type: 'SET_STORIES', payload: stories });
   162|      }
   163|    } catch (error) {
   164|      ErrorHandler.handleStorageError('load stories', error, {
   165|        operation: 'loadStories'
   166|      });
   167|      throw error; // Re-throw so caller can handle
   168|    }
   169|  }, []);
   170|
   171|  const setCurrentStory = useCallback((story: Story | null) => {
   172|    dispatch({ type: 'SET_CURRENT_STORY', payload: story });
   173|  }, []);
   174|
   175|  const updatePlaybackState = useCallback((playbackState: PlaybackState) => {
   176|    dispatch({ type: 'UPDATE_PLAYBACK_STATE', payload: playbackState });
   177|  }, []);
   178|
   179|  // saveGame зависит от current state
   180|  const saveGame = useCallback(async (slotId: string) => {
   181|    if (!state.playbackState || !state.currentStory) {
   182|      ErrorHandler.handleValidationError('Cannot save game: no active story or playback state', {
   183|        slotId,
   184|        hasPlaybackState: !!state.playbackState,
   185|        hasCurrentStory: !!state.currentStory
   186|      });
   187|      return;
   188|    }
   189|
   190|    try {
   191|      const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];
   192|
   193|      // Extract first line of dialogue for preview - safe access
   194|      const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';
   195|
   196|      const newSlot: SaveSlot = {
   197|        id: slotId,
   198|        storyId: state.currentStory.id,
   199|        sceneId: state.playbackState.currentSceneId,
   200|        choicesMade: state.playbackState.choicesMade,
   201|        timestamp: Date.now(),
   202|        sceneName: currentScene?.id,
   203|        thumbnailUri: currentScene?.backgroundImageUri || undefined,
   204|        storyTitle: state.currentStory.title,
   205|        sceneText,
   206|        playTime: 0, // TODO: Track actual play time
   207|      };
   208|
   209|      const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
   210|      updatedSlots.push(newSlot);
   211|
   212|      dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
   213|
   214|      await retryAsync(
   215|        () => AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, , JSON.stringify(updatedSlots)),
   216|        { maxRetries: 3, delayMs: 500 }
   217|      );
   218|    } catch (error) {
   219|      ErrorHandler.handleStorageError('save game', error, {
   220|        slotId,
   221|        storyId: state.currentStory.id,
   222|        sceneId: state.playbackState.currentSceneId
   223|      });
   224|      throw error;
   225|    }
   226|  }, [state.playbackState, state.currentStory, state.saveSlots]);
   227|
   228|  // autoSave с debounce — не сохраняет слишком часто
   229|  const autoSave = useCallback(async () => {
   230|    // Clear existing timeout to debounce
   231|    if (autoSaveTimeoutRef.current) {
   232|      clearTimeout(autoSaveTimeoutRef.current);
   233|    }
   234|
   235|    // Debounce auto-save to avoid excessive writes (500ms)
   236|    autoSaveTimeoutRef.current = setTimeout(async () => {
   237|      try {
   238|        // Check if component is still mounted before async operations
   239|        if (!isMountedRef.current) return;
   240|        // Check if game is active and playing
   241|        if (!state.playbackState || !state.currentStory || !state.playbackState.isPlaying) return;
   242|
   243|        const currentScene = state.currentStory.scenes[state.playbackState.currentSceneId];
   244|        const sceneText = currentScene?.text?.split('\n')[0]?.slice(0, 100) || '';
   245|
   246|        const newSlot: SaveSlot = {
   247|          id: 'autosave',
   248|          storyId: state.currentStory.id,
   249|          sceneId: state.playbackState.currentSceneId,
   250|          choicesMade: state.playbackState.choicesMade,
   251|          timestamp: Date.now(),
   252|          sceneName: currentScene?.id,
   253|          thumbnailUri: currentScene?.backgroundImageUri || undefined,
   254|          storyTitle: state.currentStory.title,
   255|          sceneText,
   256|          playTime: 0,
   257|        };
   258|
   259|        const updatedSlots = state.saveSlots.filter((s) => s.id !== 'autosave');
   260|        updatedSlots.push(newSlot);
   261|
   262|        // Check again before state updates
   263|        if (!isMountedRef.current) return;
   264|
   265|        dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
   266|        await retryAsync(
   267|          () => AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, , JSON.stringify(updatedSlots)),
   268|          { maxRetries: 2, delayMs: 300 }
   269|        );
   270|      } catch (error) {
   271|        ErrorHandler.handleStorageError('auto-save game', error, {
   272|          storyId: state.currentStory.id,
   273|          sceneId: state.playbackState.currentSceneId
   274|        });
   275|      }
   276|    }, 500);
   277|  }, [state.playbackState, state.currentStory, state.saveSlots]);
   278|
   279|  // Cleanup timeout on unmount
   280|  useEffect(() => {
   281|    return () => {
   282|      isMountedRef.current = false;
   283|      if (autoSaveTimeoutRef.current) {
   284|        clearTimeout(autoSaveTimeoutRef.current);
   285|      }
   286|    };
   287|  }, []);
   288|
   289|  // loadGame зависит от state.saveSlots
   290|  const loadGame = useCallback(async (slotId: string) => {
   291|    try {
   292|      const slot = state.saveSlots.find((s) => s.id === slotId);
   293|      if (!slot) {
   294|        ErrorHandler.handleValidationError(`Save slot not found: ${slotId}`, { slotId });
   295|        return;
   296|      }
   297|
   298|      const story = state.stories.find((s) => s.id === slot.storyId);
   299|      if (!story) {
   300|        ErrorHandler.handleValidationError(`Story not found for save slot: ${slot.storyId}`, {
   301|          slotId,
   302|          storyId: slot.storyId
   303|        });
   304|        return;
   305|      }
   306|
   307|      const playbackState: PlaybackState = {
   308|        storyId: slot.storyId,
   309|        currentSceneId: slot.sceneId,
   310|        isPlaying: true,
   311|        currentDialogueIndex: 0,
   312|        choicesMade: slot.choicesMade,
   313|      };
   314|
   315|      dispatch({
   316|        type: 'LOAD_GAME_STATE',
   317|        payload: { story, playbackState }
   318|      });
   319|    } catch (error) {
   320|      ErrorHandler.handle('Failed to load game', error, ErrorCategory.UNKNOWN, ErrorSeverity.HIGH, {
   321|        slotId
   322|      });
   323|      throw error;
   324|    }
   325|  }, [state.saveSlots, state.stories]);
   326|
   327|  // deleteGame зависит от state.saveSlots
   328|  const deleteGame = useCallback(async (slotId: string) => {
   329|    try {
   330|      const updatedSlots = state.saveSlots.filter((s) => s.id !== slotId);
   331|      dispatch({ type: 'SET_SAVE_SLOTS', payload: updatedSlots });
   332|
   333|      await retryAsync(
   334|        () => AsyncStorage.setItem(STORAGE_KEYS.SAVE_SLOTS, , JSON.stringify(updatedSlots)),
   335|        { maxRetries: 3, delayMs: 500 }
   336|      );
   337|    } catch (error) {
   338|      ErrorHandler.handleStorageError('delete game save', error, { slotId });
   339|      throw error;
   340|    }
   341|  }, [state.saveSlots]);
   342|
   343|  // updateSettings зависит от state.settings
   344|  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
   345|    try {
   346|      const updated = { ...state.settings, ...newSettings };
   347|      dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
   348|
   349|      await retryAsync(
   350|        () => AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, , JSON.stringify(updated)),
   351|        { maxRetries: 3, delayMs: 500 }
   352|      );
   353|    } catch (error) {
   354|      ErrorHandler.handleStorageError('update settings', error, { newSettings });
   355|      throw error;
   356|    }
   357|  }, [state.settings]);
   358|
   359|  // addStory зависит от state.stories
   360|  const addStory = useCallback(async (story: Story) => {
   361|    try {
   362|      const exists = state.stories.find(s => s.id === story.id);
   363|      let updatedStories: Story[];
   364|      
   365|      if (exists) {
   366|        updatedStories = state.stories.map(s => s.id === story.id ? story : s);
   367|      } else {
   368|        updatedStories = [...state.stories, story];
   369|      }
   370|      
   371|      dispatch({ type: 'ADD_STORY', payload: story });
   372|      await AsyncStorage.setItem(STORAGE_KEYS.STORIES, , JSON.stringify(updatedStories));
   373|    } catch (error) {
   374|      console.error('Failed to add story:', error);
   375|    }
   376|  }, [state.stories]);
   377|
   378|  // deleteStory зависит от state.stories
   379|  const deleteStory = useCallback(async (storyId: string) => {
   380|    try {
   381|      const updatedStories = state.stories.filter((s) => s.id !== storyId);
   382|      dispatch({ type: 'DELETE_STORY', payload: storyId });
   383|      await AsyncStorage.setItem(STORAGE_KEYS.STORIES, , JSON.stringify(updatedStories));
   384|    } catch (error) {
   385|      console.error('Failed to delete story:', error);
   386|    }
   387|  }, [state.stories]);
   388|
   389|  // Optimize: Split state and functions to reduce re-renders
   390|  // State changes frequently, but functions are stable
   391|  const stateValue = useMemo(() => ({
   392|    stories: state.stories,
   393|    currentStory: state.currentStory,
   394|    playbackState: state.playbackState,
   395|    saveSlots: state.saveSlots,
   396|    settings: state.settings,
   397|  }), [
   398|    state.stories,
   399|    state.currentStory,
   400|    state.playbackState,
   401|    state.saveSlots,
   402|    state.settings,
   403|  ]);
   404|
   405|  // Functions are stable (wrapped in useCallback), so we can create this object once
   406|  const functionsValue = useMemo(() => ({
   407|    loadStories,
   408|    setCurrentStory,
   409|    updatePlaybackState,
   410|    saveGame,
   411|    autoSave,
   412|    loadGame,
   413|    deleteGame,
   414|    updateSettings,
   415|    addStory,
   416|    deleteStory,
   417|  }), [
   418|    loadStories,
   419|    setCurrentStory,
   420|    updatePlaybackState,
   421|    saveGame,
   422|    autoSave,
   423|    loadGame,
   424|    deleteGame,
   425|    updateSettings,
   426|    addStory,
   427|    deleteStory,
   428|  ]);
   429|
   430|  // Combine state and functions
   431|  const value: StoryContextType = useMemo(() => ({
   432|    ...stateValue,
   433|    ...functionsValue,
   434|  }), [stateValue, functionsValue]);
   435|
   436|  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
   437|}
   438|
   439|export function useStory() {
   440|  const context = useContext(StoryContext);
   441|  if (context === undefined) {
   442|    throw new Error('useStory must be used within a StoryProvider');
   443|  }
   444|  return context;
   445|}
   446|