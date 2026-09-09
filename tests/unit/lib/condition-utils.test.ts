import type { Condition } from '@/lib/engine/types';
import { conditionsMet } from '@/lib/engine/conditionUtils';

const noConditions: Condition[] = [];

const eqCondition: Condition[] = [{ variableName: 'x', operator: '==', value: 5 }];
const neqCondition: Condition[] = [{ variableName: 'x', operator: '!=', value: 3 }];
const gtCondition: Condition[] = [{ variableName: 'x', operator: '>', value: 5 }];
const ltCondition: Condition[] = [{ variableName: 'x', operator: '<', value: 5 }];
const gteCondition: Condition[] = [{ variableName: 'x', operator: '>=', value: 5 }];
const lteCondition: Condition[] = [{ variableName: 'x', operator: '<=', value: 5 }];
const hasCondition: Condition[] = [{ variableName: 'items', operator: 'has', value: 'sword' }];
const notHasCondition: Condition[] = [{ variableName: 'items', operator: 'not_has', value: 'shield' }];

const eqConditionFailed: Condition[] = [{ variableName: 'x', operator: '==', value: 3 }];
const conditionOnDifferentVar: Condition[] = [{ variableName: 'y', operator: '==', value: 5 }];
const multipleConditionsAllMet: Condition[] = [
  { variableName: 'x', operator: '==', value: 5 },
  { variableName: 'level', operator: '>=', value: 10 },
];
const multipleConditionsOneFailed: Condition[] = [
  { variableName: 'x', operator: '==', value: 5 },
  { variableName: 'level', operator: '>=', value: 100 },
];
const multipleConditionsNoneMet: Condition[] = [
  { variableName: 'x', operator: '==', value: 3 },
  { variableName: 'level', operator: '>=', value: 100 },
];
const hasConditionNoVar: Condition[] = [{ variableName: 'items', operator: 'has', value: 'potion' }];
const notHasConditionMissing: Condition[] = [{ variableName: 'items', operator: 'not_has', value: 'bomb' }];

const variables = { x: 5, level: 10, items: ['sword', 'shield'] };

describe('conditionsMet', () => {
  it('returns true for empty conditions array', () => {
    expect(conditionsMet(noConditions, variables)).toBe(true);
  });

  it('evaluates == operator correctly (true)', () => {
    expect(conditionsMet(eqCondition, variables)).toBe(true);
  });

  it('evaluates == operator correctly (false)', () => {
    expect(conditionsMet(eqConditionFailed, variables)).toBe(false);
  });

  it('evaluates != operator correctly (true)', () => {
    expect(conditionsMet(neqCondition, variables)).toBe(true);
  });

  it('evaluates != operator correctly (false)', () => {
    expect(conditionsMet([{ variableName: 'x', operator: '!=', value: 5 }], variables)).toBe(false);
  });

  it('evaluates > operator correctly (true)', () => {
    expect(conditionsMet(gtCondition, variables)).toBe(false);
  });

  it('evaluates > operator correctly (false)', () => {
    expect(conditionsMet([{ variableName: 'x', operator: '>', value: 3 }], variables)).toBe(true);
  });

  it('evaluates < operator correctly (true)', () => {
    expect(conditionsMet(ltCondition, variables)).toBe(false);
  });

  it('evaluates < operator correctly (false)', () => {
    expect(conditionsMet([{ variableName: 'x', operator: '<', value: 10 }], variables)).toBe(true);
  });

  it('evaluates >= operator correctly (true)', () => {
    expect(conditionsMet(gteCondition, variables)).toBe(true);
  });

  it('evaluates >= operator correctly (false)', () => {
    expect(conditionsMet([{ variableName: 'x', operator: '>=', value: 6 }], variables)).toBe(false);
  });

  it('evaluates <= operator correctly (true)', () => {
    expect(conditionsMet(lteCondition, variables)).toBe(true);
  });

  it('evaluates <= operator correctly (false)', () => {
    expect(conditionsMet([{ variableName: 'x', operator: '<=', value: 4 }], variables)).toBe(false);
  });

  it('evaluates has operator correctly (true)', () => {
    expect(conditionsMet(hasCondition, variables)).toBe(true);
  });

  it('evaluates has operator correctly (false)', () => {
    expect(conditionsMet(hasConditionNoVar, variables)).toBe(false);
  });

  it('evaluates not_has operator correctly (true)', () => {
    expect(conditionsMet(notHasCondition, variables)).toBe(false);
  });

  it('evaluates not_has operator correctly (false)', () => {
    expect(conditionsMet(notHasConditionMissing, variables)).toBe(true);
  });

  it('checks a different variable', () => {
    expect(conditionsMet(conditionOnDifferentVar, variables)).toBe(false);
  });

  it('evaluates AND of multiple conditions (all met)', () => {
    expect(conditionsMet(multipleConditionsAllMet, variables)).toBe(true);
  });

  it('evaluates AND of multiple conditions (one failed)', () => {
    expect(conditionsMet(multipleConditionsOneFailed, variables)).toBe(false);
  });

  it('evaluates AND of multiple conditions (none met)', () => {
    expect(conditionsMet(multipleConditionsNoneMet, variables)).toBe(false);
  });
});
