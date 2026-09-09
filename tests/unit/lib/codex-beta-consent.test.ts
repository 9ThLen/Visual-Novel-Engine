import { validateCodexBetaConsent } from '@/lib/ai/codex-beta-consent';

const capability = { cliVersion: '1.2.3', disclosureVersion: 2, isolationPolicyVersion: 4 };

describe('Codex Beta consent validation', () => {
  it('accepts only a current, timestamped capability identity', () => {
    expect(validateCodexBetaConsent({
      acceptedAt: new Date().toISOString(),
      codexCliVersion: '1.2.3',
      disclosureVersion: 2,
      isolationPolicyVersion: 4,
    }, capability)).toBe(true);
    expect(validateCodexBetaConsent({
      acceptedAt: 'invalid',
      codexCliVersion: '1.2.3',
      disclosureVersion: 2,
      isolationPolicyVersion: 4,
    }, capability)).toBe(false);
    expect(validateCodexBetaConsent({
      acceptedAt: new Date().toISOString(),
      codexCliVersion: 'old',
      disclosureVersion: 2,
      isolationPolicyVersion: 4,
    }, capability)).toBe(false);
    expect(validateCodexBetaConsent({ acceptedAt: Symbol('bad') }, capability)).toBe(false);
  });
});
