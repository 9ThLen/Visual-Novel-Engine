const mockFn = () => {
  const fn = (...args: any[]) => (fn as any)._mock?.impl ? (fn as any)._mock.impl(...args) : undefined;
  fn.mockReturnValue = (v: any) => { (fn as any)._mock = { impl: () => v }; return fn; };
  fn.mockResolvedValue = (v: any) => { (fn as any)._mock = { impl: () => Promise.resolve(v) }; return fn; };
  fn.mockRejectedValue = (v: any) => { (fn as any)._mock = { impl: () => Promise.reject(v) }; return fn; };
  fn.mockImplementation = (impl: any) => { (fn as any)._mock = { impl }; return fn; };
  fn.mockReset = () => { delete (fn as any)._mock; };
  (fn as any).mock = { calls: [], results: [] };
  return fn;
};

const storeVal: any = {
  storiesMetadata: [],
  sceneRecordsByStory: {},
  sceneRecordHydration: {},
  currentStoryId: null,
  playbackState: null,
  saveSlots: [],
  settings: {},
  isLoaded: true,
  mediaLibrary: [],
  audioLibraries: {},
  characterLibraries: {},
  imageAssetIdsByStory: {},
  language: 'en',
  syncAutoSave: mockFn(),
  setLanguage: mockFn(),
  setMediaLibrary: mockFn(),
  setAudioLibrary: mockFn(),
  migrateFromLegacyKeys: mockFn(),
  createStorySnapshot: mockFn().mockResolvedValue(undefined),
};

export const persistAppStoreStateNow: any = mockFn().mockResolvedValue(undefined);

export const useAppStore: any = (selector?: (state: any) => any) =>
  selector ? selector(storeVal) : storeVal;

useAppStore.getState = () => storeVal;
useAppStore.setState = (v: any) => Object.assign(storeVal, typeof v === 'function' ? v(storeVal) : v);
useAppStore.subscribe = () => () => {};
useAppStore.persist = {
  hasHydrated: () => true,
  onFinishHydration: (_listener?: () => void) => () => {},
  clearStorage: () => {},
};

export const resetAppStoreState = () => {
  storeVal.storiesMetadata = [];
  storeVal.sceneRecordsByStory = {};
  storeVal.sceneRecordHydration = {};
  storeVal.imageAssetIdsByStory = {};
  storeVal.createStorySnapshot = mockFn().mockResolvedValue(undefined);
  persistAppStoreStateNow.mockResolvedValue(undefined);
  storeVal.currentStoryId = null;
  storeVal.playbackState = null;
  storeVal.saveSlots = [];
  storeVal.settings = {};
  storeVal.isLoaded = true;
  storeVal.mediaLibrary = [];
  storeVal.audioLibraries = {};
  storeVal.characterLibraries = {};
  storeVal.language = 'en';
  storeVal.syncAutoSave = mockFn();
  storeVal.setLanguage = mockFn();
  storeVal.setMediaLibrary = mockFn();
  storeVal.setAudioLibrary = mockFn();
  storeVal.migrateFromLegacyKeys = mockFn();
};

export const selectStoryMetadata = (storyId: string) => (state: any) =>
  state.storiesMetadata.find((story: any) => story.id === storyId);
export const selectCanonicalSceneRecord = (storyId: string, sceneId: string) => (state: any) =>
  state.sceneRecordsByStory[storyId]?.[sceneId];
export const selectReaderScene = (storyId: string, sceneId: string) => (state: any) => {
  const record = state.sceneRecordsByStory[storyId]?.[sceneId];
  if (!record) return null;
  return {
    id: record.id,
    storyId: record.storyId,
    name: record.name,
    timeline: record.timeline || [],
    sceneState: record.sceneState,
    connections: record.connections || [],
    isStart: !!record.isStart,
  };
};
export const selectReaderStartSceneId =
  (storyId: string, fallbackSceneId: string | null | undefined) => (state: any) => {
    const storyRecords = state.sceneRecordsByStory[storyId] || {};
    const fallback = fallbackSceneId && storyRecords[fallbackSceneId] ? fallbackSceneId : null;
    const startRecord = (Object.values(storyRecords) as any[]).find((record) => record.isStart);
    return startRecord?.id || fallback || fallbackSceneId;
  };
export const selectSceneRecordMapForStory = (storyId: string) => (state: any) =>
  state.sceneRecordsByStory[storyId] || {};
