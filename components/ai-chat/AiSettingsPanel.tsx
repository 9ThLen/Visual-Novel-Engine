import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { ColorScheme } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { AiPermissions } from '@/lib/ai/permissions';
import type { BridgeConnectionState, BridgeProvider } from '@/lib/bridge-client';
import type { BridgeCapabilities } from '@/lib/bridge-protocol';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AiPermissionSettings } from './AiPermissionSettings';
import { ConnectionCard } from './ConnectionCard';

export interface AiSettingsPanelProps {
  connectionState: 'demo' | BridgeConnectionState;
  provider?: BridgeProvider;
  preferredProvider?: BridgeProvider;
  reason?: string;
  token: string;
  url: string;
  permissions: AiPermissions;
  capabilities?: BridgeCapabilities;
  requestedModel?: string;
  requestedTokenBudget?: number;
  colorScheme?: ColorScheme;
  onPermissionsChange(value: AiPermissions): void;
  onConnect(token: string, url: string, provider: BridgeProvider): void;
  onRetry(): void;
  onDisconnect(): void;
  onResetConnection(): void;
  onResetConversation(): void;
  onClearLocalData(): void;
  onClose(): void;
  onApplyProviderSettings(model?: string, tokenBudget?: number): void;
}

export function AiSettingsPanel(props: AiSettingsPanelProps) {
  const colors = useColors(props.colorScheme);
  const { t } = useI18n();
  const [confirmClear, setConfirmClear] = useState(false);
  const [model, setModel] = useState(props.requestedModel ?? '');
  const [budget, setBudget] = useState(props.requestedTokenBudget?.toString() ?? '');
  const section = { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 8 } as const;
  const action = (label: string, onPress: () => void, danger = false) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ borderWidth: 1, borderColor: danger ? colors.danger : colors.border, borderRadius: 7, padding: 8 }}>
      <Text style={{ color: danger ? colors.danger : colors.foreground, textAlign: 'center', fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityRole="none" style={{ flex: 1 }}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.settings.title')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={props.onClose}><Text style={{ color: colors.muted }}>✕</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        <View style={section}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.settings.connection')}</Text>
          <ConnectionCard state={props.connectionState} provider={props.provider} preferredProvider={props.preferredProvider} reason={props.reason} token={props.token} url={props.url} colorScheme={props.colorScheme} onConnect={props.onConnect} onRetry={props.onRetry} />
          {props.connectionState === 'connected' ? action(t('aiChat.connection.disconnect'), props.onDisconnect) : null}
        </View>
        <View style={section}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.settings.provider')}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{t('aiChat.settings.bridgeManaged')}</Text>
          {props.provider === 'openai' && props.capabilities?.modelPolicy ? <>
            <TextInput value={model} onChangeText={setModel} editable={!props.capabilities.modelPolicy.modelLocked} placeholder={props.capabilities.modelPolicy.effectiveModel ?? 'Model'} placeholderTextColor={colors.muted} style={{ color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 7, padding: 8 }} />
            <TextInput value={budget} onChangeText={setBudget} editable={!props.capabilities.modelPolicy.tokenBudgetLocked} keyboardType="numeric" placeholder={props.capabilities.modelPolicy.effectiveTokenBudget?.toString() ?? 'Token budget'} placeholderTextColor={colors.muted} style={{ color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 7, padding: 8 }} />
            {action(t('aiChat.settings.applyProvider'), () => props.onApplyProviderSettings(model.trim() || undefined, Number(budget) > 0 ? Math.floor(Number(budget)) : undefined))}
          </> : null}
        </View>
        <View style={section}>
          <AiPermissionSettings permissions={props.permissions} onChange={props.onPermissionsChange} colorScheme={props.colorScheme} />
        </View>
        <View style={section}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('aiChat.settings.attachments')}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{t('aiChat.settings.privacy')}</Text>
        </View>
        <View style={section}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('aiChat.settings.danger')}</Text>
          {action(t('aiChat.settings.clearLocal'), () => setConfirmClear(true), true)}
          {props.connectionState === 'connected' ? action(t('aiChat.settings.resetConversation'), props.onResetConversation, true) : null}
          {action(t('aiChat.connection.reset'), props.onResetConnection, true)}
        </View>
      </ScrollView>
      <ConfirmDialog visible={confirmClear} title={t('aiChat.settings.clearTitle')} message={t('aiChat.settings.clearMessage')} confirmLabel={t('aiChat.settings.clearLocal')} onCancel={() => setConfirmClear(false)} onConfirm={() => { setConfirmClear(false); props.onClearLocalData(); }} />
    </View>
  );
}
