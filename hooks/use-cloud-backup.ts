import { useCallback, useEffect, useRef, useState } from 'react';

import { isSupabaseBackupConfigured, type CloudBackupSummary } from '@/lib/supabase-backup';
import { getCloudBackup } from '@/stores/cloud-backup';

export type CloudBackupPhase = 'unconfigured' | 'loading' | 'signed-out' | 'code-sent' | 'ready';
export type CloudBackupTask = 'auth' | 'list' | 'backup' | 'restore' | 'delete';

export interface CloudBackupState {
  phase: CloudBackupPhase;
  /** The signed-in address, or the one a code was just sent to. */
  email: string | null;
  backups: CloudBackupSummary[];
  busy: CloudBackupTask | null;
  error: string | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  cancelCode: () => void;
  signOut: () => Promise<void>;
  backupNow: () => Promise<void>;
  restore: (backupId: string) => Promise<void>;
  remove: (backupId: string) => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sign-in is a one-time email code rather than a magic link or an OAuth
 * provider: it is the only method that behaves identically on web and native
 * without a deep-link scheme or per-provider console setup, and the app never
 * handles a password.
 */
export function useCloudBackup(): CloudBackupState {
  const [phase, setPhase] = useState<CloudBackupPhase>(
    isSupabaseBackupConfigured() ? 'loading' : 'unconfigured',
  );
  const [email, setEmail] = useState<string | null>(null);
  const [backups, setBackups] = useState<CloudBackupSummary[]>([]);
  const [busy, setBusy] = useState<CloudBackupTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const summaries = await getCloudBackup().transport.listBackups();
    if (mounted.current) setBackups(summaries);
  }, []);

  const run = useCallback(async (task: CloudBackupTask, action: () => Promise<void>) => {
    setBusy(task);
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(messageOf(cause));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, []);

  // The session outlives the screen, and it can end without us (expiry, a sign
  // out elsewhere), so the phase follows the auth state rather than our actions.
  useEffect(() => {
    if (phase === 'unconfigured') return;

    const { client } = getCloudBackup();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      if (session) {
        setEmail(session.user.email ?? null);
        setPhase('ready');
      } else {
        setBackups([]);
        setPhase((current) => (current === 'code-sent' ? current : 'signed-out'));
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    void run('list', refresh);
  }, [phase, refresh, run]);

  const sendCode = useCallback((address: string) => run('auth', async () => {
    const trimmed = address.trim();
    const { error: failure } = await getCloudBackup().client.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    if (failure) throw failure;
    if (!mounted.current) return;
    setEmail(trimmed);
    setPhase('code-sent');
  }), [run]);

  const verifyCode = useCallback((code: string) => run('auth', async () => {
    if (!email) throw new Error('Request a code first');
    const { error: failure } = await getCloudBackup().client.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    if (failure) throw failure;
    // onAuthStateChange moves us to 'ready'.
  }), [email, run]);

  const cancelCode = useCallback(() => {
    setError(null);
    setPhase('signed-out');
  }, []);

  const signOut = useCallback(() => run('auth', async () => {
    const { error: failure } = await getCloudBackup().client.auth.signOut();
    if (failure) throw failure;
  }), [run]);

  const backupNow = useCallback(() => run('backup', async () => {
    await getCloudBackup().service.createBackup();
    await refresh();
  }), [refresh, run]);

  const restore = useCallback((backupId: string) => run('restore', async () => {
    await getCloudBackup().service.restoreBackup(backupId);
  }), [run]);

  const remove = useCallback((backupId: string) => run('delete', async () => {
    await getCloudBackup().transport.deleteBackup(backupId);
    await refresh();
  }), [refresh, run]);

  return {
    phase, email, backups, busy, error,
    sendCode, verifyCode, cancelCode, signOut, backupNow, restore, remove,
  };
}
