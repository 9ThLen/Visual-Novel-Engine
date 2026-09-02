/**
 * Dragging files onto a folder in the rail.
 *
 * The web can already take files dropped from a folder on the desktop; a phone
 * cannot, and nothing Expo exposes will change that — receiving a system drag
 * is `UIDropInteraction` on iOS and a drag listener on Android, neither of
 * which React Native surfaces. What a phone *can* do is the drag that matters
 * once the files are already here: pick a tile up and put it in a folder.
 *
 * Built on `PanResponder` from React Native itself rather than a gesture
 * library, for two reasons: it is already there, and it can decline a gesture.
 * The grid scrolls vertically, so a drag only claims the touch once it has
 * travelled sideways — a scroll and a tap both still reach the list.
 *
 * Targets are measured when a drag starts rather than when they lay out: the
 * rail scrolls too, and a rectangle remembered from before that scroll files
 * things into the wrong folder.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance, type View } from 'react-native';

/** How far sideways before a touch is a drag rather than a scroll or a tap. */
const CLAIM_DISTANCE = 14;
/** And how much more sideways than downward, so a diagonal scroll still scrolls. */
const CLAIM_RATIO = 1.4;

/** The rail's "not in a folder" row, which is a real target like any other. */
export const UNFILED_DROP_TARGET = 'unfiled';

interface Rect { x: number; y: number; width: number; height: number }

export interface FolderDrag {
  /** Ref callback for a rail row that files things. */
  registerTarget: (targetId: string) => (node: View | null) => void;
  /** The row under the finger, so the rail can show where the files would land. */
  hoveredTargetId: string | null;
  /** True while a drag is in flight, so tiles can lift. */
  dragging: boolean;
  /** One responder per grid row; the row decides which tile the touch began on. */
  createResponder: (resolveKeys: (touchX: number) => string[] | null) => PanResponderInstance;
}

export function useFolderDrag(
  onDrop: (keys: string[], folderId: string | null) => void,
  enabled = true,
): FolderDrag {
  const nodes = useRef(new Map<string, View>());
  const rects = useRef(new Map<string, Rect>());
  const carried = useRef<string[] | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const registerTarget = useCallback((targetId: string) => (node: View | null) => {
    if (node) nodes.current.set(targetId, node);
    else nodes.current.delete(targetId);
  }, []);

  const measureTargets = useCallback(() => {
    rects.current.clear();
    for (const [targetId, node] of nodes.current) {
      node.measureInWindow?.((x, y, width, height) => {
        rects.current.set(targetId, { x, y, width, height });
      });
    }
  }, []);

  const targetAt = useCallback((x: number, y: number) => {
    for (const [targetId, rect] of rects.current) {
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
        return targetId;
      }
    }
    return null;
  }, []);

  const finish = useCallback(() => {
    carried.current = null;
    setHoveredTargetId(null);
    setDragging(false);
  }, []);

  const createResponder = useCallback((resolveKeys: (touchX: number) => string[] | null) =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => {
        if (!enabled) return false;
        return Math.abs(gesture.dx) > CLAIM_DISTANCE
          && Math.abs(gesture.dx) > Math.abs(gesture.dy) * CLAIM_RATIO;
      },
      onPanResponderGrant: (event) => {
        // `pageX` of the touch that started it, not of the row: which tile is
        // under the finger is the only thing the row cannot know by itself.
        const keys = resolveKeys(event.nativeEvent.pageX);
        if (!keys?.length) return;
        carried.current = keys;
        measureTargets();
        setDragging(true);
      },
      onPanResponderMove: (event) => {
        if (!carried.current) return;
        const next = targetAt(event.nativeEvent.pageX, event.nativeEvent.pageY);
        setHoveredTargetId((current) => (current === next ? current : next));
      },
      onPanResponderRelease: (event) => {
        const keys = carried.current;
        const targetId = keys ? targetAt(event.nativeEvent.pageX, event.nativeEvent.pageY) : null;
        if (keys && targetId) {
          onDrop(keys, targetId === UNFILED_DROP_TARGET ? null : targetId);
        }
        finish();
      },
      // A drag the system takes back — a call, a notification — must not leave
      // the grid looking like something is still in the air.
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => true,
    }),
  [enabled, finish, measureTargets, onDrop, targetAt]);

  return useMemo(
    () => ({ registerTarget, hoveredTargetId, dragging, createResponder }),
    [createResponder, dragging, hoveredTargetId, registerTarget],
  );
}
