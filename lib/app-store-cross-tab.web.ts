import { showToast } from '@/lib/toast-store';

const CHANNEL_NAME = 'vne_app_state_tabs';

/**
 * Resolves the warning text when it is actually shown, so a tab that has been
 * open since before the author switched languages still warns in the language
 * on screen. `lib/` cannot read the language store itself, so the caller — the
 * root layout, which has the hook — hands one in.
 */
export type TranslateWarning = () => string;

type TabMessage = {
  type: 'hello' | 'present';
  senderId: string;
};

/**
 * Detect another editor tab with the browser's native BroadcastChannel API.
 * Cross-tab merging cannot safely reconcile simultaneous scene edits, so the
 * supported behavior is to warn both tabs and keep the documented single-tab
 * editing invariant explicit.
 */
export function startAppStoreCrossTabWarning(translate: TranslateWarning): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};

  const senderId = crypto.randomUUID();
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let warned = false;

  const warn = () => {
    if (warned) return;
    warned = true;
    showToast(translate(), 'error');
  };
  const send = (type: TabMessage['type']) => channel.postMessage({ type, senderId } satisfies TabMessage);
  const handleMessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    if (!message || message.senderId === senderId) return;
    if (message.type === 'hello') {
      warn();
      send('present');
    } else if (message.type === 'present') {
      warn();
    }
  };
  const announceWhenVisible = () => {
    if (document.visibilityState === 'visible') send('hello');
  };

  channel.addEventListener('message', handleMessage);
  document.addEventListener('visibilitychange', announceWhenVisible);
  send('hello');

  return () => {
    document.removeEventListener('visibilitychange', announceWhenVisible);
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
}
