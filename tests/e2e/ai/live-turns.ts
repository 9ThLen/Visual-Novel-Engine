/**
 * How a live test knows a provider's turn went well: from what the bridge
 * told the tab, read off the socket. The page alone cannot say — a turn that
 * ends in an error takes Stop away and frees the composer just as an answered
 * one does, and not every error puts words on the screen.
 */

/** One turn as the bridge reported it. */
export interface ReportedTurn {
  text: string;
  stopReason?: string;
  error?: string;
}

/**
 * The ends a turn may have and still count as answered. Anything else —
 * `error`, `timeout`, `interrupted`, `tool_limit`, a reply cut off at its
 * token limit — is a turn that did not do what it was asked.
 */
const ANSWERED = new Set(['end_turn', 'stop_sequence', 'completed']);

export interface TurnLog {
  turns: ReportedTurn[];
  /** Takes one frame the bridge sent, as text. */
  receive: (frame: string) => void;
}

export function createTurnLog(): TurnLog {
  const turns: ReportedTurn[] = [];
  let text = '';
  return {
    turns,
    receive(frame) {
      let envelope: { type?: unknown; payload?: Record<string, unknown> };
      try {
        envelope = JSON.parse(frame);
      } catch {
        return;
      }
      if (envelope.type === 'assistant_delta') {
        text += String(envelope.payload?.text ?? '');
      } else if (envelope.type === 'assistant_done') {
        turns.push({ text, stopReason: String(envelope.payload?.stopReason ?? '') });
        text = '';
      } else if (envelope.type === 'error') {
        // A provider that fails mid-turn is reported this way, with no
        // assistant_done after it.
        turns.push({ text, error: String(envelope.payload?.code ?? 'error') });
        text = '';
      }
    },
  };
}

/** What was wrong with a turn; empty when it was answered. */
export function turnProblems(turn: ReportedTurn, options: { needsText?: boolean } = {}): string[] {
  const problems: string[] = [];
  if (turn.error) problems.push(`the turn failed with ${turn.error}`);
  else if (!turn.stopReason || !ANSWERED.has(turn.stopReason)) problems.push(`the turn ended with ${turn.stopReason || 'no reason'}`);
  if (options.needsText && !turn.text.trim()) problems.push('the assistant said nothing');
  return problems;
}
