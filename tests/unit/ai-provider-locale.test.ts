import { buildSessionSystemPrompt } from '../../tools/ai-bridge/src/provider';

describe('AI provider locale hint', () => {
  it.each(['Claude', 'Codex'])('%s keeps last-message language authoritative', (provider) => {
    const prompt = buildSessionSystemPrompt(`${provider} base prompt`, { locale: 'uk' });
    expect(prompt).toContain('UI locale hint: uk');
    expect(prompt).toMatch(/last message/i);
  });
});
