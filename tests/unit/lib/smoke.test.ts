import { conditionsMet, createEmptySceneState } from '@/lib/engine/conditionUtils';

describe('app smoke', () => {
  it('conditionUtils module loads', () => {
    expect(conditionsMet).toBeDefined();
    expect(createEmptySceneState).toBeDefined();
  });
});
