/**
 * AI chat state — deliberately separate from useAppStore. Transcripts persist
 * under their own key; pendings and the undo journal stay in memory.
 *
 * This store may depend on useAppStore, but never the reverse: the app store
 * reaches the journal through `@/stores/snapshot-eviction-registry` so the two
 * do not close a require cycle.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateId } from '@/lib/id-utils';
import type { AiReaderAppearancePatch, AppearancePatchDescription } from '@/lib/ai/appearance-patch';
import type { ScenePatchDescription } from '@/lib/ai/scene-patch';
import type { AiScenePatch } from '@/lib/ai/scene-patch-types';
import type { StoryReaderLayoutPreset, StoryReaderTheme } from '@/lib/story-theme';
import type { Character } from '@/lib/character-types';
import type { AiChangeSet, AiChangeSetDescription } from '@/lib/ai/change-set';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { useAppStore } from '@/stores/use-app-store';
import { onSnapshotEvicted } from '@/stores/snapshot-eviction-registry';
import type { AiCapability } from '@/lib/ai/permissions';

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

export interface AiChatPendingChangeSet {
  changeSet: AiChangeSet;
  description: AiChangeSetDescription;
}

export interface AiChatPendingCapability {
  capability: AiCapability;
  estimate?: string;
}

/**
 * The two change kinds roll back differently: scenes restore a story snapshot,
 * while a theme is reverted by writing the previous colors back (snapshots do
 * not carry a theme — see appearance-patch-adapter).
 */
interface AppliedChangeBase {
  storyId: string;
  appliedAt: number;
  label: string;
  postRevisions: {
    scenes: Record<string, string>;
    characters?: string;
    storyMetadata: string;
    appearance?: string;
  };
}

export type AiChatAppliedChange =
  | (AppliedChangeBase & { kind: 'scene'; snapshotId: string })
  | (AppliedChangeBase & { kind: 'appearance'; previousTheme: StoryReaderTheme | undefined; previousLayoutPreset?: StoryReaderLayoutPreset })
  | (AppliedChangeBase & { kind: 'changeset'; snapshotId: string; previousCharacterLibrary?: Character[] });

type LegacyAppliedChange =
  | { kind: 'scene'; storyId: string; snapshotId: string }
  | { kind: 'appearance'; storyId: string; previousTheme: StoryReaderTheme | undefined; previousLayoutPreset?: StoryReaderLayoutPreset }
  | { kind: 'changeset'; storyId: string; snapshotId: string };

function toLegacyAppliedChange(change: AiChatAppliedChange | undefined): LegacyAppliedChange | null {
  if (!change) return null;
  if (change.kind === 'scene') return { kind: 'scene', storyId: change.storyId, snapshotId: change.snapshotId };
  if (change.kind === 'appearance') return {
    kind: 'appearance', storyId: change.storyId, previousTheme: change.previousTheme,
    previousLayoutPreset: change.previousLayoutPreset,
  };
  return { kind: 'changeset', storyId: change.storyId, snapshotId: change.snapshotId };
}

interface AiChatStoreState {
  messagesByStory: Record<string, AiChatMessage[]>;
  activeStoryId: string | null;
  restoredStoryIds: Record<string, true>;
  messages: AiChatMessage[];
  status: AiChatStatus;
  pendingPatch: AiChatPendingPatch | null;
  pendingAppearance: AiChatPendingAppearance | null;
  pendingChangeSet: AiChatPendingChangeSet | null;
  pendingCapability: AiChatPendingCapability | null;
  appliedChanges: AiChatAppliedChange[];
  /** @deprecated Compatibility view; new code uses the LIFO appliedChanges journal. */
  lastAppliedChange: LegacyAppliedChange | null;
  setActiveStory: (storyId: string) => void;
  addMessage: (role: AiChatRole, text: string, storyId?: string) => AiChatMessage;
  clearMessages: (storyId?: string) => void;
  setStatus: (status: AiChatStatus) => void;
  setPendingPatch: (pendingPatch: AiChatPendingPatch | null) => void;
  setPendingAppearance: (pendingAppearance: AiChatPendingAppearance | null) => void;
  setPendingChangeSet: (pendingChangeSet: AiChatPendingChangeSet | null) => void;
  setPendingCapability: (pendingCapability: AiChatPendingCapability | null) => void;
  pushAppliedChange: (change: AiChatAppliedChange) => void;
  popAppliedChange: () => AiChatAppliedChange | undefined;
  dropAppliedChangesForSnapshot: (storyId: string, snapshotId: string) => void;
  /** @deprecated Compatibility action for older callers. */
  setLastAppliedChange: (change: LegacyAppliedChange | null) => void;
}

const MAX_MESSAGES_PER_STORY = 200;
const MAX_TRANSCRIPT_BYTES = 512 * 1024;
const LEGACY_TRANSIENT_SYSTEM_MESSAGES = new Set([
  'Another session is already active',
]);
const safeText = (text: string) => /data:image\/[^;]+;base64,/i.test(text) ? '[image omitted]' : text;
const byteLength = (value: unknown) => {
  const json = JSON.stringify(value);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).byteLength : unescape(encodeURIComponent(json)).length;
};
function capMessages(messages: AiChatMessage[]): AiChatMessage[] {
  const capped = messages.slice(-MAX_MESSAGES_PER_STORY);
  while (capped.length && byteLength(capped) > MAX_TRANSCRIPT_BYTES) capped.shift();
  return capped;
}

