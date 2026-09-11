import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { ClaudeAgentProvider } from './claude-provider';
import { CodexCliProvider } from './codex-provider';
import { GeminiProvider } from './gemini-provider';
import { AiBridgeServer } from './server';
import { bridgeCliHelp, parseBridgeCliArgs, resolveBridgeCliConfig } from './cli-options';
import { checkProviderAuthentication, missingProviderKey } from './cli-launcher';
import { formatBridgeStartupBlock } from './startup-summary';
import { OpenAiProvider } from './openai-provider';
import { RoutingProvider } from './routing-provider';
import type { ToolInvoker } from './provider';
import { imageProviderLabel, resolveImageProvider } from './image-provider-config';
import { bridgeConfigFile, bridgeHomeDir, bridgeSecretsFile, bridgeTokenFile, ensureBridgeHome } from './config-paths';
import { applyEnvDefaults, ensureSettingsTemplate, readEnvFile, settingsSources } from './config-store';
import { IS_PACKAGED_BUILD } from './build-flags';
import { readOrCreateToken, resetStoredToken } from './token-store';
import { isKeyedProvider, saveProviderKey, KEYED_PROVIDERS } from './key-command';
import { revealStoredSecrets } from './secret-store';
import { readAll } from './stdin';

export const BRIDGE_CLI_VERSION = '0.1.0';

// Injected system prompt for API providers
const OPENAI_SYSTEM_PROMPT = readFileSync(fileURLToPath(new URL('./system-prompt.md', import.meta.url)), 'utf8');

/**
 * Settings, in falling priority: the real environment, then the repository
 * `.env`, then the user's own configuration file.
 *
 * Precedence is call order rather than a comparison someone has to keep
 * correct, because `applyEnvDefaults` never overwrites. A checkout therefore
 * behaves exactly as before — the developer's `.env` still wins — while an
 * installed bridge, which has no `.env` and no meaningful working directory,
 * reads the file in its own per-user directory instead of finding nothing.
 */
function loadBridgeSettings(dir: string): void {
  const settingsFile = bridgeConfigFile(dir);
  // A packaged bridge lands on a machine with no settings file and no reason for
  // its owner to know where one goes, so the first run leaves them one to edit.
  if (ensureSettingsTemplate(settingsFile)) {
    console.log(`Wrote a settings file to edit: ${settingsFile}`);
  }
  // Ahead of both files, behind the real environment. The protected store is
  // written by a deliberate, recent action — someone typing a key into the
  // studio — and a key left in a settings file must not quietly outrank the key
  // they just replaced. `--save-key` clears that line as well, so in practice
  // there is only ever one answer; this decides the case where there is not.
  const { values, problems } = revealStoredSecrets(bridgeSecretsFile(dir));
  applyEnvDefaults(process.env, values);
  for (const problem of problems) {
    console.warn(`A saved key could not be opened on this account (${problem}).`);
    console.warn('Enter it again in the studio, or put it in the settings file below.');
  }
  const sources = settingsSources({
    packaged: IS_PACKAGED_BUILD,
    cwdEnvFile: resolve(process.cwd(), '.env'),
    settingsFile,
  });
  for (const source of sources) applyEnvDefaults(process.env, readEnvFile(source));
}

