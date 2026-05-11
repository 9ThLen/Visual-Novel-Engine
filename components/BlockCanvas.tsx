import React, { useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { Block } from '../lib/block-types';
import { flattenTree, updateBlockPosition } from '../lib/block-tree';

type CanvasBlock = { path: number[]; block: Block };

type Props = {
  root: Block;
  onRootChange: (root: Block) => void;
};

export const BlockCanvas: React.FC<Props> = ({ root, onRootChange }) => {
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blocks: CanvasBlock[] = flattenTree(root);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      const newX = dragging.origX + dx;
      const newY = dragging.origY + dy;
      // naive: update in a temporary localRoot via a drop event later
      // We'll just store temporary coordinates in a local state to preview
      // and apply persist when mouseup
      (dragging as any).tempX = newX;
      (dragging as any).tempY = newY;
      // Trigger re-render by forcing state update
      setDragging({ ...dragging, startX: dragging.startX, startY: dragging.startY } as any);
    };
    const onUp = () => {
      if (dragging) {
        // commit final coords
        const finalX = (dragging as any).tempX ?? dragging.origX;
        const finalY = (dragging as any).tempY ?? dragging.origY;
        // Update root with new position for the target id
        onRootChange(applyPositionToRoot(root, dragging.id, finalX, finalY));
        setDragging(null);
      }
    };
    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onUp as any);
    return () => {
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onUp as any);
    };
  }, [dragging, root, onRootChange]);

  function applyPositionToRoot(r: Block, id: string, x: number, y: number): Block {
    // simple traversal mutation using produce
    const next = { ...r } as Block;
    const stack: Block[] = [next];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur.id === id) {
        cur.x = x;
        cur.y = y;
        break;
      }
      cur.children?.forEach((c) => stack.push(c));
    }
    return next;
  }

  const startDrag = (ev: React.MouseEvent, block: Block) => {
    setDragging({ id: block.id, startX: ev.clientX, startY: ev.clientY, origX: block.x ?? 0, origY: block.y ?? 0 });
  };

  if (Platform.OS !== 'web') return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', height: 1200, width: '100%', border: '1px solid #ddd', borderRadius: 8, background: 'linear-gradient(#f7faff, #fff)', overflow: 'hidden' }}>
      {blocks.map(({ path, block }) => (
        <div key={block.id} onMouseDown={(e) => startDrag(e, block)} style={{ position: 'absolute', left: (block.x ?? 0), top: (block.y ?? 0), width: 200, padding: 8, border: '1px solid #ccc', borderRadius: 6, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.08)', cursor: 'move' }}>
          <div style={{ fontWeight: '700', fontSize: 12 }}>{block.type}</div>
          <div style={{ fontSize: 12, color: '#333' }}>{(block.data as Record<string, any>)?.text ?? (block.data as Record<string, any>)?.title ?? ''}</div>
        </div>
      ))}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none' }} />
    </div>
  );
};

export default BlockCanvas;
