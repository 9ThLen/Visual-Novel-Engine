// @vitest-environment node
import { ClaudeConversation } from '../../tools/ai-bridge/src/claude-conversation';

describe('Claude provider conversation lifecycle', () => {
  it('resumes the captured Claude SDK session on the next turn', () => {
    const conversation = new ClaudeConversation();
    expect(conversation.withResume({ settingSources: [] })).not.toHaveProperty('resume');
    conversation.observe({ session_id: 'claude-session-1' });
    expect(conversation.withResume({ settingSources: [] })).toMatchObject({
      resume: 'claude-session-1',
    });
  });

  it('starts without resume after reset', () => {
    const conversation = new ClaudeConversation();
    conversation.observe({ session_id: 'claude-session-1' });
    conversation.reset();
    expect(conversation.withResume({ settingSources: [] })).not.toHaveProperty('resume');
  });
});
