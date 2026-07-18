/**
 * AI chat state — deliberately separate from useAppStore. Transcripts persist
 * under their own key. Pending interactions stay in memory; the bounded undo
 * journal is durable so an automatic snapshot remains useful after reload.
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
import type { AiChangeSet, AiChangeSetDescription } from '@/lib/ai/change-set';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { listSnapshots } from '@/lib/story-snapshots';
import { useAppStore } from '@/stores/use-app-store';
import { onSnapshotEvicted } from '@/stores/snapshot-eviction-registry';
import type { AiCapability } from '@/lib/ai/permissions';
import type { AttachmentRef } from '@/lib/ai/attachments';
import { chatAttachmentRepository } from '@/lib/ai/attachment-storage.web';

export type AiChatRole = 'user' | 'assistant' | 'system';

export interface AiChatMessage {
  id: string;
  role: AiChatRole;
  text: string;
  createdAt: number;
  attachments?: AttachmentRef[];
}

export type AiChatStatus = 'idle' | 'thinking' | 'interrupting' | 'awaiting_confirmation';

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
  estimate?: string | {
    provider?: string;
    model?: string;
    size?: string;
    quality?: string;
    costUsdRange?: { min?: number; max?: number } | null;
  };
}

export type AiPendingInteraction =
  | { kind: 'scene_patch'; storyId: string; value: AiChatPendingPatch }
  | { kind: 'appearance'; storyId: string; value: AiChatPendingAppearance }
  | { kind: 'changeset'; storyId: string; value: AiChatPendingChangeSet }
  | { kind: 'capability'; storyId: string; value: AiChatPendingCapability };

/**
 * The two change kinds roll back differently: scenes restore a story snapshot,
 * while a theme is reverted by writing the previous colors back (snapshots do
 * not carry a theme — see appearance-patch-adapter).
 */
export interface CharacterUndoDelta {
  createdCharacterIds: string[];
  previousValues: Array<{ id: string; name: string; color?: string }>;
}

interface AppliedChangeBase {
  storyId: string;
  appliedAt: number;
  label: string;
  postRevisions: {
    scenes?: Record<string, string>;
    characters?: string;
    storyMetadata?: string;
    appearance?: string;
  };
}

export type AiChatAppliedChange =
  | (AppliedChangeBase & { kind: 'scene'; snapshotId: string })
  | (AppliedChangeBase & { kind: 'appearance'; previousTheme: StoryReaderTheme | undefined; previousLayoutPreset?: StoryReaderLayoutPreset })
  | (AppliedChangeBase & { kind: 'changeset'; snapshotId: string; characterUndo?: CharacterUndoDelta });

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
  pendingInteraction: AiPendingInteraction | null;
  appliedChangesByStory: Record<string, AiChatAppliedChange[]>;
  /** @deprecated Compatibility view of the active story journal. */
  appliedChanges: AiChatAppliedChange[];
  /** @deprecated Compatibility view; new code uses the LIFO appliedChanges journal. */
  lastAppliedChange: LegacyAppliedChange | null;
  setActiveStory: (storyId: string) => void;
  addMessage: (role: AiChatRole, text: string, storyId?: string, attachments?: AttachmentRef[]) => AiChatMessage;
  clearMessages: (storyId?: string) => void;
  markAttachmentImported: (storyId: string, attachmentId: string, assetId: string) => void;
  setStatus: (status: AiChatStatus) => void;
  setPendingInteraction: (pendingInteraction: AiPendingInteraction | null) => void;
  cancelPendingInteraction: (storyId?: string) => AiPendingInteraction | null;
  pushAppliedChange: (change: AiChatAppliedChange) => void;
  getTopAppliedChange: (storyId?: string) => AiChatAppliedChange | undefined;
  popAppliedChange: (storyId?: string, expected?: AiChatAppliedChange) => AiChatAppliedChange | undefined;
  dropAppliedChangesForSnapshot: (storyId: string, snapshotId: string) => void;
  /** @deprecated Compatibility action for older callers. */
  setLastAppliedChange: (change: LegacyAppliedChange | null) => void;
}

const MAX_MESSAGES_PER_STORY = 200;
const MAX_TRANSCRIPT_BYTES = 512 * 1024;
const MAX_APPLIED_CHANGES_PER_STORY = 10;
const MAX_JOURNAL_STORIES = 50;
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

function capAppliedChangesByStory(
  journals: Record<string, AiChatAppliedChange[]>,
): Record<string, AiChatAppliedChange[]> {
  return Object.fromEntries(
    Object.entries(journals)
      .map(([storyId, changes]) => [storyId, changes.slice(-MAX_APPLIED_CHANGES_PER_STORY)] as const)
      .filter(([, changes]) => changes.length > 0)
      .sort(([, left], [, right]) =>
        (right.at(-1)?.appliedAt ?? 0) - (left.at(-1)?.appliedAt ?? 0))
      .slice(0, MAX_JOURNAL_STORIES),
  );
}

