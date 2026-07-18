import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { CapabilityConfirmChip } from '@/components/ai-chat/CapabilityConfirmChip';
import { executeAuthorizeCapability } from '@/components/ai-chat/AiChatPanel';
import { defaultAiPermissions } from '@/lib/ai/permissions';

describe('AI capability authorization', () => {
  it('returns a structured denial when blocked', async () => {
    const result = await executeAuthorizeCapability(
      { capability: 'image_generate' },
      { ...defaultAiPermissions, image_generate: 'blocked' },
      vi.fn(),
      vi.fn(),
    );
    expect(result).toMatchObject({ ok: false, errorCode: 'PERMISSION_DENIED', details: { reason: 'USER_BLOCKED' } });
  });

  it('allows automatic capabilities without showing confirmation', async () => {
    const setPending = vi.fn();
    await expect(executeAuthorizeCapability(
      { capability: 'appearance' },
      { ...defaultAiPermissions, appearance: 'auto' },
      setPending,
      vi.fn(),
    )).resolves.toEqual({ ok: true, result: { allowed: true } });
    expect(setPending).not.toHaveBeenCalled();
  });

  it.each([true, false])('resolves the confirm decision when allowed=%s', async (allowed) => {
    const setPending = vi.fn();
    await expect(executeAuthorizeCapability(
      { capability: 'image_generate', estimate: '$0.04–$0.08' },
      defaultAiPermissions,
      setPending,
      async () => ({ allowed }),
    )).resolves.toEqual({ ok: true, result: { allowed } });
    expect(setPending).toHaveBeenCalledWith({ capability: 'image_generate', estimate: '$0.04–$0.08' });
  });

  it('wires accept and decline buttons', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<CapabilityConfirmChip capability="image_generate" estimate="$0.04" onAccept={onAccept} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDecline).toHaveBeenCalledOnce();
  });
});
