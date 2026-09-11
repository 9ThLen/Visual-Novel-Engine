import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StudioBridgeSection } from '@/components/ai-chat/StudioBridgeSection';
import { STUDIO_ORIGINS } from '@/lib/ai/studio-origins';

/**
 * The seam is Tauri's IPC, not our wrapper around it.
 *
 * Mocking `@tauri-apps/api` proves less: the real module is what runs in the
 * studio, and putting the spy underneath it shows the command names and
 * arguments survive that layer.
 */
const invoke = vi.fn();

function asStudioShell() {
  Object.defineProperty(window, 'location', { value: { origin: STUDIO_ORIGINS[0] }, writable: true });
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke };
}

function asBrowser() {
  Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:8081' }, writable: true });
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

const READY = { installed: true, ready: true, running: true, url: 'ws://127.0.0.1:8787', token: 'a'.repeat(48) };
const IDLE = { installed: true, ready: false, running: false };
/** A studio built without the bridge package: supported, and pairs manually. */
const NO_BRIDGE = { installed: false, ready: false, running: false };

function lastCall() {
  const call = invoke.mock.calls.at(-1);
  return call ? [call[0] as string, call[1]] : null;
}

describe('starting the bridge the studio carries', () => {
  beforeEach(() => { invoke.mockReset(); });

  it('shows nothing at all outside the installed studio', async () => {
    // A dev server shows the same AI panel, and there the manual form is the
    // only way in. Rendering an offer that cannot work would be worse than none.
    asBrowser();
    const onAvailabilityChange = vi.fn();
    render(<StudioBridgeSection provider="openai" onPaired={vi.fn()} onAvailabilityChange={onAvailabilityChange} />);

    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('button', { name: 'Start the AI bridge' })).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offers to start one, and pairs without the author copying anything', async () => {
    asStudioShell();
    invoke.mockResolvedValueOnce(IDLE).mockResolvedValueOnce(READY);
    const onPaired = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={onPaired} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the AI bridge' })).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the AI bridge' }));
    });

    expect(lastCall()?.[0]).toBe('ai_bridge_start');
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(READY.url, READY.token));
  });

  it('pairs a bridge that was already running when the panel opened', async () => {
    // The studio was reopened, or this panel was closed and opened again.
    asStudioShell();
    invoke.mockResolvedValue(READY);
    const onPaired = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={onPaired} />);

    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(READY.url, READY.token));
    expect(lastCall()?.[0]).toBe('ai_bridge_status');
    // Once, not on every render: re-pairing would drop a live session.
    expect(onPaired).toHaveBeenCalledTimes(1);
  });

  it('steps aside in a studio that carries no bridge', async () => {
    // Built without the package — a supported shape. A start button here could
    // only fail, and it would stand where the manual pairing form belongs.
    asStudioShell();
    invoke.mockResolvedValue(NO_BRIDGE);
    const onAvailabilityChange = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={vi.fn()} onAvailabilityChange={onAvailabilityChange} />);

    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Start the AI bridge' })).toBeNull();
    expect(screen.queryByLabelText('API key for OpenAI API')).toBeNull();
  });

  it('waits out the start the studio began on its own', async () => {
    // The studio starts the bridge as it opens, so an author can reach the panel
    // mid-start. Offering a button then would start a second one.
    asStudioShell();
    invoke.mockResolvedValueOnce({ installed: true, ready: false, running: true })
      .mockResolvedValue(READY);
    const onPaired = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={onPaired} />);

    await waitFor(() => expect(screen.getByText('Starting the AI bridge…')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Start the AI bridge' })).toBeNull();
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(READY.url, READY.token), { timeout: 3000 });
  });

  it('replaces a key the provider rejects, while the bridge is running', async () => {
    // The reported failure. A wrong key is not an empty key: the bridge starts,
    // pairs, and the model refuses every message. The field that fixes it only
    // appeared when the *start* had failed, so there was nowhere to go.
    asStudioShell();
    invoke.mockResolvedValueOnce(READY).mockResolvedValueOnce(READY);
    const onPaired = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={onPaired} />);

    const field = await screen.findByLabelText('Replace the API key for OpenAI API');
    fireEvent.change(field, { target: { value: 'sk-the-right-one' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the key and restart' }));
    });

    expect(lastCall()).toEqual([
      'ai_bridge_save_settings',
      { provider: 'openai', apiKey: 'sk-the-right-one' },
    ]);
    // Restarting killed the process the editor was talking to, so the editor has
    // to be pointed at the new one. Pairing only once left it talking to a
    // socket that had just been closed.
    await waitFor(() => expect(onPaired).toHaveBeenCalledTimes(2));
  });

  it("shows the bridge's own words when it refuses, and offers the key", async () => {
    asStudioShell();
    invoke.mockResolvedValueOnce(IDLE)
      .mockRejectedValueOnce('OPENAI_API_KEY is not set, so openai has nothing to authenticate with.');

    render(<StudioBridgeSection provider="openai" onPaired={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the AI bridge' })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start the AI bridge' }));
    });

    await waitFor(() => expect(screen.getByText(/OPENAI_API_KEY is not set/)).toBeTruthy());
    expect(screen.getByLabelText('API key for OpenAI API')).toBeTruthy();
  });

  it('hands the key over as a value and forgets it', async () => {
    asStudioShell();
    invoke.mockResolvedValueOnce(IDLE)
      .mockRejectedValueOnce('OPENAI_API_KEY is not set.')
      .mockResolvedValueOnce(READY);
    const onPaired = vi.fn();

    render(<StudioBridgeSection provider="openai" onPaired={onPaired} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start the AI bridge' })).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start the AI bridge' })); });

    const field = await screen.findByLabelText('API key for OpenAI API');
    fireEvent.change(field, { target: { value: 'sk-typed-by-the-author' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the key and start' }));
    });

    expect(lastCall()).toEqual([
      'ai_bridge_save_settings',
      { provider: 'openai', apiKey: 'sk-typed-by-the-author' },
    ]);
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(READY.url, READY.token));
    // The studio keeping a copy would be a second place to leak from, for no
    // benefit: the bridge is the only thing that needs it. The field it was
    // typed into is gone — what stands in its place asks for a replacement, and
    // stands empty.
    expect(screen.queryByLabelText('API key for OpenAI API')).toBeNull();
    const replacement = screen.getByLabelText('Replace the API key for OpenAI API') as HTMLInputElement;
    expect(replacement.value).toBe('');
  });
});
