/**
 * AI mutation permissions. Read tools are always allowed and image import is
 * user-button-only, so neither is represented as a model capability.
 */
export const AI_CAPABILITIES = ['scene_edit', 'appearance', 'changeset', 'image_generate'] as const;
export type AiCapability = typeof AI_CAPABILITIES[number];

export const AI_PERMISSION_LEVELS = ['confirm', 'auto', 'blocked'] as const;
export type AiPermissionLevel = typeof AI_PERMISSION_LEVELS[number];
export type AiPermissions = Record<AiCapability, AiPermissionLevel>;

export interface AiCapabilityEstimate {
  provider?: string;
  model?: string;
  size?: string;
  quality?: string;
  costUsdRange?: { min?: number; max?: number } | null;
}

export function formatUsdEstimate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `$${value.toFixed(3)}`;
  if (!value || typeof value !== 'object') return null;
  const { min, max } = value as { min?: unknown; max?: unknown };
  if (typeof min !== 'number' || !Number.isFinite(min) || typeof max !== 'number' || !Number.isFinite(max)) return null;
  return min === max ? `$${min.toFixed(3)}` : `$${min.toFixed(3)}–$${max.toFixed(3)}`;
}

/**
 * What an agent outside the app may do in the editor — one the author runs
 * themselves and connects through the bridge's MCP endpoint. Off unless the
 * author turns it on. `read` lets it read the story; `propose` also lets it
 * put a change in front of the author. At no level does it write by itself.
 */
export const EXTERNAL_AGENT_ACCESS_LEVELS = ['off', 'read', 'propose'] as const;
export type ExternalAgentAccess = typeof EXTERNAL_AGENT_ACCESS_LEVELS[number];

export function normalizeExternalAgentAccess(value: unknown): ExternalAgentAccess {
  return EXTERNAL_AGENT_ACCESS_LEVELS.includes(value as ExternalAgentAccess) ? value as ExternalAgentAccess : 'off';
}

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
    image_generate: normalizeAiPermissionLevel(input.image_generate) === 'auto'
      ? 'confirm'
      : normalizeAiPermissionLevel(input.image_generate),
  };
}

export function resolveCapability(capability: AiCapability, permissions: AiPermissions): AiPermissionLevel {
  return (capability === 'changeset' || capability === 'image_generate') && permissions[capability] === 'auto'
    ? 'confirm'
    : permissions[capability];
}

export function resolveEffectiveCapability(
  capability: AiCapability,
  permissions: AiPermissions,
  untrustedAttachmentMode: boolean,
): AiPermissionLevel {
  const configured = resolveCapability(capability, permissions);
  if (configured === 'blocked') return 'blocked';
  return untrustedAttachmentMode ? 'confirm' : configured;
}

export function setCapabilityLevel(
  permissions: AiPermissions,
  capability: AiCapability,
  level: AiPermissionLevel,
): AiPermissions {
  return {
    ...permissions,
    [capability]: (capability === 'changeset' || capability === 'image_generate') && level === 'auto'
      ? 'confirm'
      : level,
  };
}
