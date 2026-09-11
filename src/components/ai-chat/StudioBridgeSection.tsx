import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { aiProviderLabel } from '@/lib/ai/providers';
import {
  isStudioShell,
  saveStudioBridgeSettings,
  startStudioBridge,
  studioBridgeStatus,
  type StudioBridgeResult,
} from '@/lib/ai/studio-bridge';
import { studioBridgeView } from '@/lib/ai/studio-bridge-view';
import type { BridgeProvider } from '@/lib/bridge-protocol';

export interface StudioBridgeSectionProps {
  provider: BridgeProvider;
  /** Called once the bridge is up, with details the author never had to copy. */
  onPaired(url: string, token: string): void;
  /** Told whether this path is available, so the manual form can step aside. */
  onAvailabilityChange?(available: boolean): void;
}

/**
 * Starting the bridge the installed studio carries.
 *
 * Absent everywhere else — a dev server, a browser, a studio built before the
 * commands existed — where the manual URL-and-token form remains the way in.
 *
 * The key field is offered whenever the bridge is not running rather than only
 * when the failure looks like a missing key. The bridge's message is the
 * diagnosis and is shown as it came; deciding what to offer by matching English
 * would break on the first message anyone reworded, and offering the field when
 * the key was not the problem costs an author nothing.
 */
export function StudioBridgeSection({ provider, onPaired, onAvailabilityChange }: StudioBridgeSectionProps) {
  const colors = useColors();
  const { t } = useI18n();
  const [result, setResult] = useState<StudioBridgeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const pairedRef = useRef(false);

  const view = studioBridgeView(result, busy);

  const absorb = useCallback((next: StudioBridgeResult) => {
    setResult(next);
    onAvailabilityChange?.(next.available);
  }, [onAvailabilityChange]);

  // A bridge may already be running: the studio was reopened, or this panel was
  // closed and opened again. Asking costs nothing and saves a pointless start.
  useEffect(() => {
    if (!isStudioShell()) {
      onAvailabilityChange?.(false);
      return;
    }
    let cancelled = false;
    void studioBridgeStatus().then(next => { if (!cancelled) absorb(next); });
    return () => { cancelled = true; };
  }, [absorb, onAvailabilityChange]);

  // Pairing is a side effect of readiness, and must happen once: the details do
  // not change while a bridge stays up, and re-pairing would drop a live session.
  useEffect(() => {
    if (view.kind !== 'paired' || pairedRef.current) return;
    pairedRef.current = true;
    onPaired(view.url, view.token);
  }, [view, onPaired]);

  const run = useCallback(async (action: () => Promise<StudioBridgeResult>) => {
    setBusy(true);
    try {
      absorb(await action());
    } finally {
      setBusy(false);
    }
  }, [absorb]);

  const start = useCallback(() => { void run(startStudioBridge); }, [run]);

  const saveKey = useCallback(() => {
    const key = apiKey.trim();
    if (!key || (provider !== 'openai' && provider !== 'gemini')) return;
    // Forgotten as soon as it is handed over. The bridge is the only thing that
    // needs it, and the studio keeping a copy would be a second place to leak
    // from for no benefit.
    setApiKey('');
    void run(() => saveStudioBridgeSettings(provider, key));
  }, [apiKey, provider, run]);

  if (view.kind === 'absent') return null;

  const canTypeKey = provider === 'openai' || provider === 'gemini';

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.studioBridge.title')}</Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.studioBridge.subtitle')}</Text>
      </View>

      {view.kind === 'busy' ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ color: colors.muted, flex: 1 }}>{t('aiChat.studioBridge.starting')}</Text>
        </View>
      ) : null}

      {view.kind === 'paired' ? (
        <Text style={{ color: colors.foreground }}>{t('aiChat.studioBridge.paired')}</Text>
      ) : null}

      {view.kind === 'blocked' ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.studioBridge.blocked')}</Text>
          {/* The bridge's own words, unedited: they name the variable, the file
              or the folder that needs attention. */}
          <Text style={{ color: colors.muted, fontSize: 12 }} accessibilityLabel={t('aiChat.studioBridge.blocked')}>
            {view.message}
          </Text>
        </View>
      ) : null}

      {view.kind === 'offer' ? (
        <Pressable
          accessibilityRole="button"
          onPress={start}
          style={{ borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.background, fontWeight: '700' }}>{t('aiChat.studioBridge.start')}</Text>
        </Pressable>
      ) : null}

      {view.kind === 'blocked' && canTypeKey ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>
            {t('aiChat.studioBridge.keyLabel', { provider: aiProviderLabel(provider) })}
          </Text>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('aiChat.studioBridge.keyLabel', { provider: aiProviderLabel(provider) })}
            style={{
              borderWidth: 1, borderColor: colors.border, borderRadius: 8,
              paddingHorizontal: 10, minHeight: 44, color: colors.foreground,
            }}
          />
          <Text style={{ color: colors.muted, fontSize: 11 }}>{t('aiChat.studioBridge.keyHint')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={saveKey}
              disabled={!apiKey.trim()}
              style={{
                flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
                backgroundColor: colors.primary, opacity: apiKey.trim() ? 1 : 0.5,
              }}
            >
              <Text style={{ color: colors.background, fontWeight: '700' }}>{t('aiChat.studioBridge.saveKey')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={start}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }}
            >
              <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.studioBridge.retry')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
