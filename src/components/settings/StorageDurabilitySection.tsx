/**
 * What the browser promises about the stories it is holding.
 *
 * Web storage is best-effort until asked otherwise: under disk pressure a
 * browser may evict a whole origin, and every story goes with it. The author
 * cannot be expected to know that, so the app says how much it is storing and
 * offers to ask for the durable mode.
 *
 * The promise is the group's footnote and the amount is a reading in its own
 * row, so the section costs two rows rather than three paragraphs.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { SettingsGroup, SettingsRow } from '@/components/settings/list';
import { useI18n } from '@/hooks/use-i18n';
import {
  formatBytes,
  readStorageDurability,
  requestStorageDurability,
  type StorageDurability,
} from '@/lib/storage-durability';

export function StorageDurabilitySection() {
  const { t } = useI18n();
  const [state, setState] = useState<StorageDurability | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    void readStorageDurability().then((value) => { if (active) setState(value); });
    return () => { active = false; };
  }, []);

  const ask = useCallback(async () => {
    if (asking) return;
    setAsking(true);
    try {
      setState(await requestStorageDurability());
    } finally {
      setAsking(false);
    }
  }, [asking]);

  // Nothing to say on a platform where files are just files, or before the
  // first read resolves.
  if (!state || state.kind === 'not-applicable') return null;

  const usage = state.kind === 'unsupported' || state.used === undefined
    ? null
    : state.quota
      ? t('settings.storage.usageOfQuotaShort', { used: formatBytes(state.used), quota: formatBytes(state.quota) })
      : t('settings.storage.usageShort', { used: formatBytes(state.used) });

  return (
    <SettingsGroup title={t('settings.storageSection')} footer={t(`settings.storage.${state.kind}`)}>
      {usage ? (
        <SettingsRow icon="storage" label={t('settings.storageUsed')} value={usage} />
      ) : null}
      {state.kind === 'best-effort' ? (
        <SettingsRow
          icon="lock"
          label={t('settings.storage.request')}
          tone="action"
          onPress={() => { void ask(); }}
        />
      ) : null}
    </SettingsGroup>
  );
}
