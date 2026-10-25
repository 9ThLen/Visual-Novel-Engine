/**
 * The comic edits of a scene that do not act as they were made, in the
 * Inspector's Issues (docs/plans/COMIC-STAGE-3-PLAN.md, 3.5): one whose
 * sentence is gone, and one whose words were changed a little. Nothing is
 * fastened anew by guesswork, so the author decides: fasten a lost edit to the
 * sentence under the caret, take a changed one as it is now, or remove either.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { ComicAnchor } from '@/lib/comic/comic-anchors';
import type { ComicEditKind, ComicEditNote } from '@/lib/comic/comic-settings';

type Colors = ReturnType<typeof useColors>;

const KIND_KEYS: Record<ComicEditKind, string> = {
  breaks: 'document.comicIssues.kindBreak',
  merges: 'document.comicIssues.kindMerge',
  panels: 'document.comicIssues.kindPanel',
  elements: 'document.comicIssues.kindWords',
};

interface ComicEditIssuesProps {
  colors: Colors;
  notes: readonly ComicEditNote[];
  /** The words of the scene's sentences now, by anchor: what a changed edit acts on. */
  sentenceText: (anchor: ComicAnchor) => string | null;
  /** The sentence under the author's caret in this scene, if there is one. */
  caretAnchor: ComicAnchor | null;
  /** Fastens the edit to a sentence: the caret's for a lost one, its own for a changed one. Left out, no buttons. */
  onFasten?: (note: ComicEditNote, anchor: ComicAnchor) => void;
  onRemove?: (note: ComicEditNote) => void;
}

export function ComicEditIssues({ colors, notes, sentenceText, caretAnchor, onFasten, onRemove }: ComicEditIssuesProps) {
  const { t } = useI18n();
  if (!notes.length) return null;

  return (
    <View testID="comic-edit-issues" style={{ gap: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{t('document.comicIssues.title', { count: notes.length })}</Text>
      {notes.map((note) => {
        const detached = note.status === 'detached';
        const now = !detached && note.anchor ? sentenceText(note.anchor) : null;
        const key = `${note.kind}:${note.edit.anchor}`;
        return (
          <View
            key={key}
            testID={`comic-issue-${key}`}
            style={{ gap: 6, borderWidth: 1, borderColor: '#d97706', backgroundColor: '#fffbeb', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '800' }}>
              {`${t(KIND_KEYS[note.kind])} · ${t(detached ? 'document.comicIssues.detached' : 'document.comicIssues.changed')}`}
            </Text>
            {note.edit.print ? (
              <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>
                {t('document.comicIssues.madeOn', { words: note.edit.print })}
              </Text>
            ) : null}
            {now ? (
              <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, lineHeight: 16 }}>
                {t('document.comicIssues.now', { words: now })}
              </Text>
            ) : null}
            {onFasten && onRemove ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {detached ? (
                  <IssueButton
                    colors={colors}
                    label={t('document.comicIssues.fasten')}
                    testID={`comic-issue-fasten-${key}`}
                    onPress={caretAnchor ? () => onFasten(note, caretAnchor) : undefined}
                  />
                ) : (
                  <IssueButton
                    colors={colors}
                    label={t('document.comicIssues.checked')}
                    testID={`comic-issue-checked-${key}`}
                    onPress={note.anchor ? () => onFasten(note, note.anchor!) : undefined}
                  />
                )}
                <IssueButton colors={colors} label={t('document.comicIssues.remove')} testID={`comic-issue-remove-${key}`} onPress={() => onRemove(note)} />
              </View>
            ) : null}
            {detached && onFasten && !caretAnchor ? (
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15 }}>{t('document.comicIssues.fastenHint')}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function IssueButton({ colors, label, testID, onPress }: { colors: Colors; label: string; testID: string; onPress?: () => void }) {
  const disabled = !onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={{
        minHeight: 28,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
