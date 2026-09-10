import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ColorScheme } from '@/constants/theme';
import { normalizeLocalBridgeUrl } from '@/lib/ai/bridge-config';
import { AI_PROVIDER_INFO, VISIBLE_AI_PROVIDERS, aiProviderLabel } from '@/lib/ai/providers';
import type { BridgeConnectionState, BridgeProvider } from '@/lib/bridge-client';
import { copyToClipboard, readFromClipboard } from '@/lib/web-utils';

type ProviderChoice = BridgeProvider;
type ImageProviderChoice = 'auto' | 'openai' | 'gemini' | 'none';
const IMAGE_PROVIDER_CHOICES: ImageProviderChoice[] = ['auto', 'openai', 'gemini', 'none'];

export interface ConnectionCardProps {
  state: 'demo' | BridgeConnectionState;
  token: string;
  url: string;
  provider?: BridgeProvider;
  preferredProvider?: BridgeProvider;
  reason?: string;
  retryable?: boolean;
  colorScheme?: ColorScheme;
  onConnect(token: string, url: string, provider: BridgeProvider): void;
  onProviderChange(provider: BridgeProvider): void;
  onRetry(): void;
}

function currentBrowserOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function bridgeCommand(choice: ProviderChoice, imageProvider: ImageProviderChoice, url: string): string {
  const normalized = normalizeLocalBridgeUrl(url);
  let portFlag = '';
  if (normalized.ok) {
    const port = new URL(normalized.url).port;
    if (port && port !== '8787') portFlag = ` --port ${port}`;
  }
  const origin = currentBrowserOrigin();
  const originFlag = origin.startsWith('http://') || origin.startsWith('https://')
    ? ` --origin ${origin}`
    : '';
  return `pnpm ai-bridge --provider ${choice} --image-provider ${imageProvider}${choice === 'codex' ? ' --enable-codex-beta' : ''}${originFlag}${portFlag}`;
}

function CommandRow({
  command,
  copied,
  onCopy,
  colors,
  copyLabel,
}: {
  command: string;
  copied: boolean;
  onCopy(): void;
  colors: ReturnType<typeof useColors>;
  copyLabel: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, padding: 9, backgroundColor: colors.background }}>
      <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'monospace', fontSize: 12 }}>{command}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={copyLabel} onPress={onCopy}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>{copied ? '✓' : copyLabel}</Text>
      </Pressable>
    </View>
  );
}

