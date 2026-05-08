import { describe, it, expect } from 'vitest';
import { Block } from '../../lib/block-types';
import { addBlockAtPath, deleteBlockAtPath, toggleCollapse, moveBlock, insertSnippetAtPath } from '../../lib/block-tree';

// Helper to create test blocks
const makeBlock = (id: string, type: Block['type'], data: Record<string, unknown> = {}, children: Block[] = []): Block => ({
  id,
  type,
  data,
  children,
  collapsed: false,
});

describe('Block Tree operations', () => {
  it('adds a block at path (root level)', () => {
    const root: Block = { id: 'root', type: 'group', data: { title: 'Root' }, children: [], collapsed: false };
    const newBlock = makeBlock('b1', 'narration', { text: 'Hello' });
    const next = addBlockAtPath(root, [], newBlock);
    expect(next.children.length).toBe(1);
    expect(next.children[0].id).toBe('b1');
  });

  it('adds a block at nested path', () => {
    const root: Block = {
      id: 'root',
      type: 'group',
      data: { title: 'Root' },
      children: [makeBlock('child1', 'group', { title: 'Child' }, [])],
      collapsed: false,
    };
    const newBlock = makeBlock('b2', 'dialogue', { text: 'Nested' });
    const next = addBlockAtPath(root, [0], newBlock);
    expect(next.children[0].children.length).toBe(1);
    expect(next.children[0].children[0].id).toBe('b2');
  });

  it('deletes a block at path', () => {
    const root: Block = {
      id: 'root',
      type: 'group',
      data: { title: 'Root' },
      children: [makeBlock('a', 'narration', { text: 'A' })],
      collapsed: false,
    };
    const next = deleteBlockAtPath(root, [0]);
    expect(next.children.length).toBe(0);
  });

  it('toggles collapse on a block', () => {
    const root: Block = {
      id: 'root',
      type: 'group',
      data: { title: 'Root' },
      children: [makeBlock('a', 'group', { title: 'Child' }, [])],
      collapsed: false,
    };
    const next = toggleCollapse(root, [0]);
    expect(next.children[0].collapsed).toBe(true);
  });

  it('moves a block from one path to another', () => {
    const root: Block = {
      id: 'root',
      type: 'group',
      data: { title: 'Root' },
      collapsed: false,
      children: [
        makeBlock('a', 'narration', { text: 'A' }),
        makeBlock('b', 'narration', { text: 'B' }),
      ],
    };
    const next = moveBlock(root, [0], [1]);
    expect(next).toBeTruthy();
    expect(next?.children.length).toBe(2);
  });

  it('inserts a snippet at path', () => {
    const root: Block = { id: 'root', type: 'group', data: { title: 'Root' }, children: [], collapsed: false };
    const snippet = makeBlock('snip1', 'group', { title: 'Snippet' }, []);
    const next = insertSnippetAtPath(root, [], snippet);
    expect(next.children[0].id).toBe('snip1');
  });
});
