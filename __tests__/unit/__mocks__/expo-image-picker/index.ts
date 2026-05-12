// Mock for expo-image-picker
export const ImagePicker = {
  getDocumentAsync: vi.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///mock/image.png', name: 'test.png' }],
  }),
  getCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  getMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
};

export default ImagePicker;