// @vitest-environment node
import { createTurnLog, turnProblems } from '../e2e/ai/live-turns';

const frame = (type: string, payload: Record<string, unknown> = {}) => JSON.stringify({ protocolVersion: 5, requestId: 'r', sessionId: 's', type, payload });

describe('how a live test reads a provider turn off the socket', () => {
  it('passes a turn that was answered and ended as a turn should', () => {
    const log = createTurnLog();
    log.receive(frame('assistant_delta', { text: 'Так, ' }));
    log.receive(frame('assistant_delta', { text: 'готовий.' }));
    log.receive(frame('assistant_done', { stopReason: 'end_turn' }));

    expect(log.turns).toEqual([{ text: 'Так, готовий.', stopReason: 'end_turn' }]);
    expect(turnProblems(log.turns[0], { needsText: true })).toEqual([]);
  });

  // Claude Code ends a turn whose result was not a success with this reason,
  // and the editor shows no provider error for it.
  it('fails a turn that ended in an error, with or without words before it', () => {
    const log = createTurnLog();
    log.receive(frame('assistant_done', { stopReason: 'error' }));
    log.receive(frame('assistant_delta', { text: 'Half an answer' }));
    log.receive(frame('assistant_done', { stopReason: 'error' }));

    expect(turnProblems(log.turns[0], { needsText: true })).toEqual(['the turn ended with error', 'the assistant said nothing']);
    expect(turnProblems(log.turns[1])).toEqual(['the turn ended with error']);
  });

  it.each(['timeout', 'interrupted', 'tool_limit', 'max_tokens'])('fails a turn that ended with %s', (stopReason) => {
    const log = createTurnLog();
    log.receive(frame('assistant_delta', { text: 'Something' }));
    log.receive(frame('assistant_done', { stopReason }));

    expect(turnProblems(log.turns[0])).toEqual([`the turn ended with ${stopReason}`]);
  });

  // The bridge reports a provider failing mid-turn as an error, with no end of turn after it.
  it('fails a turn the provider could not complete', () => {
    const log = createTurnLog();
    log.receive(frame('assistant_delta', { text: 'Starting' }));
    log.receive(frame('error', { code: 'PROVIDER_UNAVAILABLE', message: 'The AI provider could not complete the request' }));

    expect(log.turns).toEqual([{ text: 'Starting', error: 'PROVIDER_UNAVAILABLE' }]);
    expect(turnProblems(log.turns[0])).toEqual(['the turn failed with PROVIDER_UNAVAILABLE']);
  });

  it('fails a turn that names no reason, and passes over frames that are not JSON or not about turns', () => {
    const log = createTurnLog();
    log.receive('not json');
    log.receive(frame('tool_call', { toolCallId: 'x' }));
    log.receive(frame('assistant_done', {}));

    expect(log.turns).toHaveLength(1);
    expect(turnProblems(log.turns[0])).toEqual(['the turn ended with no reason']);
  });
});
