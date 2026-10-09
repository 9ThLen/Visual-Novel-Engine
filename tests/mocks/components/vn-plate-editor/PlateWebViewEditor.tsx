/**
 * Stands in for the Plate iframe editor.
 *
 * The real component builds a ~250KB HTML document and mounts an iframe, which
 * jsdom cannot run: its `flush()` waits on a message from that frame and never
 * settles, which silently hangs any save under test.
 *
 * `setPlateEditorFlushForTests` is the seam a test uses to make a frame refuse
 * to hand over its content — the only way to exercise a failed save.
 *
 * `plateEditorFramesForTests` records each frame as it is built. A real frame
 * takes its content once, at load, so "the frame was rebuilt" is the only way
 * new content can have reached it — and the thing a test has to observe.
 */
import React from 'react';

export interface PlateWebViewEditorSnapshot {
  scene: { sceneId: string; name?: string; blocks: unknown[] };
  characters: unknown[];
}

export interface PlateWebViewEditorHandle {
  flush: () => Promise<PlateWebViewEditorSnapshot>;
  formatText: (command: string, value?: unknown) => void;
  undo: () => void;
  redo: () => void;
}

type FlushImpl = (scene: PlateWebViewEditorSnapshot['scene']) => Promise<PlateWebViewEditorSnapshot>;

const defaultFlush: FlushImpl = async (scene) => ({ scene, characters: [] });

let flushImpl: FlushImpl = defaultFlush;

/** Pass nothing to restore the default: a frame that flushes cleanly. */
export function setPlateEditorFlushForTests(impl?: FlushImpl): void {
  flushImpl = impl ?? defaultFlush;
}

export interface PlateEditorFrameForTests {
  sceneId: string;
  /** The scene the frame was built from, which is all a real frame ever shows. */
  builtFrom: PlateWebViewEditorSnapshot['scene'];
  /** Report an edit to the host, as a frame does after the author types. */
  reportEdit: (scene: PlateWebViewEditorSnapshot['scene']) => void;
}

let builtFrames: PlateEditorFrameForTests[] = [];
let reportsOnMount = true;

/**
 * Every frame built since the last reset, oldest first.
 *
 * By default a frame reports its scene as soon as it mounts, which marks the
 * scene dirty so a save has something to flush. Pass `reportsOnMount: false`
 * for a frame that stays quiet until the test calls `reportEdit` — the only way
 * to have a clean editor, which is what an external write normally meets.
 */
export function resetPlateEditorFramesForTests(options: { reportsOnMount?: boolean } = {}): void {
  builtFrames = [];
  reportsOnMount = options.reportsOnMount ?? true;
}

export function plateEditorFramesForTests(sceneId?: string): PlateEditorFrameForTests[] {
  return sceneId ? builtFrames.filter((frame) => frame.sceneId === sceneId) : [...builtFrames];
}

export function getMinFrameHeight(isPhone: boolean): number {
  return isPhone ? 640 : 760;
}

export const PlateWebViewEditor = React.forwardRef(function PlateWebViewEditorStub(
  props: Record<string, unknown>,
  ref: unknown,
) {
  const scene = props.scene as PlateWebViewEditorSnapshot['scene'];
  React.useImperativeHandle(ref as never, () => ({
    flush: () => flushImpl(scene),
    formatText: () => {},
    undo: () => {},
    redo: () => {},
  }), [scene]);

  // The real editor reports edits as (scene, characters); mirroring that shape
  // is what marks the scene dirty so a save has something to flush.
  const onChange = props.onChange as ((scene: unknown, characters: unknown[]) => void) | undefined;
  const characters = props.characters as unknown[] | undefined;
  React.useEffect(() => {
    if (reportsOnMount) onChange?.(scene, characters ?? []);
  }, [characters, onChange, scene]);

  const latest = React.useRef({ onChange, characters });
  latest.current = { onChange, characters };
  React.useEffect(() => {
    builtFrames.push({
      sceneId: scene.sceneId,
      builtFrom: scene,
      reportEdit: (edited) => latest.current.onChange?.(edited, latest.current.characters ?? []),
    });
    // Once per frame: the scene a frame was built from is fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
});

export default PlateWebViewEditor;
