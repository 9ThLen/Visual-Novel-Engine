import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';

export interface VNPlateBackgroundAsset {
  id: string;
  name: string;
  uri: string;
}

export interface VNPlateEditorPayload {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  isPhone: boolean;
  backgroundAssets?: VNPlateBackgroundAsset[];
}

export type VNPlateEditorMessage =
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'ready';
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'resize';
      height: number;
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'save';
      scene: DocumentScene;
      characters?: Character[];
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'flushed';
      requestId: string;
      scene: DocumentScene;
      characters?: Character[];
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'createNextScene';
      scene: DocumentScene;
      characters?: Character[];
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'openCharacterPopover';
      characterId: string;
      blockId: string;
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'uploadBackgroundAsset';
      name: string;
      dataUri: string;
    };

export type VNPlateHostMessage =
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'flush';
      requestId: string;
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'charactersUpdated';
      characters: Character[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'backgroundAssetsUpdated';
      assets: VNPlateBackgroundAsset[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'backgroundAssetUploaded';
      asset: VNPlateBackgroundAsset;
    };
