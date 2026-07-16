import { useAiChatStore, reconcileTranscripts } from '@/stores/ai-chat-store';
import { useAppStore } from '@/stores/use-app-store';

describe('AI chat transcripts', () => {
  beforeEach(() => {
    useAiChatStore.setState({
      messages: [],
      messagesByStory: {},
      activeStoryId: null,
      restoredStoryIds: {},
      pendingInteraction: null,
      status: 'idle',
    });
    useAppStore.setState({ isLoaded: false, storiesMetadata: [] });
  });

  it('keeps stories isolated, clears one story, and caps FIFO at 200', () => {
    const chat = useAiChatStore.getState();
    chat.setActiveStory('a');
    chat.addMessage('user', 'a-only');
    chat.addMessage('user', 'b-only', 'b');
    for (let index = 0; index < 205; index += 1) chat.addMessage('assistant', String(index), 'a');
    expect(useAiChatStore.getState().messagesByStory.a).toHaveLength(200);
    expect(useAiChatStore.getState().messagesByStory.a[0].text).toBe('5');
    expect(useAiChatStore.getState().messagesByStory.b[0].text).toBe('b-only');
    chat.clearMessages('a');
    expect(useAiChatStore.getState().messagesByStory.a).toBeUndefined();
    expect(useAiChatStore.getState().messagesByStory.b).toHaveLength(1);
  });

  it('enforces the byte cap and never retains image base64', () => {
    const chat = useAiChatStore.getState();
    for (let index = 0; index < 20; index += 1) chat.addMessage('assistant', 'x'.repeat(40_000), 'a');
    expect(JSON.stringify(useAiChatStore.getState().messagesByStory.a).length).toBeLessThanOrEqual(512 * 1024);
    chat.addMessage('assistant', 'data:image/png;base64,AAAA', 'a');
    expect(JSON.stringify(useAiChatStore.getState().messagesByStory.a)).not.toContain('base64');
  });

  it('waits for app hydration before pruning and preserves live stories', () => {
    useAiChatStore.setState({ messagesByStory: { live: [], deleted: [] } });
    reconcileTranscripts();
    expect(useAiChatStore.getState().messagesByStory).toHaveProperty('deleted');
    useAppStore.setState({ isLoaded: true, storiesMetadata: [{ id: 'live' } as never] });
    reconcileTranscripts();
    expect(useAiChatStore.getState().messagesByStory).toEqual({ live: [] });
  });

  it('reconciles when app hydration finishes before a late AI transcript hydration', () => {
    useAppStore.setState({ isLoaded: true, storiesMetadata: [{ id: 'live' } as never] });
    reconcileTranscripts();
    useAiChatStore.setState({ messagesByStory: { live: [], deleted: [] } });
    reconcileTranscripts();
    expect(useAiChatStore.getState().messagesByStory).toEqual({ live: [] });
  });

  it('reconciles when AI hydration finishes before app metadata hydration', () => {
    useAiChatStore.setState({ messagesByStory: { live: [], deleted: [] } });
    reconcileTranscripts();
    expect(useAiChatStore.getState().messagesByStory).toHaveProperty('deleted');
    useAppStore.setState({ isLoaded: true, storiesMetadata: [{ id: 'live' } as never] });
    // The production app-store subscription calls this completion path; the
    // lightweight unit store mock intentionally has a no-op subscribe().
    reconcileTranscripts();
    expect(useAiChatStore.getState().messagesByStory).toEqual({ live: [] });
  });

  it('partializes transcripts and the bounded undo journal only', () => {
    const options = useAiChatStore.persist.getOptions();
    const persisted = options.partialize?.(useAiChatStore.getState()) as Record<string, unknown>;
    expect(Object.keys(persisted)).toEqual(['messagesByStory', 'appliedChangesByStory']);
    expect(persisted).not.toHaveProperty('pendingInteraction');
    expect(persisted).not.toHaveProperty('appliedChanges');
  });

  it('round-trips transcripts while dropping live pending state', async () => {
    useAppStore.setState({ isLoaded: true, storiesMetadata: [{ id: 'live' } as never] });
    const storage = useAiChatStore.persist.getOptions().storage;
    useAiChatStore.setState({ messagesByStory: {}, pendingInteraction: null });
    await storage?.setItem('vne-ai-chat', {
      state: { messagesByStory: { live: [{ id: 'm1', role: 'user', text: 'hello', createdAt: 1 }] } },
      version: 0,
    });
    await useAiChatStore.persist.rehydrate();
    expect(useAiChatStore.getState().messagesByStory.live[0].text).toBe('hello');
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
    const durable = await storage?.getItem('vne-ai-chat');
    expect(durable?.state).not.toHaveProperty('pendingInteraction');
    await useAiChatStore.persist.clearStorage();
  });

  it('keeps a pending interaction scoped to its story and cancels it once', () => {
    const chat = useAiChatStore.getState();
    chat.setActiveStory('a');
    chat.setPendingInteraction({
      kind: 'capability',
      storyId: 'a',
      value: { capability: 'image_generate' },
    });
    expect(useAiChatStore.getState().status).toBe('awaiting_confirmation');

    chat.setActiveStory('b');
    expect(useAiChatStore.getState().status).toBe('idle');
    expect(chat.cancelPendingInteraction('b')).toBeNull();
    expect(chat.cancelPendingInteraction('a')).toMatchObject({ kind: 'capability', storyId: 'a' });
    expect(chat.cancelPendingInteraction('a')).toBeNull();
    expect(useAiChatStore.getState().pendingInteraction).toBeNull();
  });

  it('removes legacy connection errors when transcripts are hydrated', async () => {
    useAppStore.setState({ isLoaded: true, storiesMetadata: [{ id: 'live' } as never] });
    const storage = useAiChatStore.persist.getOptions().storage;
    await storage?.setItem('vne-ai-chat', {
      state: {
        messagesByStory: {
          live: [
            { id: 'old-error', role: 'system', text: 'Another session is already active', createdAt: 1 },
            { id: 'assistant', role: 'assistant', text: 'Keep this answer', createdAt: 2 },
          ],
        },
      },
      version: 0,
    });
    await useAiChatStore.persist.rehydrate();
    expect(useAiChatStore.getState().messagesByStory.live).toEqual([
      { id: 'assistant', role: 'assistant', text: 'Keep this answer', createdAt: 2 },
    ]);
    await useAiChatStore.persist.clearStorage();
  });
});
