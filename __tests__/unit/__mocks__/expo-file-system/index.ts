// Mock for expo-file-system
const mockFiles: Record<string, string> = new Map();

export default {
  getInfoAsync: vi.fn().mockImplementation((uri: string) => {
    if (mockFiles.has(uri)) {
      return Promise.resolve({ exists: true, uri });
    }
    return Promise.resolve({ exists: false });
  }),
  readAsStringAsync: vi.fn().mockImplementation((uri: string) => {
    if (mockFiles.has(uri)) {
      return Promise.resolve(mockFiles.get(uri));
    }
    return Promise.reject(new Error('File not found'));
  }),
  writeAsStringAsync: vi.fn().mockImplementation((uri: string, content: string) => {
    mockFiles.set(uri, content);
    return Promise.resolve();
  }),
  deleteAsync: vi.fn().mockImplementation((uri: string) => {
    mockFiles.delete(uri);
    return Promise.resolve();
  }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  copyAsync: vi.fn().mockResolvedValue(undefined),
  moveAsync: vi.fn().mockResolvedValue(undefined),
  enumerateDirectoryAsync: vi.fn().mockResolvedValue([]),
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
};