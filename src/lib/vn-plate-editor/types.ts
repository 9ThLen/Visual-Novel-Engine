import type { Character } from '@/lib/character-types';
import type { DocumentBlockKind, DocumentScene } from '@/lib/document-editor/types';
import type { Language } from '@/lib/translations';
import type { EmbeddedCommand } from './embedded-commands';

export interface VNPlateBackgroundAsset {
  id: string;
  name: string;
  uri: string;
  assetUri?: string;
}

export interface VNPlateAudioAsset {
  id: string;
  name: string;
  uri: string;
  type: 'music' | 'sfx' | 'voice' | 'ambient';
  duration?: number;
}

/**
 * A video the story can play. Only identity travels into the frame — the block
 * shows a name, never a thumbnail, so no bytes cross the bridge.
 */
export interface VNPlateVideoAsset {
  id: string;
  name: string;
  /** Bytes on disk, so the author sees what a successful import actually cost. */
  sizeBytes?: number;
  /** Known only when the platform reported it at import time. */
  durationSeconds?: number;
}

/** Lightweight reference to another scene in the story (for transition target pickers). */
export interface VNPlateSceneRef {
  id: string;
  name: string;
}

export interface VNPlateTheme {
  background: string;
  surface: string;
  surfaceMuted: string;
  foreground: string;
  foregroundSecondary: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  primary: string;
  primarySoft: string;
  secondary: string;
  secondarySoft: string;
  audio: string;
  audioSoft: string;
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
  videoAssets?: VNPlateVideoAsset[];
  scenes?: VNPlateSceneRef[];
  theme?: VNPlateTheme;
  /**
   * Origin of the page hosting the frame, used as the exact postMessage target
   * for everything the editor sends back. The frame cannot derive it: its own
   * location is about:srcdoc, whose origin serializes to "null".
   */
  hostOrigin?: string;
}

export type VNPlateFormatCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'fontSize'
  | 'fontSizeDecrease'
  | 'fontSizeIncrease'
  | 'color'
  | 'clear';

export interface VNPlateFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  alignment: 'left' | 'center' | 'right';
  fontSize: number;
  color: string | null;
  canFormat: boolean;
}

/** One text part of a block that carries inline chips, numbered as the frame serializes them. */
export interface VNPlateSelectionPart {
  index: number;
  quote: string;
  occurrence: number;
}

export interface VNPlateSelectionBlock {
  id: string;
  kind: DocumentBlockKind;
  /** The selected text inside this block. */
  quote: string;
  /** Which repeat of `quote` in the block's visible text, counted from zero. */
  occurrence: number;
  /** Present when the block carries inline chips: the selection split per text part. */
  parts?: VNPlateSelectionPart[];
}

/**
 * What the author has selected in one editor frame. Text is visible text, not
 * story markup, and `seq` only orders states that came from the same frame.
 */
export interface VNPlateSelectionState {
  seq: number;
  collapsed: boolean;
  text: string;
  textLength: number;
  truncated: boolean;
  before: string;
  after: string;
  crossesChip: boolean;
  blocks: VNPlateSelectionBlock[];
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
      type: 'selectionState';
      state: VNPlateSelectionState;
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
      /** Only on a flush that asked for it; null when nothing in the editor is selected. */
      selection?: VNPlateSelectionState | null;
      /** The frame held edits it had not yet reported when this was taken. */
      hasUnreportedChanges?: boolean;
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
    }
  | {
      /**
       * Asks the host to open the video picker. Carries no payload by design:
       * a clip is tens of megabytes and must never cross as a data URI.
       */
      source: 'vn-plate-editor';
      editorId: string;
      type: 'pickVideoAsset';
      requestId: string;
    };

export type VNPlateHostMessage =
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'flush';
      requestId: string;
      /** Also report the selection, taken in the same pass as the content. */
      withSelection?: boolean;
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
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'videoAssetsUpdated';
      assets: VNPlateVideoAsset[];
    }
  | {
      source: 'vn-plate-host';
      editorId: string;
      type: 'videoAssetPicked';
      requestId: string;
      /** null when the author cancelled or the import was rejected. */
      asset: VNPlateVideoAsset | null;
      error?: 'tooLarge' | 'unsupportedType' | 'failed';
    };