function activeJournal(
  journals: Record<string, AiChatAppliedChange[]>,
  storyId: string | null,
): AiChatAppliedChange[] {
  return storyId ? journals[storyId] ?? [] : [];
}

export const useAiChatStore = create<AiChatStoreState>()(persist((set, get) => ({
  messagesByStory: {},
  activeStoryId: null,
  restoredStoryIds: {},
  messages: [],
  status: 'idle',
  pendingInteraction: null,
  appliedChangesByStory: {},
  appliedChanges: [],
  lastAppliedChange: null,

  setActiveStory: (storyId) => set((state) => {
    const appliedChanges = state.appliedChangesByStory[storyId] ?? [];
    const journalTop = toLegacyAppliedChange(appliedChanges.at(-1));
    const compatibleLegacy = state.lastAppliedChange?.storyId === storyId
      ? state.lastAppliedChange
      : null;
    return {
      activeStoryId: storyId,
      messages: state.messagesByStory[storyId] ?? [],
      status: state.pendingInteraction?.storyId === storyId ? 'awaiting_confirmation' : 'idle',
      appliedChanges,
      lastAppliedChange: journalTop ?? compatibleLegacy,
    };
  }),

  addMessage: (role, text, requestedStoryId, attachments) => {
    const message: AiChatMessage = { id: generateId('ai-msg'), role, text: safeText(text), createdAt: Date.now(), ...(attachments?.length ? { attachments } : {}) };
    const storyId = requestedStoryId ?? get().activeStoryId;
    if (!storyId) { set((state) => ({ messages: [...state.messages, message] })); return message; }
    set((state) => {
      const messages = capMessages([...(state.messagesByStory[storyId] ?? []), message]);
      return { messagesByStory: { ...state.messagesByStory, [storyId]: messages }, messages: state.activeStoryId === storyId ? messages : state.messages };
    });
    void reconcileChatAttachments();
    return message;
  },

  clearMessages: (requestedStoryId) => set((state) => {
    const storyId = requestedStoryId ?? state.activeStoryId;
    if (!storyId) return { messages: [] };
    const messagesByStory = { ...state.messagesByStory };
    delete messagesByStory[storyId];
    queueMicrotask(() => { void reconcileChatAttachments(); });
    return { messagesByStory, messages: state.activeStoryId === storyId ? [] : state.messages };
  }),

  markAttachmentImported: (storyId, attachmentId, assetId) => set((state) => {
    const messages = (state.messagesByStory[storyId] ?? []).map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => attachment.id === attachmentId ? { ...attachment, assetId } : attachment),
    }));
    return {
      messagesByStory: { ...state.messagesByStory, [storyId]: messages },
      messages: state.activeStoryId === storyId ? messages : state.messages,
    };
  }),

  setStatus: (status) => set({ status }),

  // Only one proposal can await confirmation at a time: a second one would give
  // the user two Apply buttons whose revisions were computed against different states.
  setPendingInteraction: (pendingInteraction) =>
    set({ pendingInteraction, status: pendingInteraction ? 'awaiting_confirmation' : 'idle' }),

  cancelPendingInteraction: (storyId) => {
    const pendingInteraction = get().pendingInteraction;
    if (!pendingInteraction || (storyId && pendingInteraction.storyId !== storyId)) return null;
    set({ pendingInteraction: null, status: 'idle' });
    return pendingInteraction;
  },

  pushAppliedChange: (change) =>
    set((state) => {
      const appliedChangesByStory = capAppliedChangesByStory({
        ...state.appliedChangesByStory,
        [change.storyId]: [...(state.appliedChangesByStory[change.storyId] ?? []), change],
      });
      const appliedChanges = activeJournal(appliedChangesByStory, state.activeStoryId);
      return {
        appliedChangesByStory,
        appliedChanges,
        lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)),
      };
    }),

  getTopAppliedChange: (requestedStoryId) => {
    const state = get();
    const storyId = requestedStoryId ?? state.activeStoryId;
    return storyId ? state.appliedChangesByStory[storyId]?.at(-1) : undefined;
  },

  popAppliedChange: (requestedStoryId, expected) => {
    const state = get();
    const storyId = requestedStoryId ?? state.activeStoryId;
    const change = storyId ? state.appliedChangesByStory[storyId]?.at(-1) : undefined;
    if (change && expected && change !== expected
      && (change.kind !== expected.kind || change.appliedAt !== expected.appliedAt)) return undefined;
    if (change) set((state) => {
      const appliedChangesByStory = { ...state.appliedChangesByStory };
      const remaining = (appliedChangesByStory[change.storyId] ?? []).slice(0, -1);
      if (remaining.length) appliedChangesByStory[change.storyId] = remaining;
      else delete appliedChangesByStory[change.storyId];
      const appliedChanges = activeJournal(appliedChangesByStory, state.activeStoryId);
      return {
        appliedChangesByStory,
        appliedChanges,
        lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)),
      };
    });
    return change;
  },

  dropAppliedChangesForSnapshot: (storyId, snapshotId) =>
    set((state) => {
      const appliedChangesByStory = { ...state.appliedChangesByStory };
      const remaining = (appliedChangesByStory[storyId] ?? []).filter((change) =>
        !('snapshotId' in change && change.snapshotId === snapshotId));
      if (remaining.length) appliedChangesByStory[storyId] = remaining;
      else delete appliedChangesByStory[storyId];
      const appliedChanges = activeJournal(appliedChangesByStory, state.activeStoryId);
      return {
        appliedChangesByStory,
        appliedChanges,
        lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)),
      };
    }),

  setLastAppliedChange: (lastAppliedChange) => set(lastAppliedChange
    ? { lastAppliedChange }
    : { lastAppliedChange: null, appliedChanges: [], appliedChangesByStory: {} }),
}), {
  name: 'vne-ai-chat',
  storage: createJSONStorage(createPersistentStorage),
  version: 1,
  migrate: (persisted, version) => {
    const state = (persisted ?? {}) as Partial<AiChatStoreState>;
    if (version >= 1) return state as AiChatStoreState;
    const legacyChanges = Array.isArray(state.appliedChanges) ? state.appliedChanges : [];
    const appliedChangesByStory = legacyChanges.reduce<Record<string, AiChatAppliedChange[]>>(
      (journals, change) => ({
        ...journals,
        [change.storyId]: [...(journals[change.storyId] ?? []), change],
      }),
      {},
    );
    return { ...state, appliedChangesByStory } as AiChatStoreState;
  },
  partialize: ({ messagesByStory, appliedChangesByStory }) =>
    ({ messagesByStory, appliedChangesByStory }) as AiChatStoreState,
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    const messagesByStory = removeLegacyTransientMessages(state.messagesByStory);
    const restoredStoryIds = Object.fromEntries(Object.keys(messagesByStory).map((id) => [id, true])) as Record<string, true>;
    const appliedChangesByStory = capAppliedChangesByStory(state.appliedChangesByStory ?? {});
    const appliedChanges = activeJournal(appliedChangesByStory, state.activeStoryId);
    useAiChatStore.setState({
      messagesByStory,
      restoredStoryIds,
      appliedChangesByStory,
      appliedChanges,
      lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)),
    });
    reconcileTranscripts();
    void reconcileChatAttachments();
    void reconcileAppliedChanges();
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

