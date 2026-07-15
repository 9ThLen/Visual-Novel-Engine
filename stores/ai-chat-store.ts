/**
 * Phase 0 AI chat state — deliberately separate from the persisted
 * useAppStore. Chat history is not durable yet, so this store carries no
 * persist middleware; a page refresh clears it.
 */
import { create } from 'zustand';

import { generateId } from '@/lib/id-utils';
import type { AiReaderAppearancePatch, AppearancePatchDescription } from '@/lib/ai/appearance-patch';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { StoryReaderTheme } from '@/lib/story-theme';

export type AiChatRole = 'user' | 'assistant' | 'system';

export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  text: string;
  createdAt: number;
}

export type AiChatStatus = 'idle' | 'thinking' | 'awaiting_confirmation';

export interface AiChatPendingPatch {
  patch: AiScenePatch;
  description: ScenePatchDescription;
}

export interface AiChatPendingAppearance {
  patch: AiReaderAppearancePatch;
  description: AppearancePatchDescription;
}

/**
 * The two change kinds roll back differently: scenes restore a story snapshot,
 * while a theme is reverted by writing the previous colors back (snapshots do
 * not carry a theme — see appearance-patch-adapter).
 */
export type AiChatAppliedChange =
  | { kind: 'scene'; storyId: string; snapshotId: string }
  | { kind: 'appearance'; storyId: string; previousTheme: StoryReaderTheme | undefined };

interface AiChatStoreState {
  messages: AiChatMessage[];
  status: AiChatStatus;
  pendingPatch: AiChatPendingPatch | null;
  pendingAppearance: AiChatPendingAppearance | null;
  lastAppliedChange: AiChatAppliedChange | null;
  addMessage: (role: AiChatRole, text: string) => AiChatMessage;
  setStatus: (status: AiChatStatus) => void;
  setPendingPatch: (pendingPatch: AiChatPendingPatch | null) => void;
  setPendingAppearance: (pendingAppearance: AiChatPendingAppearance | null) => void;
  setLastAppliedChange: (change: AiChatAppliedChange | null) => void;
}

export const useAiChatStore = create<AiChatStoreState>((set) => ({
  messages: [],
  status: 'idle',
  pendingPatch: null,
  pendingAppearance: null,
  lastAppliedChange: null,

  addMessage: (role, text) => {
    const message: AiChatMessage = { id: generateId('ai-msg'), role, text, createdAt: Date.now() };
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  setStatus: (status) => set({ status }),

  // Only one proposal can await confirmation at a time: a second one would give
  // the user two Apply buttons whose revisions were computed against different states.
  setPendingPatch: (pendingPatch) =>
    set({ pendingPatch, pendingAppearance: null, status: pendingPatch ? 'awaiting_confirmation' : 'idle' }),

  setPendingAppearance: (pendingAppearance) =>
    set({ pendingAppearance, pendingPatch: null, status: pendingAppearance ? 'awaiting_confirmation' : 'idle' }),

  setLastAppliedChange: (lastAppliedChange) => set({ lastAppliedChange }),
}));
