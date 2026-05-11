import React from 'react';
import { BlockFlowCanvas } from '@/components/block-editor';
import { Block } from '@/lib/block-types';

interface BlocksTabProps {
  sceneRoot: Block;
  setSceneRoot: (root: Block) => void;
  setSceneBlocks: (blocks: Block[]) => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  sceneList: string[];
  characterList: string[];
  colors: any;
}

export const BlocksTab: React.FC<BlocksTabProps> = ({
  sceneRoot,
  setSceneRoot,
  setSceneBlocks,
  selectedBlockId,
  setSelectedBlockId,
  sceneList,
  characterList,
  colors,
}) => {
  return (
    <BlockFlowCanvas
      root={sceneRoot}
      onChange={(root) => {
        setSceneRoot(root);
        setSceneBlocks(root.children);
      }}
      selectedId={selectedBlockId}
      onSelect={setSelectedBlockId}
      sceneList={sceneList}
      characterList={characterList}
      colors={{
        foreground: colors.foreground,
        background: colors.background,
        surface: colors.surface,
        border: colors.border,
        muted: colors.muted,
        primary: colors.primary,
      }}
    />
  );
};
