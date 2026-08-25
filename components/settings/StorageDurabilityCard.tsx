/**
 * What the browser promises about the stories it is holding.
 *
 * Web storage is best-effort until asked otherwise: under disk pressure a
 * browser may evict a whole origin, and every story goes with it. The author
 * cannot be expected to know that, so the app says how much it is storing and
 * offers to ask for the durable mode.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import {
  formatBytes,
  readStorageDurability,
  requestStorageDurability,
  type StorageDurability,
} from '@/lib/storage-durability';

export function StorageDurabilityCard() {
  const colors = useColors();
  const { t } = useI18n();
  const [state, setState] = useState<StorageDurability | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    void readStorageDurability().then((value) => { if (active) setState(value); });
    return () => { active = false; };
  }, []);

  const ask = useCallback(async () => {
    setAsking(true);
    try {
      setState(await requestStorageDurability());
    } finally {
      setAsking(false);
    }
  }, []);

  // Nothing to say on a platform where files are just files, or before the
  // first read resolves.
  if (!state || state.kind === 'not-applicable') return null;

  const usage = state.kind === 'unsupported' || state.used === undefined
    ? null
    : state.quota
      ? t('settings.storage.usageOfQuota', { used: formatBytes(state.used), quota: formatBytes(state.quota) })
      : t('settings.storage.usage', { used: formatBytes(state.used) });

  return (
    <View>
      <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
        {t(`settings.storage.${state.kind}`)}
      </Text>
      {usage ? (
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20, marginTop: 6 }}>
          {usage}
        </Text>
      ) : null}
      {state.kind === 'best-effort' ? (
        <View style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            onPress={ask}
            disabled={asking}
            accessibilityLabel={t('settings.storage.request')}
          >
            {t('settings.storage.request')}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
