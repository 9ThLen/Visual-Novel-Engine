import type { CharacterPosition } from '@/lib/character-types';

/**
 * Horizontal centre of every character slot, as a fraction of the display
 * width. CharacterDisplay places sprites at these fractions and the camera
 * focuses on them with the same numbers, so they have to be one definition:
 * two copies that drift would make `/camera focus` frame the wrong spot.
 */
export const CHARACTER_POSITION_CENTER_FRACTION: Record<CharacterPosition, number> = {
  'far-left': 0.1,
  left: 0.25,
  center: 0.5,
  right: 0.75,
  'far-right': 0.9,
};

export function characterPositionCenterFraction(position: string | null | undefined): number {
  const fraction = CHARACTER_POSITION_CENTER_FRACTION[position as CharacterPosition];
  return typeof fraction === 'number' ? fraction : CHARACTER_POSITION_CENTER_FRACTION.center;
}
