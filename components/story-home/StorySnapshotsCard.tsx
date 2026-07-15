import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import { Fonts, withAlpha, type ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import { createPersistentStorage } from '@/lib/persistent-storage';
import { showToast } from '@/lib/toast-store';
import {
  deleteSnapshot,
  listSnapshots,
  MAX_SNAPSHOTS_PER_STORY,
  type SnapshotMeta,
} from '@/lib/story-snapshots';
import { useAppStore } from '@/stores/use-app-store';

interface StorySnapshotsCardProps {
  colors: ThemeColorPalette;
  storyId: string;
  style?: StyleProp<ViewStyle>;
}

type PendingAction = { type: 'restore' | 'delete'; snapshot: SnapshotMeta };

function useRelativeTime() {
  const { t } = useI18n();
  return useCallback(
    (timestamp: number): string => {
      const diffMs = Date.now() - timestamp;
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) return t('time.justNow');
      if (minutes < 60) return `${minutes}${t('time.minutesAgo')}`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}${t('time.hoursAgo')}`;
      const days = Math.floor(hours / 24);
      return `${days}${t('time.daysAgo')}`;
    },
    [t],
  );
}

export const StorySnapshotsCard = React.memo(function StorySnapshotsCard({
  colors,
  storyId,
  style,
}: StorySnapshotsCardProps) {
  const { t } = useI18n();
  const formatRelative = useRelativeTime();
  const createStorySnapshot = useAppStore((state) => state.createStorySnapshot);
  const restoreStorySnapshot = useAppStore((state) => state.restoreStorySnapshot);

  const storageRef = useRef<ReturnType<typeof createPersistentStorage> | null>(null);
  if (!storageRef.current) storageRef.current = createPersistentStorage();

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    if (!storageRef.current) return;
    try {
      setSnapshots(await listSnapshots(storageRef.current, storyId));
    } catch {
      setSnapshots([]);
    }
  }, [storyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const name = nameInput.trim() || t('storySnapshots.defaultName');
      await createStorySnapshot(storyId, name);
      setNameInput('');
      await refresh();
      showToast(t('storySnapshots.created'), 'success');
    } catch {
      showToast(t('storySnapshots.createFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, nameInput, createStorySnapshot, storyId, refresh, t]);

  const handleConfirm = useCallback(async () => {
    if (!pending || !storageRef.current) return;
    const action = pending;
    setPending(null);
    setBusy(true);
    try {
      if (action.type === 'restore') {
        await restoreStorySnapshot(storyId, action.snapshot.id);
        showToast(t('storySnapshots.restored'), 'success');
      } else {
        await deleteSnapshot(storageRef.current, storyId, action.snapshot.id);
        showToast(t('storySnapshots.deleted'), 'success');
      }
      await refresh();
    } catch {
      showToast(
        t(action.type === 'restore' ? 'storySnapshots.restoreFailed' : 'storySnapshots.deleteFailed'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }, [pending, restoreStorySnapshot, storyId, refresh, t]);

  const atCap = snapshots.length >= MAX_SNAPSHOTS_PER_STORY;

  return (
    <View style={[styles.card, { backgroundColor: colors['surface-1'], borderColor: colors.border }, style]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.primary, 0.12) }]}>
          <IconSymbol name="timeline" size={18} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('storySnapshots.title')}</Text>
          <Text style={[styles.status, { color: colors.muted }]} numberOfLines={1}>
            {t('storySnapshots.summary', { count: snapshots.length, max: MAX_SNAPSHOTS_PER_STORY })}
          </Text>
        </View>
      </View>

      <View style={styles.createRow}>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder={t('storySnapshots.namePlaceholder')}
          placeholderTextColor={colors.muted}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          maxLength={80}
          editable={!busy}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
          accessibilityLabel={t('storySnapshots.namePlaceholder')}
        />
        <Pressable
          onPress={handleCreate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('storySnapshots.create')}
          style={({ pressed }) => [
            styles.createButton,
            { backgroundColor: colors.secondary, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
          ]}
        >
          <IconSymbol name="add" size={14} color={colors['text-inverse']} />
          <Text style={[styles.createButtonText, { color: colors['text-inverse'] }]}>
            {t('storySnapshots.create')}
          </Text>
        </Pressable>
      </View>
      {atCap ? (
        <Text style={[styles.capHint, { color: colors.muted }]}>
          {t('storySnapshots.capHint', { max: MAX_SNAPSHOTS_PER_STORY })}
        </Text>
      ) : null}

      <View style={styles.list}>
        {snapshots.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.muted }]}>{t('storySnapshots.empty')}</Text>
        ) : (
          snapshots.map((snapshot) => (
            <View key={snapshot.id} style={[styles.item, { borderTopColor: colors.border }]}>
              <View style={styles.itemCopy}>
                <View style={styles.itemTitleRow}>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                    {snapshot.name}
                  </Text>
                  {snapshot.automatic ? (
                    <View style={[styles.autoBadge, { backgroundColor: withAlpha(colors.foreground, 0.09) }]}>
                      <Text style={[styles.autoBadgeText, { color: colors.muted }]}>
                        {t('storySnapshots.autoBadge')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.itemMeta, { color: colors.muted }]} numberOfLines={1}>
                  {t('storySnapshots.itemMeta', {
                    when: formatRelative(snapshot.createdAt),
                    scenes: snapshot.sceneCount,
                    words: snapshot.words,
                  })}
                </Text>
              </View>
              <Pressable
                onPress={() => setPending({ type: 'restore', snapshot })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('storySnapshots.restoreLabel', { name: snapshot.name })}
                style={({ pressed }) => [
                  styles.itemButton,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <IconSymbol name="timeline" size={14} color={colors.foreground} />
                <Text style={[styles.itemButtonText, { color: colors.foreground }]}>
                  {t('storySnapshots.restore')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPending({ type: 'delete', snapshot })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('storySnapshots.deleteLabel', { name: snapshot.name })}
                style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="xmark" size={14} color={colors.muted} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <ConfirmDialog
        visible={pending !== null}
        title={t(
          pending?.type === 'delete'
            ? 'storySnapshots.deleteTitle'
            : 'storySnapshots.restoreTitle',
        )}
        message={t(
          pending?.type === 'delete'
            ? 'storySnapshots.deleteMessage'
            : 'storySnapshots.restoreMessage',
          { name: pending?.snapshot.name ?? '' },
        )}
        confirmLabel={t(
          pending?.type === 'delete' ? 'common.delete' : 'storySnapshots.restore',
        )}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.body,
    fontFamily: Fonts.sans,
    fontWeight: '800',
  },
  status: {
    ...typeScale.caption,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    ...typeScale.caption,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  createButtonText: {
    ...typeScale.caption,
    fontWeight: '800',
  },
  capHint: {
    ...typeScale.caption,
  },
  list: {
    paddingTop: spacing.xs,
  },
  emptyText: {
    ...typeScale.caption,
    paddingVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingVertical: spacing.sm,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  itemName: {
    flexShrink: 1,
    ...typeScale.caption,
    fontWeight: '800',
  },
  autoBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  autoBadgeText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  itemMeta: {
    ...typeScale.caption,
  },
  itemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  itemButtonText: {
    ...typeScale.caption,
    fontWeight: '700',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
