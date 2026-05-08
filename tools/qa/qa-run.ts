import { Block } from '../../lib/block-types';
import { addBlockAtPath, deleteBlockAtPath, toggleCollapse, moveBlock, insertSnippetAtPath, Path } from '../../lib/block-tree';

function logTree(root: Block, label: string) {
  const serialize = JSON.stringify(root, null, 2);
  console.log(`--- ${label} ---`);
  console.log(serialize);
}

export function runQa(): void {
  // Initial root with two children
  const root: Block = {
    id: 'root',
    type: 'group',
    data: { title: 'Root' },
    collapsed: false,
    children: [
      { id: 'a1', type: 'narration', data: { text: 'First' }, children: [] },
      { id: 'b1', type: 'group', data: { title: 'Child Group' }, collapsed: false, children: [] }
    ],
  };

  logTree(root, 'Initial tree');

  // 1) Add a new text block to root
  const added = addBlockAtPath(root, [0], { id: 'a2', type: 'narration', data: { text: 'Added after first' }, children: [] });
  logTree(added, 'After addBlockAtPath([0], a2)');

  // 2) Toggle collapse on group b1
  const collapsed = toggleCollapse(added, [1]);
  logTree(collapsed, 'After toggleCollapse([1])');

  // 3) Delete first child (a1)
  const afterDelete = deleteBlockAtPath(collapsed, [0]);
  logTree(afterDelete, 'After deleteBlockAtPath([0])');

  // 4) Move last child (a2) into root[0] (as child of a1?) - demonstration of move
  // We'll move a2 (which is at path [0] in 'afterDelete') to path [1] (as child of b1)
  const afterMove = moveBlock(afterDelete, [0], [1]);
  logTree(afterMove, 'After moveBlock(from [0] to [1])');

  // 5) Insert a snippet at path [0]
  const snippet: Block = { id: 'snip1', type: 'group', data: { text: 'Snippet' }, children: [] };
  const withSnippet = insertSnippetAtPath(afterMove, [0], snippet);
  logTree(withSnippet, 'After insertSnippetAtPath([0], snippet)');
}

// If ran directly with ts-node, execute
if (require.main === module) {
  runQa();
}