function removeLegacyTransientMessages(messagesByStory: Record<string, AiChatMessage[]>): Record<string, AiChatMessage[]> {
  return Object.fromEntries(Object.entries(messagesByStory).map(([storyId, messages]) => [
    storyId,
    messages.filter((message) => message.role !== 'system' || !LEGACY_TRANSIENT_SYSTEM_MESSAGES.has(message.text)),
  ]));
}

export const useAiChatStore = create<AiChatStoreState>()(persist((set, get) => ({
  messagesByStory: {},
  activeStoryId: null,
  restoredStoryIds: {},
  messages: [],
  status: 'idle',
  pendingPatch: null,
  pendingAppearance: null,
  pendingChangeSet: null,
  pendingCapability: null,
  appliedChanges: [],
  lastAppliedChange: null,

  setActiveStory: (storyId) => set((state) => ({ activeStoryId: storyId, messages: state.messagesByStory[storyId] ?? [] })),

  addMessage: (role, text, requestedStoryId) => {
    const message: AiChatMessage = { id: generateId('ai-msg'), role, text: safeText(text), createdAt: Date.now() };
    const storyId = requestedStoryId ?? get().activeStoryId;
    if (!storyId) { set((state) => ({ messages: [...state.messages, message] })); return message; }
    set((state) => {
      const messages = capMessages([...(state.messagesByStory[storyId] ?? []), message]);
      return { messagesByStory: { ...state.messagesByStory, [storyId]: messages }, messages: state.activeStoryId === storyId ? messages : state.messages };
    });
    return message;
  },

  clearMessages: (requestedStoryId) => set((state) => {
    const storyId = requestedStoryId ?? state.activeStoryId;
    if (!storyId) return { messages: [] };
    const messagesByStory = { ...state.messagesByStory };
    delete messagesByStory[storyId];
    return { messagesByStory, messages: state.activeStoryId === storyId ? [] : state.messages };
  }),

  setStatus: (status) => set({ status }),

  // Only one proposal can await confirmation at a time: a second one would give
  // the user two Apply buttons whose revisions were computed against different states.
  setPendingPatch: (pendingPatch) =>
    set({ pendingPatch, pendingAppearance: null, pendingChangeSet: null, pendingCapability: null, status: pendingPatch ? 'awaiting_confirmation' : 'idle' }),

  setPendingAppearance: (pendingAppearance) =>
    set({ pendingAppearance, pendingPatch: null, pendingChangeSet: null, pendingCapability: null, status: pendingAppearance ? 'awaiting_confirmation' : 'idle' }),

  setPendingChangeSet: (pendingChangeSet) =>
    set({ pendingChangeSet, pendingPatch: null, pendingAppearance: null, pendingCapability: null, status: pendingChangeSet ? 'awaiting_confirmation' : 'idle' }),

  setPendingCapability: (pendingCapability) =>
    set({ pendingCapability, pendingPatch: null, pendingAppearance: null, pendingChangeSet: null, status: pendingCapability ? 'awaiting_confirmation' : 'idle' }),

  pushAppliedChange: (change) =>
    set((state) => {
      const appliedChanges = [...state.appliedChanges, change].slice(-10);
      return { appliedChanges, lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)) };
    }),

  popAppliedChange: () => {
    const change = get().appliedChanges.at(-1);
    if (change) set((state) => {
      const appliedChanges = state.appliedChanges.slice(0, -1);
      return { appliedChanges, lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)) };
    });
    return change;
  },

  dropAppliedChangesForSnapshot: (storyId, snapshotId) =>
    set((state) => {
      const appliedChanges = state.appliedChanges.filter((change) =>
        !('snapshotId' in change && change.storyId === storyId && change.snapshotId === snapshotId));
      return { appliedChanges, lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)) };
    }),

  setLastAppliedChange: (lastAppliedChange) => set(lastAppliedChange
    ? { lastAppliedChange }
    : { lastAppliedChange: null, appliedChanges: [] }),
}), {
  name: 'vne-ai-chat',
  storage: createJSONStorage(createPersistentStorage),
  partialize: ({ messagesByStory }) => ({ messagesByStory }) as AiChatStoreState,
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    const messagesByStory = removeLegacyTransientMessages(state.messagesByStory);
    const restoredStoryIds = Object.fromEntries(Object.keys(messagesByStory).map((id) => [id, true])) as Record<string, true>;
    useAiChatStore.setState({ messagesByStory, restoredStoryIds });
    reconcileTranscripts();
  },
}));

export function reconcileTranscripts(): void {
  if (!useAiChatStore.persist.hasHydrated()) return;
  const app = useAppStore.getState();
  if (!app.isLoaded) return;
  const liveIds = new Set(app.storiesMetadata.map((story) => story.id));
  useAiChatStore.setState((state) => {
    const messagesByStory = Object.fromEntries(Object.entries(state.messagesByStory).filter(([id]) => liveIds.has(id)));
    return { messagesByStory, messages: state.activeStoryId ? messagesByStory[state.activeStoryId] ?? [] : state.messages };
  });
}

useAppStore.subscribe((state, previous) => {
  if (state.isLoaded !== previous.isLoaded || state.storiesMetadata !== previous.storiesMetadata) reconcileTranscripts();
});
useAiChatStore.persist.onFinishHydration(reconcileTranscripts);
onSnapshotEvicted((storyId, snapshotId) =>
  useAiChatStore.getState().dropAppliedChangesForSnapshot(storyId, snapshotId));
