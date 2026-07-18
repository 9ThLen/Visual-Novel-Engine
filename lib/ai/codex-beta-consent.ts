export const CURRENT_CODEX_DISCLOSURE_VERSION = 1;
export const CURRENT_CODEX_ISOLATION_POLICY_VERSION = 1;

export interface CodexCapabilityIdentity {
  cliVersion: string;
  disclosureVersion: number;
  isolationPolicyVersion: number;
}

export function validateCodexBetaConsent(consent: unknown, capability: CodexCapabilityIdentity): boolean {
  if (typeof consent !== 'object' || consent === null) return false;
  const value = consent as Record<string, unknown>;
  return typeof value.acceptedAt === 'string'
    && Number.isFinite(Date.parse(value.acceptedAt))
    && value.disclosureVersion === capability.disclosureVersion
    && value.isolationPolicyVersion === capability.isolationPolicyVersion
    && value.codexCliVersion === capability.cliVersion;
}
