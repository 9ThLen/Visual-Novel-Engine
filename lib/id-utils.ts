export function generateId(prefix: string, length = 7): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 2 + length)}`;
}

export function generateAssetId(): string {
  return `asset_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

export function generateStoryId(): string {
  return `story_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
