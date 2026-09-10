import {
  __resetAppStateConflictForTests,
  hasAppStateConflict,
  reportAppStateConflict,
  subscribeToAppStateConflict,
} from '@/lib/app-store-conflict';

describe('the cross-tab conflict latch', () => {
  beforeEach(() => __resetAppStateConflictForTests());

  it('starts clear', () => {
    expect(hasAppStateConflict()).toBe(false);
  });

  it('tells every listener when a write is refused', () => {
    const seen: boolean[] = [];
    subscribeToAppStateConflict((value) => seen.push(value));
    subscribeToAppStateConflict((value) => seen.push(value));

    reportAppStateConflict();

    expect(seen).toEqual([true, true]);
    expect(hasAppStateConflict()).toBe(true);
  });

  // Every later write collides too; announcing each one would only repeat a
  // message the author is already looking at.
  it('announces only the first collision', () => {
    let calls = 0;
    subscribeToAppStateConflict(() => { calls += 1; });

    reportAppStateConflict();
    reportAppStateConflict();
    reportAppStateConflict();

    expect(calls).toBe(1);
  });

  // The banner may mount after the collision — a tab that lost the race while
  // the author was on another screen must still be told.
  it('tells a listener that subscribed too late', () => {
    reportAppStateConflict();

    const seen: boolean[] = [];
    subscribeToAppStateConflict((value) => seen.push(value));

    expect(seen).toEqual([true]);
  });

  it('stops telling a listener that unsubscribed', () => {
    let calls = 0;
    const unsubscribe = subscribeToAppStateConflict(() => { calls += 1; });
    unsubscribe();

    reportAppStateConflict();

    expect(calls).toBe(0);
  });

  // There is no safe way to merge two tabs' scene edits, so "reload" is the
  // only honest state to be in once this fires.
  it('does not clear itself', () => {
    reportAppStateConflict();
    expect(hasAppStateConflict()).toBe(true);
    reportAppStateConflict();
    expect(hasAppStateConflict()).toBe(true);
  });

  it('survives a listener that throws', () => {
    subscribeToAppStateConflict(() => { throw new Error('listener blew up'); });
    expect(() => reportAppStateConflict()).toThrow('listener blew up');
    // The latch is set before listeners run, so state stays consistent.
    expect(hasAppStateConflict()).toBe(true);
  });
});
