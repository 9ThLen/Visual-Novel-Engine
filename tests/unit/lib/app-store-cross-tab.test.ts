import { startAppStoreCrossTabWarning } from '@/lib/app-store-cross-tab.web';
import { useToastStore } from '@/lib/toast-store';

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<(event: MessageEvent) => void>();

  constructor(private readonly name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown) {
    FakeBroadcastChannel.channels.get(this.name)?.forEach((peer) => {
      if (peer === this) return;
      peer.listeners.forEach((listener) => listener({ data } as MessageEvent));
    });
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

describe('app-store cross-tab warning', () => {
  beforeEach(() => {
    FakeBroadcastChannel.channels.clear();
    useToastStore.setState({ toasts: [] });
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warns both tabs when a second app instance announces itself', () => {
    const translate = () => 'Open in another tab';
    const stopFirst = startAppStoreCrossTabWarning(translate);
    const stopSecond = startAppStoreCrossTabWarning(translate);

    expect(useToastStore.getState().toasts).toHaveLength(2);
    expect(useToastStore.getState().toasts.every((toast) => toast.type === 'error')).toBe(true);
    // The text itself is the caller's, translated at the moment the toast is shown.
    expect(useToastStore.getState().toasts[0]?.message).toBe('Open in another tab');

    stopSecond();
    stopFirst();
  });
});
