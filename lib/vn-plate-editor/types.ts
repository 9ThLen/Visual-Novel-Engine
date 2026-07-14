import type { Character } from '@/lib/character-types';
import type { DocumentScene } from '@/lib/document-editor/types';
import type { Language } from '@/lib/translations';
import type { EmbeddedCommand } from './embedded-commands';

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

/** One option of a choice block, as seen by the branch switcher in the webview. */
export interface VNPlateBranchOption {
  optionId: string;
  text: string;
  targetSceneId: string | null;
  /** Explicit target points to a scene that no longer exists. */
  isBroken: boolean;
  /** No story continues past this option (no explicit target and no usable next, or broken target). */
  isEmpty: boolean;
}

/**
 * Branch info for a choice block on the active path. Sent host→webview via
 * `branchInfoUpdated` so the choice block can render the branch switcher.
 */
export interface VNPlateBranchInfo {
  sceneId: string;
  choiceStepId: string;
  options: VNPlateBranchOption[];
  /** The option whose continuation the document is currently rendering. */
  selectedOptionId: string;
  warning?: 'danglingTarget';
}

export interface VNPlateEditorPayload {
  editorId: string;
  scene: DocumentScene;
  characters: Character[];
  isPhone: boolean;
  language?: Language;
  backgroundAssets?: VNPlateBackgroundAsset[];
  audioAssets?: VNPlateAudioAsset[];
  scenes?: VNPlateSceneRef[];
}

export type VNPlateFormatCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'color'
  | 'clear';

export interface VNPlateFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  alignment: 'left' | 'center' | 'right';
  color: string | null;
  canFormat: boolean;
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
      type: 'historyState';
      canUndo: boolean;
      canRedo: boolean;
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'formatState';
      state: VNPlateFormatState;
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
      type: 'selectChoiceOption';
      choiceStepId: string;
      optionId: string;
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'startBranchOption';
      choiceStepId: string;
      optionId: string;
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
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'uploadCharacterSpriteAsset';
      requestId: string;
      name: string;
      dataUri: string;
    }
  | {
      source: 'vn-plate-editor';
      editorId: string;
      type: 'removeBackground';
      requestId: string;
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
      type: 'undo' | 'redo';
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'formatText';
      command: VNPlateFormatCommand;
      value?: string;
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
      type: 'commandsUpdated';
      commands: EmbeddedCommand[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'branchInfoUpdated';
      branchInfo: VNPlateBranchInfo[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'audioAssetUploaded';
      asset: VNPlateAudioAsset;
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'characterSpriteAssetUploaded';
      requestId: string;
      asset: (VNPlateBackgroundAsset & { assetUri: string }) | null;
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'backgroundRemoved';
      requestId: string;
      /** Transparent PNG data: URI; null when removal failed or is unsupported. */
      dataUri: string | null;
    };
