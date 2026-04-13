/**
 * Interactive Objects and Inventory System Types
 * Types for clickable objects, actions, and inventory management
 */

// ── Item (Inventory) ──────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  iconUri: string;
  category?: string; // e.g., "key", "document", "tool"
  metadata?: Record<string, any>; // Custom data
}

// ── Interactive Object Actions ────────────────────────────────────────────

export type InteractiveActionType =
  | 'dialogue'
  | 'scene_transition'
  | 'play_audio'
  | 'add_item'
  | 'remove_item'
  | 'show_image'
  | 'trigger_event';

export interface DialogueAction {
  type: 'dialogue';
  text: string;
  speaker?: string;
}

export interface SceneTransitionAction {
  type: 'scene_transition';
  targetSceneId: string;
  transition?: 'fade' | 'slide' | 'instant';
}

export interface PlayAudioAction {
  type: 'play_audio';
  audioUri: string;
  volume?: number;
  loop?: boolean;
}

export interface AddItemAction {
  type: 'add_item';
  item: InventoryItem;
  showNotification?: boolean;
}

export interface RemoveItemAction {
  type: 'remove_item';
  itemId: string;
}

export interface ShowImageAction {
  type: 'show_image';
  imageUri: string;
  duration?: number; // milliseconds
}

export interface TriggerEventAction {
  type: 'trigger_event';
  eventId: string;
  data?: Record<string, any>;
}

export type InteractiveAction =
  | DialogueAction
  | SceneTransitionAction
  | PlayAudioAction
  | AddItemAction
  | RemoveItemAction
  | ShowImageAction
  | TriggerEventAction;

// ── Interactive Object ────────────────────────────────────────────────────

export interface InteractiveObjectPosition {
  x: number; // Percentage (0-100)
  y: number; // Percentage (0-100)
  width: number; // Percentage (0-100)
  height: number; // Percentage (0-100)
}

export interface InteractiveObject {
  id: string;
  name: string; // For editor display
  position: InteractiveObjectPosition;

  // Visual representation
  imageUri?: string; // Optional image overlay
  highlightOnHover?: boolean;

  // Interaction
  actions: InteractiveAction[];

  // Conditions (optional)
  requiredItems?: string[]; // Item IDs needed to interact
  oneTimeOnly?: boolean; // Can only be clicked once
  isActive?: boolean; // Can be toggled on/off

  // Visual feedback
  pulseAnimation?: boolean;
  glowColor?: string;
}

// ── Scene with Interactive Objects ────────────────────────────────────────

export interface InteractiveScene {
  id: string;
  interactiveObjects: InteractiveObject[];
}

// ── Inventory State ───────────────────────────────────────────────────────

export interface InventoryState {
  items: InventoryItem[];
  maxSlots?: number; // Optional inventory limit
}

// ── Interaction Event ─────────────────────────────────────────────────────

export interface InteractionEvent {
  objectId: string;
  timestamp: number;
  actions: InteractiveAction[];
}

// ── Presets ───────────────────────────────────────────────────────────────

export interface InteractiveObjectPreset {
  id: string;
  name: string;
  description: string;
  template: Omit<InteractiveObject, 'id'>;
}

export const INTERACTIVE_PRESETS: InteractiveObjectPreset[] = [
  {
    id: 'door',
    name: 'Door',
    description: 'Clickable door that transitions to another scene',
    template: {
      name: 'Door',
      position: { x: 40, y: 30, width: 20, height: 40 },
      highlightOnHover: true,
      actions: [
        {
          type: 'scene_transition',
          targetSceneId: '',
          transition: 'fade',
        },
      ],
      pulseAnimation: false,
    },
  },
  {
    id: 'item_pickup',
    name: 'Item Pickup',
    description: 'Collectible item that adds to inventory',
    template: {
      name: 'Item',
      position: { x: 45, y: 60, width: 10, height: 10 },
      highlightOnHover: true,
      actions: [
        {
          type: 'add_item',
          item: {
            id: '',
            name: 'Item',
            description: 'A collectible item',
            iconUri: '',
          },
          showNotification: true,
        },
      ],
      oneTimeOnly: true,
      pulseAnimation: true,
      glowColor: '#FFD700',
    },
  },
  {
    id: 'dialogue_trigger',
    name: 'Dialogue Trigger',
    description: 'Object that shows dialogue when clicked',
    template: {
      name: 'Dialogue Object',
      position: { x: 30, y: 40, width: 15, height: 15 },
      highlightOnHover: true,
      actions: [
        {
          type: 'dialogue',
          text: 'This is an interactive object!',
          speaker: 'Narrator',
        },
      ],
    },
  },
  {
    id: 'audio_trigger',
    name: 'Audio Trigger',
    description: 'Plays sound effect when clicked',
    template: {
      name: 'Audio Object',
      position: { x: 50, y: 50, width: 10, height: 10 },
      highlightOnHover: true,
      actions: [
        {
          type: 'play_audio',
          audioUri: '',
          volume: 0.7,
          loop: false,
        },
      ],
    },
  },
  {
    id: 'locked_door',
    name: 'Locked Door',
    description: 'Door that requires a key item',
    template: {
      name: 'Locked Door',
      position: { x: 40, y: 30, width: 20, height: 40 },
      highlightOnHover: true,
      requiredItems: ['key_item_id'],
      actions: [
        {
          type: 'dialogue',
          text: 'The door is locked. You need a key.',
        },
        {
          type: 'scene_transition',
          targetSceneId: '',
          transition: 'fade',
        },
      ],
    },
  },
];

// ── Helper Types ──────────────────────────────────────────────────────────

export interface InteractionResult {
  success: boolean;
  message?: string;
  itemsAdded?: InventoryItem[];
  itemsRemoved?: string[];
  sceneTransition?: string;
}
