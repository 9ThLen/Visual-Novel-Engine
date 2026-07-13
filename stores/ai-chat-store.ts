/**
 * Phase 0 AI chat state — deliberately separate from the persisted
 * useAppStore. Chat history is not durable yet, so this store carries no
 * persist middleware; a page refresh clears it.
 */
import { create } from 'zustand';

import { generateId } from '@/lib/id-utils';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';

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

export interface AiChatAppliedSnapshot {
  storyId: string;
  snapshotId: string;
}

interface AiChatStoreState {
  messages: AiChatMessage[];
  status: AiChatStatus;
  pendingPatch: AiChatPendingPatch | null;
  lastAppliedSnapshot: AiChatAppliedSnapshot | null;
  addMessage: (role: AiChatRole, text: string) => AiChatMessage;
  setStatus: (status: AiChatStatus) => void;
  setPendingPatch: (pendingPatch: AiChatPendingPatch | null) => void;
  setLastAppliedSnapshot: (snapshot: AiChatAppliedSnapshot | null) => void;
}

export const useAiChatStore = create<AiChatStoreState>((set) => ({
  messages: [],
  status: 'idle',
  pendingPatch: null,
  lastAppliedSnapshot: null,

  addMessage: (role, text) => {
    const message: AiChatMessage = { id: generateId('ai-msg'), role, text, createdAt: Date.now() };
    set((state) => ({ messages: [...state.messages, message] }));
    return message;
  },

  setStatus: (status) => set({ status }),

  setPendingPatch: (pendingPatch) =>
    set({ pendingPatch, status: pendingPatch ? 'awaiting_confirmation' : 'idle' }),

  setLastAppliedSnapshot: (lastAppliedSnapshot) => set({ lastAppliedSnapshot }),
}));
