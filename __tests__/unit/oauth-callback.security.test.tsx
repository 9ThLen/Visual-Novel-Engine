import { render, waitFor } from '@testing-library/react';
import { setLocalSearchParamsForTests } from '../../__mocks__/expo-router';

import OAuthCallback from '@/app/oauth/callback';
import { OAUTH_STATE_KEY } from '@/constants/oauth';

describe('OAuth callback security', () => {
  beforeEach(() => {
    setLocalSearchParamsForTests({});
    window.sessionStorage.clear();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('does not accept a session token directly from route params', async () => {
    setLocalSearchParamsForTests({ sessionToken: 'attacker-session' });

    const screen = render(<OAuthCallback />);

    await screen.findByText('Authentication failed');
  });

  it('rejects an OAuth code when its state was not generated locally', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setLocalSearchParamsForTests({ code: 'code-1', state: 'attacker-state' });

    const screen = render(<OAuthCallback />);

    await screen.findByText(/OAuth state validation failed/);
    await waitFor(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('completes a valid exchange after the API validates state once', async () => {
    window.sessionStorage.setItem(OAUTH_STATE_KEY, 'valid-state');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        app_session_id: 'session-1',
        user: {
          id: 1,
          openId: 'user-1',
          name: null,
          email: null,
          loginMethod: 'oauth',
          lastSignedIn: new Date().toISOString(),
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    setLocalSearchParamsForTests({ code: 'code-1', state: 'valid-state' });

    const screen = render(<OAuthCallback />);

    await screen.findByText('Authentication successful!');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
  });
});
