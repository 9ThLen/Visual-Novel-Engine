/**
 * hooks/useDialogueHistory.ts — Dialogue history state management.
 *
 * Extracts history tracking from StoryReaderResponsive to reduce its
 * useState/useEffect count.
 */
import { useState, useCallback, useEffect } from 'react';
import type { HistoryEntry } from '@/components/dialogue-history';

export function useDialogueHistory({
  isTyping,
  pageIndex,
  displaySceneId,
  pages,
  extractSpeaker,
}: {
  isTyping: boolean;
  pageIndex: number;
  displaySceneId: string;
  pages: string[];
  extractSpeaker: (text: string) => { speaker: string | null; body: string };
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Add to history when typing completes
  useEffect(() => {
    if (isTyping) return;
    const raw = pages[pageIndex] ?? '';
    const { speaker, body } = extractSpeaker(raw);
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last?.text === body) return h;
      return [
        ...h,
        {
          id: `${displaySceneId}-${pageIndex}-${Date.now()}`,
          speaker: speaker ?? undefined,
          text: body,
          sceneId: displaySceneId,
        },
      ];
    });
  }, [isTyping, pageIndex, displaySceneId, pages, extractSpeaker]);

  const openHistory = useCallback(() => setShowHistory(true), []);
  const closeHistory = useCallback(() => setShowHistory(false), []);

  return { history, showHistory, openHistory, closeHistory };
}
