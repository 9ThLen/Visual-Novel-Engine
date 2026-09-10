const characterPalette = [
  '#7c3aed',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#2563eb',
  '#4d7c0f',
];

export function characterColorForId(characterId: string): string {
  let hash = 0;
  for (let index = 0; index < characterId.length; index += 1) {
    hash = (hash * 31 + characterId.charCodeAt(index)) >>> 0;
  }
  return characterPalette[hash % characterPalette.length];
}