export function ConnectionCard({
  state,
  token,
  url,
  provider,
  preferredProvider,
  reason,
  retryable,
  colorScheme,
  onConnect,
  onProviderChange,
  onRetry,
}: ConnectionCardProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [value, setValue] = useState(token);
  const [urlValue, setUrlValue] = useState(url);
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>(preferredProvider === 'codex' ? 'openai' : (preferredProvider ?? 'openai'));
  const [imageProviderChoice, setImageProviderChoice] = useState<ImageProviderChoice>('auto');
  const [showInstall, setShowInstall] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [clipboardError, setClipboardError] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState('');
  const copiedCommandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setValue(token), [token]);
  useEffect(() => setUrlValue(url), [url]);
  useEffect(() => setProviderChoice(preferredProvider === 'codex' ? 'openai' : (preferredProvider ?? 'openai')), [preferredProvider]);
  useEffect(() => () => {
    if (copiedCommandTimerRef.current) clearTimeout(copiedCommandTimerRef.current);
  }, []);

  const normalizedUrl = useMemo(() => normalizeLocalBridgeUrl(urlValue), [urlValue]);
  const command = bridgeCommand(providerChoice, imageProviderChoice, normalizedUrl.ok ? normalizedUrl.url : urlValue);
  const selected = AI_PROVIDER_INFO[providerChoice];
  const connected = state === 'connected';
  const hasError = state === 'unauthorized' || state === 'error' || state === 'challenge';
  const localizedReason = reason
    ? t(`aiChat.connection.reason.${reason}`, undefined, t('aiChat.connection.reason.unknown'))
    : '';

  const copy = async (text: string) => {
    if (await copyToClipboard(text)) {
      setCopiedCommand(text);
      if (copiedCommandTimerRef.current) clearTimeout(copiedCommandTimerRef.current);
      copiedCommandTimerRef.current = setTimeout(() => {
        copiedCommandTimerRef.current = null;
        setCopiedCommand(current => current === text ? '' : current);
      }, 1500);
    }
  };

  const pasteToken = async () => {
    const pasted = await readFromClipboard();
    if (pasted === null) {
      setClipboardError(true);
      return;
    }
    setClipboardError(false);
    setValue(pasted.trim());
  };

  const connect = () => {
    if (!normalizedUrl.ok || !value.trim()) return;
    onConnect(value.trim(), normalizedUrl.url, providerChoice);
  };

  if (connected && !showSwitch) {
    return (
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>
            {t('aiChat.connection.connected', { provider: aiProviderLabel(provider) })}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setShowSwitch(true)}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('aiChat.connection.changeProvider')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 15 }}>{t('aiChat.connection.title')}</Text>
        {connected && showSwitch ? (
          <Pressable accessibilityRole="button" onPress={() => setShowSwitch(false)}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>{t('common.cancel')}</Text>
          </Pressable>
        ) : state === 'demo' || state === 'closed' ? (
          <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.connection.demo')}</Text>
        ) : null}
      </View>

      {state === 'connecting' || state === 'reconnecting' ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ color: colors.muted, flex: 1 }}>{t('aiChat.connection.waitingForBridge', { url: normalizedUrl.ok ? normalizedUrl.url : urlValue })}</Text>
        </View>
      ) : null}

      {hasError ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>
            {reason === 'INVALID_TOKEN' || state === 'unauthorized' ? t('aiChat.connection.badToken') : t('aiChat.connection.error')}
          </Text>
          <Text style={{ color: colors.muted }}>{localizedReason || t('aiChat.connection.reason.unknown')}</Text>
          {reason === 'PROVIDER_MISMATCH' && provider && provider !== preferredProvider ? (
            <Pressable accessibilityRole="button" onPress={() => onProviderChange(provider)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('aiChat.connection.useDetectedProvider', { provider: aiProviderLabel(provider) })}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.connection.chooseProvider')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VISIBLE_AI_PROVIDERS.map(choice => {
            const active = providerChoice === choice;
            const unavailable = false;
            return (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={unavailable}
                onPress={() => {
                  setProviderChoice(choice);
                  if (choice !== preferredProvider) onProviderChange(choice);
                }}
                style={{ flexGrow: 1, flexBasis: 140, borderWidth: 1, borderColor: active ? colors.primary : colors.border, borderRadius: 8, padding: 10, opacity: unavailable ? 0.55 : 1 }}
              >
                <Text style={{ color: active ? colors.primary : colors.foreground, textAlign: 'center', fontWeight: '700' }}>{AI_PROVIDER_INFO[choice].label}{AI_PROVIDER_INFO[choice].badge ? ` · ${t(`aiChat.providerBadge.${AI_PROVIDER_INFO[choice].badge}`)}` : ''}</Text>
                <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 10 }}>
                  {unavailable ? t('aiChat.connection.providerUnavailable') : active ? t('aiChat.connection.selected') : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setShowInstall(current => !current)}>
          <Text style={{ color: colors.primary, fontSize: 12 }}>{t('aiChat.connection.install')}</Text>
        </Pressable>
        {showInstall ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.connection.installHint')}</Text>
            {selected.setup.map(step => step.kind === 'command' ? (
              <CommandRow key={step.value} command={step.value} copied={copiedCommand === step.value} onCopy={() => void copy(step.value)} colors={colors} copyLabel={t('aiChat.connection.copy')} />
            ) : (
              <Text key={step.translationKey} style={{ color: colors.muted, fontSize: 11 }}>{t(step.translationKey)}</Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.connection.chooseImageProvider')}</Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.connection.imageProviderHint')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {IMAGE_PROVIDER_CHOICES.map((choice) => {
            const active = imageProviderChoice === choice;
            return (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setImageProviderChoice(choice)}
                style={{ flexGrow: 1, flexBasis: 100, borderWidth: 1, borderColor: active ? colors.primary : colors.border, borderRadius: 8, padding: 9 }}
              >
                <Text style={{ color: active ? colors.primary : colors.foreground, textAlign: 'center', fontWeight: '700', fontSize: 12 }}>
                  {t(`aiChat.connection.imageProvider.${choice}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{t(`aiChat.connection.imageProviderHelp.${imageProviderChoice}`)}</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.connection.startBridge')}</Text>
        <CommandRow command={command} copied={copiedCommand === command} onCopy={() => void copy(command)} colors={colors} copyLabel={t('aiChat.connection.copy')} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.connection.pasteToken')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            accessibilityLabel={t('aiChat.connection.token')}
            value={value}
            onChangeText={setValue}
            secureTextEntry
            placeholder={t('aiChat.connection.token')}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.foreground }}
          />
          <Pressable accessibilityRole="button" onPress={() => void pasteToken()} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ color: colors.foreground }}>{t('aiChat.connection.paste')}</Text>
          </Pressable>
        </View>
        {clipboardError ? <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.connection.clipboardDenied')}</Text> : null}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setShowAdvanced(current => !current)}>
        <Text style={{ color: colors.primary, fontSize: 12 }}>{t('aiChat.connection.advanced')}</Text>
      </Pressable>
      {showAdvanced ? (
        <View style={{ gap: 5 }}>
          <TextInput
            accessibilityLabel={t('aiChat.connection.url')}
            value={urlValue}
            onChangeText={setUrlValue}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ws://127.0.0.1:8787"
            placeholderTextColor={colors.muted}
            style={{ borderWidth: 1, borderColor: normalizedUrl.ok ? colors.border : colors.danger, borderRadius: 8, padding: 8, color: colors.foreground }}
          />
          {!normalizedUrl.ok ? <Text style={{ color: colors.danger, fontSize: 11 }}>{t('aiChat.connection.invalidUrl')}</Text> : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!value.trim() || !normalizedUrl.ok}
        onPress={connect}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 10, opacity: value.trim() && normalizedUrl.ok ? 1 : 0.5 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{t('aiChat.connection.connect')}</Text>
      </Pressable>
      {state === 'closed' ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 9 }}>
          <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '700' }}>{t('aiChat.connection.reconnect')}</Text>
        </Pressable>
      ) : null}
      {hasError && retryable !== false ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 9 }}>
          <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '700' }}>{t('aiChat.connection.retry')}</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>{t('aiChat.connection.privacy')}</Text>
    </View>
  );
}
