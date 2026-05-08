import React, { useState, useCallback } from 'react';
import { Block } from '../lib/block-types';
import BlockNode from './BlockNode';
import { addBlockAtPath, deleteBlockAtPath, toggleCollapse, moveBlock, insertSnippetAtPath } from '../lib/block-tree';
import { Path } from '../lib/block-tree';
import { ROOT_BLOCK } from '../lib/block-types';

type Props = {
  root: Block;
  onChange?: (root: Block) => void;
};

export const BlockTreeEditor: React.FC<Props> = ({ root, onChange }) => {
  const [localRoot, setLocalRoot] = useState<Block>(root ?? ROOT_BLOCK);

  const replaceRoot = useCallback((next: Block) => {
    setLocalRoot(next);
    onChange?.(next);
  }, [onChange]);

  // Mutation helpers (IMMUTABLE)
  const addBlock = (parentPath: Path, afterIndex: number, block: Block) => {
    const next = addBlockAtPath(localRoot, parentPath, block);
    replaceRoot(next);
  };
  const deleteBlock = (path: Path) => {
    const next = deleteBlockAtPath(localRoot, path);
    replaceRoot(next);
  };
  const collapseBlock = (path: Path) => {
    const next = toggleCollapse(localRoot, path);
    replaceRoot(next);
  };
  const moveBlockBtn = (fromPath: Path, toPath: Path) => {
    const next = moveBlock(localRoot, fromPath, toPath);
    replaceRoot(next);
  };
  const insertSnippet = (parentPath: Path, snippet: Block) => {
    const next = insertSnippetAtPath(localRoot, parentPath, snippet);
    replaceRoot(next);
  };

  // Add a small helper to insert a child for the root level using the clipboard-like approach
  const addChild = (parentPath: Path) => {
    const newBlock: Block = { id: `block_${Date.now()}`, type: 'narration', data: { text: 'New block' }, children: [] };
    const next = addBlockAtPath(localRoot, parentPath, newBlock);
    replaceRoot(next);
  };

  return (
    <div className="block-tree-editor" style={{ padding: 16 }}>
      {localRoot?.children?.length ? (
        localRoot.children.map((b, idx) => (
          <BlockNode key={b.id} block={b} path={[idx]} depth={1} onDropBlock={(src, dst) => moveBlockBtn(src, dst)} onAddChild={(p) => addChild(p)} />
        ))
      ) : (
        <div style={{ opacity: 0.6 }}>No blocks yet. Use the + button to add.</div>
      )}
    </div>
  );
};

export default BlockTreeEditor;

