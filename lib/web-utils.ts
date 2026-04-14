/**
 * Web-Specific Utilities
 * Helper functions for web platform detection and features
 */

import { Platform, Dimensions } from 'react-native';

// ── Platform Detection ─────────────────────────────────────────────────────

/**
 * Check if running on web platform
 */
export function isWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Check if running on web with desktop screen size (>1024px)
 */
export function isWebDesktop(): boolean {
  if (!isWeb()) return false;
  const { width } = Dimensions.get('window');
  return width > 1024;
}

/**
 * Check if running on web with mobile screen size (<768px)
 */
export function isWebMobile(): boolean {
  if (!isWeb()) return false;
  const { width } = Dimensions.get('window');
  return width < 768;
}

/**
 * Check if running on web with tablet screen size (768-1024px)
 */
export function isWebTablet(): boolean {
  if (!isWeb()) return false;
  const { width } = Dimensions.get('window');
  return width >= 768 && width <= 1024;
}

// ── Keyboard Helpers ───────────────────────────────────────────────────────

/**
 * Check if the modifier key (Cmd on Mac, Ctrl on Windows/Linux) is pressed
 */
export function isModifierKey(event: KeyboardEvent): boolean {
  // On Mac, use metaKey (Cmd), on Windows/Linux use ctrlKey
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  return isMac ? event.metaKey : event.ctrlKey;
}

/**
 * Get the modifier key symbol for display (⌘ on Mac, Ctrl on Windows/Linux)
 */
export function getModifierKeySymbol(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const isMac = /Mac/.test(navigator.platform);
  return isMac ? '⌘' : 'Ctrl';
}

/**
 * Format keyboard shortcut for display
 * @example formatShortcut('s') => 'Ctrl+S' or '⌘S'
 */
export function formatShortcut(key: string, useShift = false): string {
  const modifier = getModifierKeySymbol();
  const shift = useShift ? '+Shift' : '';
  const separator = modifier === '⌘' ? '' : '+';
  return `${modifier}${shift}${separator}${key.toUpperCase()}`;
}

// ── File Handling ──────────────────────────────────────────────────────────

/**
 * Convert File object to data URI
 */
export async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert File object to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  const dataUri = await fileToDataUri(file);
  return dataUri.split(',')[1];
}

/**
 * Validate file type
 */
export function validateFileType(file: File, acceptedTypes: string[]): boolean {
  return acceptedTypes.some(type => {
    if (type.endsWith('/*')) {
      // Handle wildcards like 'image/*'
      const category = type.split('/')[0];
      return file.type.startsWith(category + '/');
    }
    return file.type === type;
  });
}

/**
 * Validate file size (in bytes)
 */
export function validateFileSize(file: File, maxSize: number): boolean {
  return file.size <= maxSize;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ── Drag & Drop Helpers ────────────────────────────────────────────────────

/**
 * Check if drag event contains files
 */
export function hasFiles(event: DragEvent): boolean {
  if (!event.dataTransfer) return false;
  return event.dataTransfer.types.includes('Files');
}

/**
 * Get files from drag event
 */
export function getFilesFromDragEvent(event: DragEvent): File[] {
  if (!event.dataTransfer) return [];
  return Array.from(event.dataTransfer.files);
}

/**
 * Prevent default drag behavior
 */
export function preventDefaultDrag(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

// ── Clipboard Helpers ──────────────────────────────────────────────────────

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isWeb()) return false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

/**
 * Read text from clipboard
 */
export async function readFromClipboard(): Promise<string | null> {
  if (!isWeb()) return null;

  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
    return null;
  } catch {
    return null;
  }
}

// ── Browser Detection ──────────────────────────────────────────────────────

/**
 * Get browser name
 */
export function getBrowserName(): string {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'unknown';
}

/**
 * Check if browser supports a feature
 */
export function supportsFeature(feature: 'clipboard' | 'dragdrop' | 'filereader'): boolean {
  if (!isWeb()) return false;

  switch (feature) {
    case 'clipboard':
      return typeof navigator !== 'undefined' && 'clipboard' in navigator;
    case 'dragdrop':
      return typeof window !== 'undefined' && 'FileReader' in window && 'File' in window;
    case 'filereader':
      return typeof window !== 'undefined' && 'FileReader' in window;
    default:
      return false;
  }
}

// ── Local Storage Helpers ──────────────────────────────────────────────────

/**
 * Check if localStorage is available
 */
export function hasLocalStorage(): boolean {
  if (!isWeb()) return false;

  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available storage space (approximate)
 */
export async function getStorageQuota(): Promise<{ used: number; total: number } | null> {
  if (!isWeb() || !('storage' in navigator) || !('estimate' in navigator.storage)) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      total: estimate.quota || 0,
    };
  } catch {
    return null;
  }
}
