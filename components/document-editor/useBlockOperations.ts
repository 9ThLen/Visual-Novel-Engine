/**
 * useBlockOperations — block mutation operations for DocumentSceneEditor.
 *
 * Encapsulates all block/line mutations so the main component
 * only needs to wire render + props.
 */

import { useCallback, useRef } from 'react';
import type { DocumentBlock, DocumentCommand, DocumentScene } from '@/lib/document-editor/types';
import type { Character } from '@/lib/character-types';
import {
  createDocumentTechnicalBlock,
  ensureDocumentCharactersInBlocks,
  parseDraftLineToDocumentBlock,
} from '@/lib/document-editor/document-scene';
import type { DocumentTechnicalBlock } from '@/lib/document-editor/types';

// ── Pure helpers (moved from DocumentSceneEditor) ──────────────────────────

export function updateBlockById(
  blocks: DocumentBlock[],
  blockId: string,
  updater: (block: DocumentBlock) => DocumentBlock,
): DocumentBlock[] {
  return blocks.map((block) => (block.id === blockId ? updater(block) : block));
}

export function replaceBlockById(
  blocks: DocumentBlock[],
  blockId: string,
  nextBlocks: DocumentBlock[],
): DocumentBlock[] {
  return blocks.flatMap((block) => (block.id === blockId ? nextBlocks : [block]));
}

export function removeBlockById(blocks: DocumentBlock[], blockId: string): DocumentBlock[] {
  return blocks.filter((block) => block.id !== blockId);
}

export function getNearbyDialogue(blocks: DocumentBlock[]): Extract<DocumentBlock, { kind: 'dialogue' }> | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind === 'dialogue') {
      return block;
    }
  }
  return undefined;
}

