import { readFileSync, writeFileSync } from 'node:fs';

import { bridgeConfigFile, bridgeSecretsFile } from './config-paths';
import { applySetting, clearSetting, ensureSettingsTemplate } from './config-store';
import { storeSecret, type SecretOptions, type SecretProtection } from './secret-store';

/**
 * Saving the author's API key, from the studio or from a terminal.
 *
 * The studio used to write this file itself, from Rust. That put the settings
 * format in two languages and the key in plain text, and it meant the studio had
 * to know where the file was. Now the bridge does it — the same program that
 * reads the key is the only one that writes it — and the studio's part is to run
 * the bridge with `--save-key` and hand the key over on standard input.
 */
export const KEYED_PROVIDERS = ['openai', 'gemini'] as const;
export type KeyedProvider = (typeof KEYED_PROVIDERS)[number];

export function isKeyedProvider(value: string): value is KeyedProvider {
  return (KEYED_PROVIDERS as readonly string[]).includes(value);
}

/** The environment variable each provider authenticates with. */
export function keyVariableFor(provider: KeyedProvider): string {
  return provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
}

export interface SavedKey {
  provider: KeyedProvider;
  variable: string;
  protection: SecretProtection;
  settingsFile: string;
  secretsFile: string;
  /** True when a plaintext copy was found in the settings file and removed. */
  removedPlaintext: boolean;
}

/**
 * Seals the key, selects the provider, and leaves no plaintext copy behind.
 *
 * The third part is not a tidy-up. A key that stays in `bridge.env` after being
 * sealed is still readable, and it also *wins* nothing — but it is a second
 * answer to the same question, and the author who replaces a rejected key would
 * keep being authenticated by the old one.
 */
export function saveProviderKey(
  dir: string,
  provider: KeyedProvider,
  key: string,
  options: SecretOptions = {},
): SavedKey {
  const plain = key.trim();
  if (!plain) throw new Error('The API key is empty.');

  const settingsFile = bridgeConfigFile(dir);
  const secretsFile = bridgeSecretsFile(dir);

  // Sealed first. If this fails there is nothing to undo, and the settings file
  // has not been told to expect a key that was never stored.
  const sealed = storeSecret(secretsFile, keyVariableFor(provider), plain, options);

  ensureSettingsTemplate(settingsFile);
  const before = readFileSync(settingsFile, 'utf8');
  const variable = keyVariableFor(provider);
  const after = clearSetting(applySetting(before, 'AI_BRIDGE_PROVIDER', provider), variable);
  if (after !== before) {
    writeFileSync(settingsFile, after, { encoding: 'utf8', mode: 0o600 });
  }

  return {
    provider,
    variable,
    protection: sealed.protection,
    settingsFile,
    secretsFile,
    removedPlaintext: clearSetting(before, variable) !== before,
  };
}
