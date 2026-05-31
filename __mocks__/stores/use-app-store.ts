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

const storeVal: any = { mediaLibrary: [], audioLibraries: {}, setMediaLibrary: mockFn(), setAudioLibrary: mockFn() };

export const useAppStore = {
  getState: () => storeVal,
  setState: (v: any) => Object.assign(storeVal, typeof v === 'function' ? v(storeVal) : v),
  subscribe: () => () => {},
  persist: { onFinishHydration: () => {}, clearStorage: () => {} },
};

export const resetAppStoreState = () => {
  storeVal.mediaLibrary = [];
  storeVal.audioLibraries = {};
  storeVal.setMediaLibrary = mockFn();
  storeVal.setAudioLibrary = mockFn();
};
