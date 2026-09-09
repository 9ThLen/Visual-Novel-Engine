import { validateStoryGraph } from '../../../scripts/lib/validate-story-graph.mjs';

describe('validateStoryGraph', () => {
  it('accepts valid canonical links, including cycles', () => {
    expect(validateStoryGraph({
      startSceneId: 'a',
      scenes: {
        a: { connections: [{ targetSceneId: 'b' }] },
        b: { timeline: [{ data: { targetSceneId: 'a' } }] },
      },
    })).toEqual([]);
  });

  it('reports a missing start scene', () => {
    expect(validateStoryGraph({
      startSceneId: 'missing',
      scenes: { a: {} },
    })).toContain('startSceneId "missing" does not exist');
  });

  it('reports canonical and legacy dangling targets with their paths', () => {
    const problems = validateStoryGraph({
      startSceneId: 'a',
      scenes: {
        a: {
          connections: [{ targetSceneId: 'missing-canonical' }],
          choices: [{ nextSceneId: 'missing-legacy' }],
        },
      },
    });

    expect(problems).toEqual(expect.arrayContaining([
      'scenes.a.connections[0].targetSceneId references missing scene "missing-canonical"',
      'scenes.a.choices[0].nextSceneId references missing scene "missing-legacy"',
    ]));
  });
});
