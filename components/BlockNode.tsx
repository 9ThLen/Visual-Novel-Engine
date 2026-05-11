import React from 'react';
import { Block } from '../lib/block-types';
import { Path } from '../lib/block-tree';

type Props = {
  block: Block;
  path: Path;
  depth?: number;
  onMove?: (fromPath: Path, toPath: Path) => void;
  onDropBlock?: (sourcePath: Path, targetPath: Path) => void;
  onAddChild?: (parentPath: Path) => void;
};

// Minimal inline styles; could be moved to CSS/SCSS for web
const basePadding = 16;
const typeColors: Record<string, string> = {
  text: '#e8f0fe',
  group: '#eef7ff',
  condition: '#f0f7ed',
  action: '#f9f0ff',
  snippet: '#fff5e6',
};

export const BlockNode: React.FC<Props> = ({ block, path, depth = 0, onMove, onDropBlock, onAddChild }) => {
  const paddingLeft = depth * 20 + basePadding;
  const blockStyle: React.CSSProperties = {
    padding: 12,
    paddingLeft,
    borderRadius: 8,
    margin: '6px 0',
    background: typeColors[block.type] || '#fff',
    border: '1px solid #ddd',
    position: 'relative',
  };
  const headerStyle: React.CSSProperties = {
    fontWeight: '600',
    marginBottom: 6,
  };

  // Drag handlers (HTML5-safe on web; on RN web this will map to div events)
  const handleDragStart = (e: React.DragEvent) => {
    const payload = { path, id: block.id };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    // Prevent click bubbling during drag
    e.stopPropagation();
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('application/json');
    try {
      const payload = JSON.parse(raw);
      if (payload && onDropBlock) {
        // Treat as drop onto this block: move to this block's path after it
        const sourcePath: Path = payload.path;
        const targetPath: Path = path;
        onDropBlock(sourcePath, targetPath);
      }
    } catch {
      // ignore
    }
  };

  const hasChildren = block.children && block.children.length > 0;
  return (
    <div
      className={`block-node block-${block.type}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={blockStyle}
    >
      {hasChildren && (
        <div className="connector-vert" style={{ position: 'absolute', left: paddingLeft - 6, top: 0, bottom: 0, width: 2, background: '#ddd' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={headerStyle}>{block.type.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: '#555' }}>{block.collapsed ? '+' : '-'}</span>
        <button onClick={(e) => { e.stopPropagation(); onAddChild?.(path); }} style={{ padding: '4px 6px', marginLeft: 6 }}>＋</button>
      </div>
      {/* Content preview, simplified */}
      <div style={{ minHeight: 20 }}>
        {(block.data as Record<string, any>)?.text ?? (block.data as Record<string, any>)?.title ?? ''}
      </div>

      {/* Render children recursively */}
      {block.children && block.children.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {block.children.map((child, idx) => (
            <BlockNode
              key={child.id}
              block={child}
              path={[...path, idx]}
              depth={depth + 1}
              onDropBlock={onDropBlock}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BlockNode;