async function main(): Promise<void> {
  const cli = parseBridgeCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(bridgeCliHelp());
    return;
  }
  if (cli.version) {
    console.log(BRIDGE_CLI_VERSION);
    return;
  }

  const bridgeHome = bridgeHomeDir();
  // Before anything secret is written into it. A directory tightened afterwards
  // leaves a window in which the token and the API key were readable.
  const acl = ensureBridgeHome(bridgeHome);
  if (!acl.applied && acl.reason !== 'not-windows') {
    // Not a warning. This directory is about to hold an API key and a pairing
    // token, and continuing after failing to protect them would be the same
    // false assurance this check exists to remove — worse, because it would be
    // printed above the very secret it failed to protect.
    console.error(`Refusing to start: ${bridgeHome} could not be restricted to your account.`);
    console.error(acl.reason);
    console.error('That folder holds your API key and the pairing token. Fix the folder permissions, then start the bridge again.');
    process.exitCode = 1;
    return;
  }

  if (cli.saveKey !== undefined) {
    const provider = cli.saveKey.trim().toLowerCase();
    if (!isKeyedProvider(provider)) {
      console.error(`--save-key takes ${KEYED_PROVIDERS.join(' or ')}, not "${cli.saveKey}".`);
      process.exitCode = 1;
      return;
    }
    // On standard input, never as an argument: a command line is readable by
    // every process on the machine, and this one is the author's API key.
    const saved = saveProviderKey(bridgeHome, provider, await readAll(process.stdin));
    console.log(saved.protection === 'dpapi'
      ? `Saved your ${provider} key, protected for your Windows account: ${saved.secretsFile}`
      : `Saved your ${provider} key to ${saved.secretsFile} (readable only by your user).`);
    if (saved.removedPlaintext) {
      console.log(`Removed the plaintext copy from ${saved.settingsFile}.`);
    }
    return;
  }

  if (cli.resetToken) {
    const rotated = resetStoredToken(bridgeHome);
    console.log(`New bridge token: ${rotated}`);
    console.log(`Stored in: ${bridgeTokenFile(bridgeHome)}`);
    console.log('Re-pair the editor with this token. A bridge that is already running keeps the old one until it is restarted.');
    return;
  }

  loadBridgeSettings(bridgeHome);
  console.log(`Settings: ${bridgeConfigFile(bridgeHome)}`);
  const { origins, port, provider, fallbackProvider, imageProvider: imageProviderSelection, enableCodexBeta } = resolveBridgeCliConfig(cli, process.env);
  if (fallbackProvider === 'gemini' && !process.env.GEMINI_API_KEY?.trim()) {
    throw new Error('--fallback-provider gemini requires GEMINI_API_KEY');
  }
  const imageProvider = resolveImageProvider(imageProviderSelection, provider, process.env);
  const check = (provider === 'claude' || provider === 'codex') ? checkProviderAuthentication(provider) : null;
  if (check && (check.error || check.status !== 0)) {
    const detail = check.error?.message || check.stderr?.trim() || check.stdout?.trim();
    console.error(provider === 'codex'
      ? 'Codex CLI is missing or unavailable. Install @openai/codex, then run: codex login'
      : 'Claude Code CLI is missing or not authenticated. Install @anthropic-ai/claude-code, then run: claude');
    if (detail) console.error(`Provider diagnostic: ${detail}`);
    process.exitCode = 1;
    return;
  }
  // The same courtesy the CLI providers get: say what is missing here, rather
  // than starting and failing on the author's first message, where the editor
  // can only report that something went wrong.
  const missingKey = missingProviderKey(provider, process.env);
  if (missingKey) {
    console.error(`${missingKey} is not set, so ${provider} has nothing to authenticate with.`);
    console.error('Enter it in the studio\'s AI panel, or put it in the bridge settings and start the bridge again:');
    console.error(bridgeConfigFile(bridgeHome));
    process.exitCode = 1;
    return;
  }

  if (imageProvider.provider && !imageProvider.configured) {
    const key = imageProvider.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    console.warn(`Image diagnostic: ${key} is not set; ${imageProviderLabel(imageProvider.provider)} will be unavailable.`);
  } else if (!imageProvider.provider) {
    console.warn('Image diagnostic: no image provider is configured; image generation and editing will be unavailable.');
  }
  // An explicitly configured token still wins, so a checkout can keep sharing one
  // value between the browser and the bridge. Otherwise the stored token is used,
  // issued on first run, so restarting the bridge does not silently invalidate the
  // pairing the editor has saved.
  const token = process.env.AI_BRIDGE_TOKEN
    ?? process.env.EXPO_PUBLIC_AI_BRIDGE_TOKEN
    ?? readOrCreateToken(bridgeHome).token;
  const server = new AiBridgeServer({
    port,
    token,
    provider,
    imageTools: imageProvider.provider ? {
      provider: imageProvider.provider,
      apiKey: imageProvider.provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY,
      model: imageProvider.provider === 'gemini' ? process.env.GEMINI_IMAGE_MODEL : process.env.OPENAI_IMAGE_MODEL,
    } : { provider: 'none' },
    allowedOrigins: origins,
    enableCodexBeta,
    enableClaudeAttachments: process.env.AI_BRIDGE_ENABLE_CLAUDE_ATTACHMENTS === 'true',
    modelPolicy: provider === 'openai' ? {
      defaultModel: process.env.OPENAI_CHAT_MODEL,
      allowedModels: csv(process.env.OPENAI_ALLOWED_CHAT_MODELS),
      defaultTokenBudget: positiveNumber(process.env.OPENAI_SESSION_TOKEN_BUDGET),
      maxTokenBudget: positiveNumber(process.env.OPENAI_MAX_SESSION_TOKEN_BUDGET),
    } : provider === 'gemini' ? {
      defaultModel: process.env.GEMINI_CHAT_MODEL,
      allowedModels: csv(process.env.GEMINI_ALLOWED_CHAT_MODELS),
      defaultTokenBudget: positiveNumber(process.env.GEMINI_SESSION_TOKEN_BUDGET),
      maxTokenBudget: positiveNumber(process.env.GEMINI_MAX_SESSION_TOKEN_BUDGET),
    } : undefined,
    providerFactory: (tools, session) => {
      switch (provider) {
        case 'claude': return new ClaudeAgentProvider(tools, session);
        case 'codex': return new CodexCliProvider(tools, session);
        case 'openai': {
          const createOpenAi = (providerTools: ToolInvoker) => new OpenAiProvider(providerTools, session, {
            apiKey: process.env.OPENAI_API_KEY ?? '',
            model: session?.model ?? process.env.OPENAI_CHAT_MODEL,
            systemPrompt: OPENAI_SYSTEM_PROMPT,
            sessionTokenBudget: session?.sessionTokenBudget ?? positiveNumber(process.env.OPENAI_SESSION_TOKEN_BUDGET),
          });
          if (fallbackProvider !== 'gemini') return createOpenAi(tools);
          const fallbackSession = {
            locale: session?.locale,
            model: process.env.GEMINI_CHAT_MODEL,
            sessionTokenBudget: positiveNumber(process.env.GEMINI_SESSION_TOKEN_BUDGET),
          };
          return new RoutingProvider({
            bridge: tools,
            primary: createOpenAi,
            fallback: providerTools => new GeminiProvider(providerTools, fallbackSession, {
              apiKey: process.env.GEMINI_API_KEY ?? '',
              model: process.env.GEMINI_CHAT_MODEL,
              systemPrompt: OPENAI_SYSTEM_PROMPT,
              sessionTokenBudget: fallbackSession.sessionTokenBudget,
            }),
          });
        }
        case 'gemini': return new GeminiProvider(tools, session, {
          apiKey: process.env.GEMINI_API_KEY ?? '',
          model: session?.model ?? process.env.GEMINI_CHAT_MODEL,
          systemPrompt: OPENAI_SYSTEM_PROMPT,
          sessionTokenBudget: session?.sessionTokenBudget ?? positiveNumber(process.env.GEMINI_SESSION_TOKEN_BUDGET),
        });
      }
    },
  });
  const listeningPort = await server.start();
  console.log(formatBridgeStartupBlock({
    token: server.token,
    port: listeningPort,
    provider,
    fallbackProvider,
    imageProvider: imageProvider.provider,
    imageProviderConfigured: imageProvider.configured,
    imageProviderAlternative: imageProvider.alternativeProvider,
    origins,
  }));
  let stopping = false;
  process.on('SIGINT', () => { if (stopping) return; stopping = true; void server.close().finally(() => process.exit(0)); });
}

function positiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}
function csv(value: string | undefined): string[] | undefined {
  const values = value?.split(',').map(item => item.trim()).filter(Boolean);
  return values?.length ? [...new Set(values)] : undefined;
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
