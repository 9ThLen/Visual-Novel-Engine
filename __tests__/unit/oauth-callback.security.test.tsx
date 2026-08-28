import { render, waitFor } from '@testing-library/react';
import { setLocalSearchParamsForTests } from '../../__mocks__/expo-router';

import OAuthCallback from '@/app/oauth/callback';

const authMocks = vi.hoisted(() => ({
  exchangeOAuthCode: vi.fn(),
  setSessionToken: vi.fn(),
  validateOAuthState: vi.fn(),
}));

vi.mock('@/lib/_core/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/_core/api')>(),
  exchangeOAuthCode: authMocks.exchangeOAuthCode,
}));

vi.mock('@/lib/_core/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/_core/auth')>(),
  setSessionToken: authMocks.setSessionToken,
  validateOAuthState: authMocks.validateOAuthState,
}));

describe('OAuth callback security', () => {
  beforeEach(() => {
    setLocalSearchParamsForTests({});
    window.sessionStorage.clear();
    vi.clearAllMocks();
    authMocks.validateOAuthState.mockResolvedValue(false);
  });

  it('does not accept a session token directly from route params', async () => {
    setLocalSearchParamsForTests({ sessionToken: 'attacker-session' });

    const screen = render(<OAuthCallback />);

    await screen.findByText('Authentication failed');
    expect(authMocks.setSessionToken).not.toHaveBeenCalled();
  });

  it('rejects an OAuth code when its state was not generated locally', async () => {
    setLocalSearchParamsForTests({ code: 'code-1', state: 'attacker-state' });

    const screen = render(<OAuthCallback />);

    await screen.findByText('Invalid or expired OAuth state');
    await waitFor(() => {
      expect(authMocks.exchangeOAuthCode).not.toHaveBeenCalled();
      expect(authMocks.setSessionToken).not.toHaveBeenCalled();
    });
  });
});
