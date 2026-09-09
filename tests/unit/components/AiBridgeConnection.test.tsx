import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ConnectionCard } from '@/components/ai-chat/ConnectionCard';
import { resolveAiBridgeConfig } from '@/lib/ai/bridge-config';

describe('AI bridge connection UI', () => {
  it('clears the copied-command timer when unmounted', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    try {
      const view = render(
        <ConnectionCard
          state="demo"
          token=""
          url="ws://127.0.0.1:8787"
          onConnect={vi.fn()}
          onProviderChange={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
        await Promise.resolve();
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      view.unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prefers persisted runtime settings over environment values', () => {
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_URL', 'ws://localhost:8788');
    vi.stubEnv('EXPO_PUBLIC_AI_BRIDGE_TOKEN', 'env-token');
    expect(resolveAiBridgeConfig({ url: 'ws://localhost:9999', token: 'store-token', disabled: false })).toEqual({
      url: 'ws://localhost:9999',
      token: 'store-token',
      enabled: true,
      preferredProvider: 'openai',
    });
    expect(resolveAiBridgeConfig({ url: '', token: '', disabled: false })).toEqual({
      url: 'ws://localhost:8788',
      token: 'env-token',
      enabled: true,
      preferredProvider: 'openai',
    });
    vi.unstubAllEnvs();
  });

  it('renders onboarding, connecting, failure and connected states', () => {
    const onConnect = vi.fn();
    const onRetry = vi.fn();
    const onProviderChange = vi.fn();
    const common = { token: '', url: 'ws://127.0.0.1:8787', onConnect, onProviderChange, onRetry };
    const view = render(<ConnectionCard state="demo" {...common} />);
    expect(screen.getByText('Connect the AI assistant')).toBeTruthy();
    expect(screen.getByText(/OpenAI API.*Recommended/)).toBeTruthy();
    expect(screen.getAllByText('Google Gemini')).toHaveLength(2);
    expect(screen.queryByText(/Codex.*Beta/)).toBeNull();
    expect(screen.getByText(/pnpm ai-bridge --provider openai --image-provider auto/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Google Gemini' })[0]);
    expect(onProviderChange).toHaveBeenCalledWith('gemini');
    expect(screen.getByText(/pnpm ai-bridge --provider gemini/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Google Gemini' }));
    expect(screen.getByText(/pnpm ai-bridge --provider gemini --image-provider gemini/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Pairing token'), { target: { value: 'new-token' } });
    fireEvent.click(screen.getByText('Connect'));
    expect(onConnect).toHaveBeenCalledWith('new-token', 'ws://127.0.0.1:8787', 'gemini');

    view.rerender(<ConnectionCard state="connecting" {...common} />);
    expect(screen.getByText(/Waiting for the bridge/)).toBeTruthy();
    view.rerender(<ConnectionCard state="unauthorized" {...common} token="bad" reason="INVALID_TOKEN" />);
    expect(screen.getByText(/token does not match/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
    view.rerender(<ConnectionCard state="connected" {...common} token="ok" provider="codex" />);
    expect(screen.getByText(/Connected.*Codex/)).toBeTruthy();
  });

  it('keeps remote bridge URLs out of the local-only onboarding flow', () => {
    render(
      <ConnectionCard
        state="demo"
        token="token"
        url="ws://example.com:8787"
        onConnect={vi.fn()}
        onProviderChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Advanced connection settings'));
    expect(screen.getByText(/Use a local ws/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
