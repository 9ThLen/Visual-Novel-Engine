/**
 * Dragging tiles onto a folder — the drag a phone can actually have.
 *
 * jsdom has no touch system, so the responder's own config is driven directly:
 * the mocked `PanResponder.create` hands it back, and the test plays the part
 * of the finger with the coordinates it means.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { UNFILED_DROP_TARGET, useFolderDrag } from '@/hooks/use-folder-drag';

type ResponderConfig = {
  onMoveShouldSetPanResponder: (event: unknown, gesture: { dx: number; dy: number }) => boolean;
  onPanResponderGrant: (event: { nativeEvent: { pageX: number } }) => void;
  onPanResponderMove: (event: { nativeEvent: { pageX: number; pageY: number } }) => void;
  onPanResponderRelease: (event: { nativeEvent: { pageX: number; pageY: number } }) => void;
  onPanResponderTerminate: () => void;
};

/** A rail row that reports where it is, which is all the hook asks of one. */
function rowAt(x: number, y: number, width = 200, height = 40) {
  return {
    measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(x, y, width, height),
  } as unknown as React.ComponentRef<'div'> as never;
}

function setUp(onDrop = vi.fn(), enabled = true) {
  const { result } = renderHook(() => useFolderDrag(onDrop, enabled));
  act(() => {
    result.current.registerTarget('folder-1')(rowAt(0, 100));
    result.current.registerTarget(UNFILED_DROP_TARGET)(rowAt(0, 200));
  });
  const responder = result.current.createResponder(() => ['asset:a']) as unknown as {
    __config: ResponderConfig;
  };
  return { result, onDrop, config: responder.__config };
}

describe('claiming the touch', () => {
  // The grid scrolls vertically. A drag that claimed any movement would make
  // the library unscrollable, which is a worse loss than the feature is a win.
  it('takes a sideways drag and leaves a scroll alone', () => {
    const { config } = setUp();

    expect(config.onMoveShouldSetPanResponder({}, { dx: 40, dy: 4 })).toBe(true);
    expect(config.onMoveShouldSetPanResponder({}, { dx: 6, dy: 2 })).toBe(false);
    expect(config.onMoveShouldSetPanResponder({}, { dx: 30, dy: 40 })).toBe(false);
  });

  it('claims nothing where there is no rail to drop onto', () => {
    const { config } = setUp(vi.fn(), false);
    expect(config.onMoveShouldSetPanResponder({}, { dx: 40, dy: 4 })).toBe(false);
  });
});

describe('the drop', () => {
  it('files the carried keys into the row under the finger', () => {
    const { result, onDrop, config } = setUp();

    act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 300 } }));
    expect(result.current.dragging).toBe(true);

    act(() => config.onPanResponderMove({ nativeEvent: { pageX: 20, pageY: 110 } }));
    expect(result.current.hoveredTargetId).toBe('folder-1');

    act(() => config.onPanResponderRelease({ nativeEvent: { pageX: 20, pageY: 110 } }));
    expect(onDrop).toHaveBeenCalledWith(['asset:a'], 'folder-1');
    expect(result.current.dragging).toBe(false);
    expect(result.current.hoveredTargetId).toBeNull();
  });

  // The rail's "not in a folder" row is a real target: without it there is no
  // way to drag a file back out of a folder.
  it('reads the unfiled row as no folder at all', () => {
    const { onDrop, config } = setUp();

    act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 300 } }));
    act(() => config.onPanResponderRelease({ nativeEvent: { pageX: 20, pageY: 210 } }));

    expect(onDrop).toHaveBeenCalledWith(['asset:a'], null);
  });

  it('files nothing when the finger lets go over open grid', () => {
    const { result, onDrop, config } = setUp();

    act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 300 } }));
    act(() => config.onPanResponderMove({ nativeEvent: { pageX: 600, pageY: 400 } }));
    expect(result.current.hoveredTargetId).toBeNull();

    act(() => config.onPanResponderRelease({ nativeEvent: { pageX: 600, pageY: 400 } }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  // A call or a notification takes the gesture back; the grid must not be left
  // looking like something is still in the air.
  it('puts everything down when the system takes the gesture', () => {
    const { result, onDrop, config } = setUp();

    act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 300 } }));
    act(() => config.onPanResponderTerminate());

    expect(result.current.dragging).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('carries nothing when the touch began on no tile', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFolderDrag(onDrop, true));
    act(() => { result.current.registerTarget('folder-1')(rowAt(0, 100)); });
    const config = (result.current.createResponder(() => null) as unknown as {
      __config: ResponderConfig;
    }).__config;

    act(() => config.onPanResponderGrant({ nativeEvent: { pageX: 300 } }));
    expect(result.current.dragging).toBe(false);

    act(() => config.onPanResponderRelease({ nativeEvent: { pageX: 20, pageY: 110 } }));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
