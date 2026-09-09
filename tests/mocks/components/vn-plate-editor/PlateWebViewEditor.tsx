/**
 * Stands in for the Plate iframe editor.
 *
 * The real component builds a ~250KB HTML document and mounts an iframe, which
 * jsdom cannot run: its `flush()` waits on a message from that frame and never
 * settles, which silently hangs any save under test.
 *
 * `setPlateEditorFlushForTests` is the seam a test uses to make a frame refuse
 * to hand over its content — the only way to exercise a failed save.
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
    onChange?.(scene, characters ?? []);
  }, [characters, onChange, scene]);

  return null;
});

export default PlateWebViewEditor;
