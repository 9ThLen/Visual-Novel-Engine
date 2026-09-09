import { defaultAiPermissions, normalizeAiPermissions, resolveCapability, resolveEffectiveCapability, setCapabilityLevel } from '@/lib/ai/permissions';

describe('AI permissions', () => {
  it('forces auto capabilities to confirmation after an untrusted attachment without unblocking blocked ones', () => {
    expect(resolveEffectiveCapability('scene_edit', { ...defaultAiPermissions, scene_edit: 'auto' }, true)).toBe('confirm');
    expect(resolveEffectiveCapability('scene_edit', { ...defaultAiPermissions, scene_edit: 'blocked' }, true)).toBe('blocked');
  });
  it('defaults invalid values to confirm', () => {
    expect(normalizeAiPermissions({ scene_edit: 'bad', appearance: 'blocked' })).toEqual({
      ...defaultAiPermissions,
      appearance: 'blocked',
    });
  });

  it('never allows changesets to become automatic', () => {
    const permissions = setCapabilityLevel(defaultAiPermissions, 'changeset', 'auto');
    expect(permissions.changeset).toBe('confirm');
    expect(resolveCapability('changeset', { ...permissions, changeset: 'auto' })).toBe('confirm');
  });
});
