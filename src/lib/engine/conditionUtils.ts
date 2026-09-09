import type { Condition } from './types';
import type { SceneState } from './runtime-types';

type VariableValue = string | number | boolean | string[];

function toComparable(a: string | number | boolean, b: string | number | boolean): [string | number, string | number] {
  const na = Number(a);
  const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return [na, nb];
  return [String(a), String(b)];
}

export function conditionsMet(
  conditions: Condition[] | undefined,
  variables: Record<string, VariableValue>,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const variableValue = variables[cond.variableName];

    switch (cond.operator) {
      case '==': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return a === b;
      }
      case '!=': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return a !== b;
      }
      case '>': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return typeof a === 'number' && typeof b === 'number' && a > b;
      }
      case '<': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return typeof a === 'number' && typeof b === 'number' && a < b;
      }
      case '>=': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return typeof a === 'number' && typeof b === 'number' && a >= b;
      }
      case '<=': {
        const [a, b] = toComparable(variableValue as string | number | boolean, cond.value);
        return typeof a === 'number' && typeof b === 'number' && a <= b;
      }
      case 'contains':
        return String(variableValue).includes(String(cond.value));
      case 'isEmpty':
        return variableValue === '' || variableValue === null || variableValue === undefined;
      case 'has':
        return Array.isArray(variableValue) && variableValue.includes(String(cond.value));
      case 'not_has':
        return !Array.isArray(variableValue) || !variableValue.includes(String(cond.value));
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
    soundEvents: [],
    cameraState: {
      action: 'reset',
      zoomLevel: 1,
      panX: 0,
      panY: 0,
      duration: 0,
      easing: 'linear',
    },
    interactiveObjects: [],
    musicTrackId: null,
    musicPlaying: false,
    musicMode: null,
    musicVolume: 1,
    musicLoop: true,
    musicFadeIn: 0,
    musicFadeOut: 0,
    musicBoundTo: 'continuous',
    musicAutoFadeAfter: undefined,
    variables: {},
    dialogueHistory: [],
    currentChoices: null,
    isTransitioning: false,
    transitionTarget: null,
    currentStepIndex: 0,
  };
}
