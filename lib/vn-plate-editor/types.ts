import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';

export interface VNPlateBackgroundAsset {
  id: string;
  name: string;
  uri: string;
}

export interface VNPlateAudioAsset {
  id: string;
  name: string;
  uri: string;
  type: 'music' | 'sfx' | 'voice' | 'ambient';
  duration?: number;
}

/** Lightweight reference to another scene in the story (for transition target pickers). */
export interface VNPlateSceneRef {
  id: string;
  name: string;
}

export interface VNPlateEditorPayload {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  isPhone: boolean;
  backgroundAssets?: VNPlateBackgroundAsset[];
  audioAssets?: VNPlateAudioAsset[];
  scenes?: VNPlateSceneRef[];
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
      overlayHeight?: number;
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
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'uploadAudioAsset';
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
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'audioAssetsUpdated';
      assets: VNPlateAudioAsset[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'scenesUpdated';
      scenes: VNPlateSceneRef[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'audioAssetUploaded';
      asset: VNPlateAudioAsset;
    };