function pruneCharacterIfUnused(
  characters: Character[],
  blocks: DocumentBlock[],
  characterId: string | null,
  protectedCharacterIds: string[],
): Character[] {
  if (!characterId) return characters;
  if (protectedCharacterIds.includes(characterId)) return characters;
  const isStillUsed = blocks.some((item) => item.kind === 'dialogue' && item.characterId === characterId);
  return isStillUsed ? characters : characters.filter((character) => character.id !== characterId);
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface UseBlockOperationsParams {
  documentScenes: DocumentScene[];
  localCharacters: Character[];
  lineDrafts: Record<string, string>;
  selectedBlockId: string | null;
  protectedCharacterIds: string[];
  onDocumentScenesChange: (scenes: DocumentScene[]) => void;
  onLocalCharactersChange: (characters: Character[]) => void;
  onLineDraftsChange: (drafts: Record<string, string>) => void;
  onSelectedBlockIdChange: (id: string | null) => void;
  onCreateNextScene: (sourceSceneId: string, documentScenes: DocumentScene[], characters: Character[]) => void;
}

export function useBlockOperations({
  documentScenes,
  localCharacters,
  lineDrafts,
  selectedBlockId,
  protectedCharacterIds,
  onDocumentScenesChange,
  onLocalCharactersChange,
  onLineDraftsChange,
  onSelectedBlockIdChange,
  onCreateNextScene,
}: UseBlockOperationsParams) {
  const backspacePressRef = useRef<{ id: string; at: number } | null>(null);

  const updateDocumentScene = useCallback((sceneId: string, updater: (scene: DocumentScene) => DocumentScene) => {
    onDocumentScenesChange(documentScenes.map((s) => (s.sceneId === sceneId ? updater(s) : s)));
  }, [documentScenes, onDocumentScenesChange]);

  const updateBlock = useCallback((sceneId: string, blockId: string, updater: (block: DocumentBlock) => DocumentBlock) => {
    updateDocumentScene(sceneId, (current) => ({
      ...current,
      blocks: updateBlockById(current.blocks, blockId, updater),
    }));
  }, [updateDocumentScene]);

  const replaceBlock = useCallback((sceneId: string, blockId: string, nextBlocks: DocumentBlock[]) => {
    updateDocumentScene(sceneId, (current) => ({
      ...current,
      blocks: replaceBlockById(current.blocks, blockId, nextBlocks),
    }));
  }, [updateDocumentScene]);

  const removeBlock = useCallback((sceneId: string, blockId: string) => {
    updateDocumentScene(sceneId, (current) => ({
      ...current,
      blocks: removeBlockById(current.blocks, blockId),
    }));
    onSelectedBlockIdChange(selectedBlockId === blockId ? null : selectedBlockId);
  }, [updateDocumentScene, selectedBlockId, onSelectedBlockIdChange]);

  const handleEmptyBackspace = useCallback((id: string, onDoubleBackspace: () => void) => {
    const now = Date.now();
    const previous = backspacePressRef.current;
    backspacePressRef.current = { id, at: now };
    if (previous?.id === id && now - previous.at < 900) {
      backspacePressRef.current = null;
      onDoubleBackspace();
    }
  }, []);

  const updateLineDraft = useCallback((sceneId: string, value: string) => {
    onLineDraftsChange({ ...lineDrafts, [sceneId]: value });
  }, [lineDrafts, onLineDraftsChange]);

  const insertCommand = useCallback((sceneId: string, command: DocumentCommand) => {
    const documentScene = documentScenes.find((item) => item.sceneId === sceneId);
    if (!documentScene) return;

    if (command.id === 'newScene') {
      const ensured = ensureDocumentCharactersInBlocks(
        documentScenes.flatMap((item) => item.blocks),
        localCharacters,
      );
      let cursor = 0;
      const ensuredDocuments = documentScenes.map((ds) => {
        const blocks = ensured.blocks.slice(cursor, cursor + ds.blocks.length);
        cursor += ds.blocks.length;
        return { ...ds, blocks };
      });
      onCreateNextScene(sceneId, ensuredDocuments, ensured.characters);
      updateLineDraft(sceneId, '');
      return;
    }

    updateDocumentScene(sceneId, (current) => {
      const technical = createDocumentTechnicalBlock(command.id, localCharacters, getNearbyDialogue(current.blocks));
      return { ...current, blocks: [...current.blocks, technical] };
    });
    updateLineDraft(sceneId, '');
  }, [documentScenes, localCharacters, onCreateNextScene, updateDocumentScene, updateLineDraft]);

  const addLine = useCallback((sceneId: string, followWritingFn: (sceneId: string) => void) => {
    const lineDraft = lineDrafts[sceneId] ?? '';
    const slashOpen = lineDraft.trimStart().startsWith('/');
    if (!lineDraft.trim()) return;
    if (slashOpen) return;
    updateDocumentScene(sceneId, (current) => {
      const blocks = [...current.blocks, parseDraftLineToDocumentBlock(lineDraft, localCharacters)];
      const ensured = ensureDocumentCharactersInBlocks(blocks, localCharacters);
      onLocalCharactersChange(ensured.characters);
      return { ...current, blocks: ensured.blocks };
    });
    updateLineDraft(sceneId, '');
    followWritingFn(sceneId);
  }, [lineDrafts, localCharacters, updateDocumentScene, updateLineDraft, onLocalCharactersChange]);

  const handleTextBlockChange = useCallback((sceneId: string, blockId: string, content: string) => {
    const lines = content.split(/\r?\n/);
    const slashLine = lines.find((line) => line.trimStart().startsWith('/'));

    if (slashLine) {
      updateLineDraft(sceneId, slashLine.trim());
      const nextContent = lines.filter((line) => line !== slashLine).join('\n').trimEnd();
      updateBlock(sceneId, blockId, (current) => current.kind === 'text' ? { ...current, content: nextContent } : current);
      return;
    }

    const meaningfulLines = lines.map((line) => line.trim()).filter(Boolean);
    const hasStructuredLines = meaningfulLines.length > 1 && meaningfulLines.some((line) => /^([^:]{1,48}):\s*(.+)$/.test(line) || line.startsWith('?'));
    if (hasStructuredLines) {
      const nextBlocks = meaningfulLines.map((line) => parseDraftLineToDocumentBlock(line, localCharacters));
      const ensured = ensureDocumentCharactersInBlocks(nextBlocks, localCharacters);
      onLocalCharactersChange(ensured.characters);
      replaceBlock(sceneId, blockId, ensured.blocks);
      return;
    }

    updateBlock(sceneId, blockId, (current) => current.kind === 'text' ? { ...current, content } : current);
  }, [localCharacters, replaceBlock, updateBlock, updateLineDraft, onLocalCharactersChange]);

  const pruneCharacter = useCallback((characters: Character[], blocks: DocumentBlock[], characterId: string | null) => {
    return pruneCharacterIfUnused(characters, blocks, characterId, protectedCharacterIds);
  }, [protectedCharacterIds]);

  return {
    updateDocumentScene,
    updateBlock,
    replaceBlock,
    removeBlock,
    handleEmptyBackspace,
    updateLineDraft,
    insertCommand,
    addLine,
    handleTextBlockChange,
    pruneCharacter,
  };
}
