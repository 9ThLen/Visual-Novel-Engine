import type { Condition, SceneState } from './types';

function toComparable(a: string | number | boolean, b: string | number | boolean): [string | number, string | number] {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return [na, nb];
  return [String(a), String(b)];
}

export function conditionsMet(
  conditions: Condition[] | undefined,
  variables: Record<string, string | number | boolean>,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const variableValue = variables[cond.variableName];
    const [a, b] = toComparable(variableValue, cond.value);

    switch (cond.operator) {
      case '==':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return typeof a === 'number' && typeof b === 'number' && a > b;
      case '<':
        return typeof a === 'number' && typeof b === 'number' && a < b;
      case '>=':
        return typeof a === 'number' && typeof b === 'number' && a >= b;
      case '<=':
        return typeof a === 'number' && typeof b === 'number' && a <= b;
      case 'contains':
        return String(variableValue).includes(String(cond.value));
      case 'isEmpty':
        return variableValue === '' || variableValue === null || variableValue === undefined;
      default:
        return true;
    }
  });
}

export function createEmptySceneState(): SceneState {
  return {
    backgroundAssetId: null,
    backgroundTransition: 'fade',
    characters: [],
    activeEffects: [],
    musicTrackId: null,
    musicPlaying: false,
    musicVolume: 1,
    variables: {},
    dialogueHistory: [],
    currentChoices: null,
    isTransitioning: false,
    transitionTarget: null,
    currentStepIndex: 0,
  };
}