export async function reconcileChatAttachments(): Promise<void> {
  if (!useAiChatStore.persist.hasHydrated()) return;
  const app = useAppStore.getState();
  if (!app.isLoaded) return;
  const messages = Object.values(useAiChatStore.getState().messagesByStory).flat();
  const referencedAttachmentIds = new Set(messages.flatMap((message) => message.attachments?.map((item) => item.id) ?? []));
  await chatAttachmentRepository.reconcile({
    existingStoryIds: new Set(app.storiesMetadata.map((story) => story.id)),
    referencedAttachmentIds,
  }).catch(() => undefined);
}

export async function reconcileAppliedChanges(): Promise<void> {
  if (!useAiChatStore.persist.hasHydrated()) return;
  const app = useAppStore.getState();
  if (!app.isLoaded) return;
  const liveIds = new Set(app.storiesMetadata.map((story) => story.id));
  const storyIds = Object.keys(useAiChatStore.getState().appliedChangesByStory)
    .filter((storyId) => liveIds.has(storyId));
  const snapshotsByStory = new Map(await Promise.all(storyIds.map(async (storyId) => {
      const snapshots = await listSnapshots(createPersistentStorage(), storyId).catch(() => []);
      return [storyId, new Set(snapshots.map((item) => item.id))] as const;
    })));
  useAiChatStore.setState((state) => {
    const appliedChangesByStory = capAppliedChangesByStory(Object.fromEntries(
      Object.entries(state.appliedChangesByStory)
        .filter(([storyId]) => liveIds.has(storyId))
        .map(([storyId, changes]) => {
          const snapshotIds = snapshotsByStory.get(storyId);
          if (!snapshotIds) return [storyId, changes];
          return [storyId, changes.filter((change) =>
            change.kind === 'appearance' || snapshotIds.has(change.snapshotId))];
        }),
    ));
    const appliedChanges = activeJournal(appliedChangesByStory, state.activeStoryId);
    return {
      appliedChangesByStory,
      appliedChanges,
      lastAppliedChange: toLegacyAppliedChange(appliedChanges.at(-1)),
    };
  });
}

useAppStore.subscribe((state, previous) => {
  if (state.isLoaded !== previous.isLoaded || state.storiesMetadata !== previous.storiesMetadata) {
    reconcileTranscripts();
    void reconcileChatAttachments();
    void reconcileAppliedChanges();
  }
});
useAiChatStore.persist.onFinishHydration(() => {
  reconcileTranscripts();
  void reconcileChatAttachments();
  void reconcileAppliedChanges();
});
onSnapshotEvicted((storyId, snapshotId) =>
  useAiChatStore.getState().dropAppliedChangesForSnapshot(storyId, snapshotId));
