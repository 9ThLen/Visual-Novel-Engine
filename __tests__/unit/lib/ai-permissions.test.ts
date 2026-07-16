import { defaultAiPermissions, normalizeAiPermissions, resolveCapability, setCapabilityLevel } from '@/lib/ai/permissions';

describe('AI permissions', () => {
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
