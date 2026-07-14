import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';

import { ScreenContainer } from '@/components/screen-container';
import { Button, ConfirmDialog } from '@/components/ui';
import { useCloudBackup } from '@/hooks/use-cloud-backup';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { showToast } from '@/lib/toast-store';
import type { CloudBackupSummary } from '@/lib/supabase-backup';

type PendingAction = { kind: 'restore' | 'delete'; backup: CloudBackupSummary };

export default function CloudBackupScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const cloud = useCloudBackup();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.foreground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  } as const;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    }}>
      <Text style={{
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );

  const confirmPending = () => {
    if (!pending) return;
    const { kind, backup } = pending;
    setPending(null);
    void (async () => {
      if (kind === 'restore') {
        await cloud.restore(backup.backupId);
        showToast(t('cloudBackup.restoreSuccess'), 'success');
      } else {
        await cloud.remove(backup.backupId);
        showToast(t('cloudBackup.deleteSuccess'), 'success');
      }
    })();
  };

  return (
    <ScreenContainer className="p-4">
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.foreground }}>
          {t('cloudBackup.title')}
        </Text>
        <Button variant="primary" size="sm" onPress={() => router.back()}>
          {t('common.ok')}
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {cloud.error ? (
          <Text style={{ color: colors.error, fontSize: 13, marginBottom: 12 }}>
            {cloud.error}
          </Text>
        ) : null}

        {cloud.phase === 'unconfigured' ? (
          <Section title={t('cloudBackup.title')}>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {t('cloudBackup.unconfigured')}
            </Text>
          </Section>
        ) : null}

        {cloud.phase === 'loading' ? <ActivityIndicator /> : null}

        {cloud.phase === 'signed-out' ? (
          <Section title={t('cloudBackup.signIn')}>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {t('cloudBackup.signInHint')}
            </Text>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              placeholder={t('cloudBackup.emailPlaceholder')}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabel={t('cloudBackup.emailPlaceholder')}
            />
            <Button
              variant="primary"
              disabled={!email.trim()}
              loading={cloud.busy === 'auth'}
              onPress={() => void cloud.sendCode(email)}
            >
              {t('cloudBackup.sendCode')}
            </Button>
          </Section>
        ) : null}

        {cloud.phase === 'code-sent' ? (
          <Section title={t('cloudBackup.signIn')}>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {t('cloudBackup.codeSent', { email: cloud.email ?? '' })}
            </Text>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              placeholder={t('cloudBackup.codePlaceholder')}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              accessibilityLabel={t('cloudBackup.codePlaceholder')}
            />
            <Button
              variant="primary"
              disabled={!code.trim()}
              loading={cloud.busy === 'auth'}
              onPress={() => void cloud.verifyCode(code)}
            >
              {t('cloudBackup.verify')}
            </Button>
            <Button variant="ghost" onPress={() => { setCode(''); cloud.cancelCode(); }}>
              {t('cloudBackup.useAnotherEmail')}
            </Button>
          </Section>
        ) : null}

        {cloud.phase === 'ready' ? (
          <>
            <Section title={t('cloudBackup.account')}>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>
                {t('cloudBackup.signedInAs', { email: cloud.email ?? '' })}
              </Text>
              <Button
                variant="primary"
                loading={cloud.busy === 'backup'}
                disabled={cloud.busy !== null && cloud.busy !== 'backup'}
                onPress={() => void (async () => {
                  await cloud.backupNow();
                  showToast(t('cloudBackup.backupSuccess'), 'success');
                })()}
              >
                {t('cloudBackup.backupNow')}
              </Button>
              <Button variant="ghost" onPress={() => void cloud.signOut()}>
                {t('cloudBackup.signOut')}
              </Button>
            </Section>

            <Section title={t('cloudBackup.snapshots')}>
              {cloud.busy === 'list' ? <ActivityIndicator /> : null}
              {cloud.backups.length === 0 && cloud.busy !== 'list' ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {t('cloudBackup.empty')}
                </Text>
              ) : null}
              {cloud.backups.map((backup) => (
                <View
                  key={backup.backupId}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 12,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>
                    {new Date(backup.createdAt).toLocaleString()}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {t('cloudBackup.snapshotMeta', {
                      appVersion: backup.appVersion,
                      schemaVersion: backup.schemaVersion,
                    })}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cloud.busy !== null}
                      onPress={() => setPending({ kind: 'restore', backup })}
                    >
                      {t('cloudBackup.restore')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={cloud.busy !== null}
                      onPress={() => setPending({ kind: 'delete', backup })}
                    >
                      {t('cloudBackup.delete')}
                    </Button>
                  </View>
                </View>
              ))}
            </Section>
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={pending !== null}
        destructive
        title={pending?.kind === 'delete'
          ? t('cloudBackup.deleteTitle')
          : t('cloudBackup.restoreTitle')}
        message={pending?.kind === 'delete'
          ? t('cloudBackup.deleteMessage')
          : t('cloudBackup.restoreMessage')}
        confirmLabel={pending?.kind === 'delete'
          ? t('cloudBackup.delete')
          : t('cloudBackup.restore')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </ScreenContainer>
  );
}
