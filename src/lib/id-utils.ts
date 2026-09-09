/**
 * Generate a cryptographically secure random ID.
 * Uses crypto.getRandomValues() with Math.random() fallback for environments without crypto.
 */

function getRandomBytes(length: number): string {
  // Use crypto.getRandomValues() if available (modern browsers, Node 19+, React Native with polyfill)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, length);
  }
  // Fallback for older environments
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 36).toString(36);
  }
  return result;
}

export function generateId(prefix: string, length = 7): string {
  return `${prefix}_${Date.now()}_${getRandomBytes(length)}`;
}

export function generateAssetId(): string {
  return `asset_${Date.now()}_${getRandomBytes(6)}`;
}

export function generateStoryId(): string {
  return `story_${Date.now()}_${getRandomBytes(5)}`;
}
