const CHARACTER_COLORS = [
  '#A78BFA',
  '#F472B6',
  '#60A5FA',
  '#34D399',
  '#FBBF24',
  '#FB7185',
  '#38BDF8',
  '#C084FC',
];

export function getCharacterColor(name: string): string {
  const normalized = name.trim().toLowerCase();
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  return CHARACTER_COLORS[hash % CHARACTER_COLORS.length];
}
