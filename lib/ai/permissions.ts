/**
 * AI mutation permissions. Read tools are always allowed and image import is
 * user-button-only, so neither is represented as a model capability.
 */
export const AI_CAPABILITIES = ['scene_edit', 'appearance', 'changeset', 'image_generate'] as const;
export type AiCapability = typeof AI_CAPABILITIES[number];

export const AI_PERMISSION_LEVELS = ['confirm', 'auto', 'blocked'] as const;
export type AiPermissionLevel = typeof AI_PERMISSION_LEVELS[number];
export type AiPermissions = Record<AiCapability, AiPermissionLevel>;

export const defaultAiPermissions: AiPermissions = {
  scene_edit: 'confirm',
  appearance: 'confirm',
  changeset: 'confirm',
  image_generate: 'confirm',
};

export function normalizeAiPermissionLevel(value: unknown): AiPermissionLevel {
  return AI_PERMISSION_LEVELS.includes(value as AiPermissionLevel) ? value as AiPermissionLevel : 'confirm';
}

export function normalizeAiPermissions(value: unknown): AiPermissions {
  const input = typeof value === 'object' && value ? value as Partial<Record<AiCapability, unknown>> : {};
  return {
    scene_edit: normalizeAiPermissionLevel(input.scene_edit),
    appearance: normalizeAiPermissionLevel(input.appearance),
    changeset: 'confirm',
    image_generate: normalizeAiPermissionLevel(input.image_generate),
  };
}

export function resolveCapability(capability: AiCapability, permissions: AiPermissions): AiPermissionLevel {
  return capability === 'changeset' && permissions[capability] === 'auto'
    ? 'confirm'
    : permissions[capability];
}

export function setCapabilityLevel(
  permissions: AiPermissions,
  capability: AiCapability,
  level: AiPermissionLevel,
): AiPermissions {
  return { ...permissions, [capability]: capability === 'changeset' && level === 'auto' ? 'confirm' : level };
}
