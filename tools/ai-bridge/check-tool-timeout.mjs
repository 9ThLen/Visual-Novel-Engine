// A manual check, not part of any test run: it talks to Claude with your own
// Claude Code login.
//
// A proposal waits for the author inside one tool call, and Claude Code ends a
// tool call at a hard limit, MCP_TOOL_TIMEOUT. The bridge starts Claude Code
// with that limit raised above a card's lifetime (see envForAuthorWait). This
// shows whether the limit, passed through the SDK's `env` option, is what
// governs a tool of an in-process SDK server.
//
//   node tools/ai-bridge/check-tool-timeout.mjs 5000 15000
//     a 15 s tool under a 5 s limit: expect the call to be cut off
//   node tools/ai-bridge/check-tool-timeout.mjs 660000 150000
//     a 150 s tool under the bridge's limit: expect its answer to arrive
//   node tools/ai-bridge/check-tool-timeout.mjs default 150000
//     the same tool under Claude Code's own default, to learn what that is
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';

const [limit, sleep] = process.argv.slice(2);
const sleepMs = Number(sleep);
if (!limit || !Number.isFinite(sleepMs)) {
  console.error('usage: node tools/ai-bridge/check-tool-timeout.mjs <MCP_TOOL_TIMEOUT ms | default> <tool duration ms>');
  process.exit(2);
}

const started = Date.now();
let toolFinished = false;
const server = createSdkMcpServer({
  name: 'check',
  version: '1.0.0',
  tools: [
    tool('wait_for_author', 'Waits for the author to decide and returns the decision. Call it exactly once.', {}, async () => {
      await new Promise(resolve => setTimeout(resolve, sleepMs));
      toolFinished = true;
      return { content: [{ type: 'text', text: JSON.stringify({ accepted: true }) }] };
    }),
  ],
});

// `env` replaces the process environment, it is not merged with it.
const env = { ...process.env };
if (limit === 'default') delete env.MCP_TOOL_TIMEOUT;
else env.MCP_TOOL_TIMEOUT = limit;

async function* oneMessage() {
  yield {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'Call the wait_for_author tool exactly once, then say in one short sentence what it returned. Do not call it again.' }] },
    parent_tool_use_id: null,
  };
}

const seen = [];
try {
  for await (const message of query({
    prompt: oneMessage(),
    options: { tools: [], mcpServers: { check: server }, allowedTools: ['mcp__check__wait_for_author'], settingSources: [], strictMcpConfig: true, env, maxTurns: 3 },
  })) {
    if (message.type === 'user') seen.push({ atMs: Date.now() - started, toolResult: JSON.stringify(message.message?.content).slice(0, 240) });
    if (message.type === 'result') seen.push({ atMs: Date.now() - started, result: message.subtype, text: String(message.result ?? '').slice(0, 160) });
  }
} catch (error) {
  seen.push({ atMs: Date.now() - started, error: String(error?.message ?? error).slice(0, 300) });
}
// `toolFinished` is the handler's own view; `seen` is what Claude Code made of the call.
console.log(JSON.stringify({ limit, sleepMs, toolFinished, elapsedMs: Date.now() - started, seen }, null, 1));
