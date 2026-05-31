export const mockGetInfoAsync = vi.fn();
export const mockMakeDirectoryAsync = vi.fn();
export const mockCopyAsync = vi.fn();
export const mockReadAsStringAsync = vi.fn();
export const mockWriteAsStringAsync = vi.fn();

export default {};
export const documentDirectory = 'file:///documents/';
export const getInfoAsync = mockGetInfoAsync;
export const makeDirectoryAsync = mockMakeDirectoryAsync;
export const copyAsync = mockCopyAsync;
export const readAsStringAsync = mockReadAsStringAsync;
export const writeAsStringAsync = mockWriteAsStringAsync;
export const EncodingType = { Base64: 'base64' };
