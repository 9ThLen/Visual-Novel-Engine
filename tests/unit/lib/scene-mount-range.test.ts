import {
  computeActiveSceneId,
  computeMountDelta,
  seedMountedSceneIds,
  type SceneLayoutMap,
} from '@/lib/document-editor/scene-mount-range';

function layoutOf(entries: Record<string, { y: number; height: number }>): SceneLayoutMap {
  return new Map(Object.entries(entries));
}

describe('computeMountDelta', () => {
  it('does not mount every scene at once — only those within the mount lead', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const layout = layoutOf({
      a: { y: 0, height: 800 },
      b: { y: 800, height: 800 },
      c: { y: 1600, height: 800 },
      d: { y: 2400, height: 800 },
      e: { y: 3200, height: 800 },
    });

    const { toMount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(),
    });

    // mountLead = 2.5 * 800 = 2000, so viewBottom+lead = 800+2000 = 2800 -> a..d qualify, e does not
    expect(toMount.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves scenes with unknown layout untouched', () => {
    const order = ['a', 'b'];
    const layout = layoutOf({ a: { y: 0, height: 800 } });

    const { toMount, toUnmount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(),
    });

    expect(toMount).toEqual(['a']);
    expect(toUnmount).toEqual([]);
  });

  it('applies hysteresis: does not unmount a scene just outside the mount lead but still within the keep lead', () => {
    const order = ['a', 'b'];
    const layout = layoutOf({
      a: { y: 0, height: 800 },
      // sits beyond mountLead (1200) but within keepLead (2400) relative to viewport 0-800
      b: { y: 2100, height: 200 },
    });

    const { toMount, toUnmount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(['a', 'b']),
    });

    expect(toMount).toEqual([]);
    expect(toUnmount).toEqual([]);
  });

  it('unmounts scenes once they leave the keep lead', () => {
    const order = ['a', 'b'];
    const layout = layoutOf({
      a: { y: 0, height: 800 },
      b: { y: 5000, height: 200 }, // far beyond keepLead (2400) relative to viewport 0-800
    });

    const { toUnmount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(['a', 'b']),
    });

    expect(toUnmount).toEqual(['b']);
  });

  it('never unmounts mounted scenes that are no longer in order (branch switch must reset, not delta)', () => {
    // After a branch switch the old branch's scenes disappear from `order`.
    // computeMountDelta only iterates `order`, so stale mounted ids are left
    // untouched — the host must rebuild the mounted set via the reset path
    // (seedMountedSceneIds), not rely on incremental deltas.
    const order = ['a', 'branch_b_1'];
    const layout = layoutOf({
      a: { y: 0, height: 800 },
      branch_b_1: { y: 800, height: 800 },
    });

    const { toMount, toUnmount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(['a', 'branch_a_1', 'branch_a_2']),
    });

    expect(toMount).toEqual(['branch_b_1']);
    expect(toUnmount).toEqual([]);
  });

  it('does not re-mount a scene that is already mounted', () => {
    const order = ['a'];
    const layout = layoutOf({ a: { y: 0, height: 800 } });

    const { toMount } = computeMountDelta({
      order,
      layout,
      scrollY: 0,
      viewportHeight: 800,
      mounted: new Set(['a']),
    });

    expect(toMount).toEqual([]);
  });
});

describe('computeActiveSceneId', () => {
  it('picks the last scene whose top has scrolled past the lead offset', () => {
    const order = ['a', 'b', 'c'];
    const layout = layoutOf({
      a: { y: 0, height: 500 },
      b: { y: 500, height: 500 },
      c: { y: 1000, height: 500 },
    });

    expect(computeActiveSceneId({ order, layout, scrollY: 600, leadOffset: 80 })).toBe('b');
  });

  it('falls back to the first scene in order when nothing is laid out yet', () => {
    const order = ['a', 'b'];
    expect(computeActiveSceneId({ order, layout: new Map(), scrollY: 0 })).toBe('a');
  });

  it('does not flip active scene on tiny scroll jitter under the lead offset', () => {
    const order = ['a', 'b'];
    const layout = layoutOf({
      a: { y: 0, height: 800 },
      b: { y: 800, height: 800 },
    });

    expect(computeActiveSceneId({ order, layout, scrollY: 700, leadOffset: 80 })).toBe('a');
    expect(computeActiveSceneId({ order, layout, scrollY: 721, leadOffset: 80 })).toBe('b');
  });
});

describe('seedMountedSceneIds', () => {
  it('seeds the center scene plus neighbors within radius', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(seedMountedSceneIds(order, 'c', 1)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('clamps radius at the start and end of the list', () => {
    const order = ['a', 'b', 'c'];
    expect(seedMountedSceneIds(order, 'a', 2)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('falls back to the first scene when the center id is unknown', () => {
    const order = ['a', 'b'];
    expect(seedMountedSceneIds(order, 'missing', 2)).toEqual(new Set(['a']));
  });
});
