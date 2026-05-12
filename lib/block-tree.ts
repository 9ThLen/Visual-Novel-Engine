import { Block } from './block-types';
import { produce } from 'immer';
import { ROOT_BLOCK } from './block-types';

export type Path = number[];

export function flattenTree(root: Block, prefix: Path = []): Array<{ path: Path; block: Block }> {
  const result: Array<{ path: Path; block: Block }> = [];

  function flatten(block: Block, path: Path) {
    // Clone path only when storing in result
    result.push({ path: [...path], block });

    // Mutate path in-place during traversal
    block.children.forEach((child, idx) => {
      path.push(idx);
      flatten(child, path);
      path.pop(); // Restore path after recursion
    });
  }

  flatten(root, [...prefix]);
  return result;
}

export function updateBlockPosition(root: Block, id: string, x: number, y: number): Block {
  return produce(root, (draft: any) => {
    const update = (node: any) => {
      if (!node) return false;
      if (node.id === id) {
        node.x = x;
        node.y = y;
        return true;
      }
      if (Array.isArray(node.children)) {
        for (const c of node.children) {
          if (update(c)) return true;
        }
      }
      return false;
    };
    update(draft);
  });
}

function navigatePath(draft: Block, path: Path): Block | undefined {
  let cur: Block | undefined = draft;
  for (let i = 0; i < path.length; i++) {
    if (!cur || !cur.children) return undefined;
    cur = cur.children[path[i]];
  }
  return cur;
}

export function addBlockAtPath(root: Block, parentPath: Path, block: Block): Block {
  return produce(root, draft => {
    const parent = parentPath.length === 0 ? draft : navigatePath(draft, parentPath);
    if (!parent) return;
    parent.children = [...parent.children, block];
  });
}

export function addBlockAfterPath(root: Block, path: Path, block: Block): Block {
  return produce(root, draft => {
    if (path.length === 0) {
      // Add to root level
      draft.children.push(block);
      return;
    }
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    const parent = parentPath.length === 0 ? draft : navigatePath(draft, parentPath);
    if (!parent) return;
    parent.children.splice(idx + 1, 0, block);
  });
}

export function insertBlockAtIndex(root: Block, parentPath: Path, index: number, block: Block): Block {
  return produce(root, draft => {
    const parent = parentPath.length === 0 ? draft : navigatePath(draft, parentPath);
    if (!parent) return;
    parent.children.splice(index, 0, block);
  });
}

export function deleteBlockAtPath(root: Block, path: Path): Block {
  return produce(root, draft => {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const idxToDelete = path[path.length - 1];
    const parent = parentPath.length === 0 ? draft : navigatePath(draft, parentPath);
    if (!parent) return;
    parent.children.splice(idxToDelete, 1);
  });
}

export function toggleCollapse(root: Block, path: Path): Block {
  return produce(root, draft => {
    const node = navigatePath(draft, path);
    if (node) node.collapsed = !node.collapsed;
  });
}

export function updateBlockData(root: Block, path: Path, data: Record<string, any>): Block {
  return produce(root, draft => {
    const node = navigatePath(draft, path);
    if (node) node.data = { ...node.data, ...data };
  });
}

export function duplicateBlock(root: Block, path: Path): Block {
  const blockToDup = navigatePath(root, path);
  if (!blockToDup) return root;
  const clone = JSON.parse(JSON.stringify(blockToDup)) as Block;
  const reId = (b: Block) => {
    b.id = `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    b.children.forEach(reId);
  };
  reId(clone);
  return addBlockAfterPath(root, path, clone);
}

export function moveBlock(root: Block, fromPath: Path, toPath: Path): Block {
  let moved: Block | undefined;
  const afterRemoval = deleteBlockAtPath(root, fromPath);
  const sourceParentPath = fromPath.slice(0, -1);
  const sourceIdx = fromPath[fromPath.length - 1];
  const srcParent = sourceParentPath.length === 0 ? root : navigatePath(root, sourceParentPath);
  if (srcParent) {
    moved = srcParent.children[sourceIdx];
  }
  if (!moved) return root;
  return produce(afterRemoval, draft => {
    let destParentPath: Path = [];
    if (toPath.length === 0) {
      destParentPath = [];
    } else {
      const target = navigatePath(draft, toPath);
      if (target) {
        destParentPath = toPath;
      } else {
        destParentPath = toPath.slice(0, -1);
      }
    }
    const destParent = destParentPath.length === 0 ? draft : navigatePath(draft, destParentPath);
    if (destParent) {
      destParent.children = [...destParent.children, moved!];
    }
  });
}

export function insertSnippetAtPath(root: Block, parentPath: Path, snippet: Block): Block {
  return addBlockAtPath(root, parentPath, snippet);
}

export function addChildBlock(root: Block, parentPath: Path, block: Block): Block {
  return addBlockAtPath(root, parentPath, block);
}

export function getBlockAtPath(root: Block, path: Path): Block | undefined {
  return navigatePath(root, path);
}

export function findBlockById(root: Block, id: string, path: Path = []): { block: Block | null; path: Path } {
  if (root.id === id) return { block: root, path: [...path] };
  for (let i = 0; i < root.children.length; i++) {
    path.push(i);
    const result = findBlockById(root.children[i], id, path);
    if (result.block) return result;
    path.pop();
  }
  return { block: null, path: [] };
}

