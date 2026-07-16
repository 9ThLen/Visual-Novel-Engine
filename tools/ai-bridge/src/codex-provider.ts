import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AgentEvent, AgentProvider, AgentSessionContext, ToolInvoker } from './provider';
import { buildSessionSystemPrompt, modelToolErrorValue } from './provider';
import { MODEL_BRIDGE_TOOLS } from '../../../lib/ai/bridge-tools';

const systemPrompt = readFileSync(fileURLToPath(new URL('./system-prompt.md', import.meta.url)), 'utf8');
const schemaPath = fileURLToPath(new URL('./codex-response-schema.json', import.meta.url));
export const CODEX_TOOL_NAMES = new Set(MODEL_BRIDGE_TOOLS.map(tool => tool.name));

type CodexReply = {
  action: 'reply' | 'tool';
  text: string | null;
  toolName: string | null;
  input: Record<string, unknown> | null;
};

export class CodexCliProvider implements AgentProvider {
  private child: ChildProcessWithoutNullStreams | null = null;
  private threadId: string | null = null;

  constructor(private readonly bridge: ToolInvoker, private readonly session?: AgentSessionContext) {}
  get systemPrompt(): string { return buildSessionSystemPrompt(systemPrompt, this.session); }

  abort(): void {
    this.child?.kill();
  }

  async *send(text: string): AsyncIterable<AgentEvent> {
    let prompt = this.threadId
      ? text
      : `${this.systemPrompt}\n\nYou are connected through Codex CLI. Do not use shell, filesystem, or network tools. Return either a final reply or exactly one of the app tool calls listed above, using the required response schema.\n\nUser: ${text}`;

    for (;;) {
      const reply = await this.run(prompt);
      if (reply.action === 'reply') {
        if (reply.text) yield { type: 'text', text: reply.text };
        yield { type: 'done', stopReason: 'end_turn' };
        return;
      }
      if (!reply.toolName || !CODEX_TOOL_NAMES.has(reply.toolName)) throw new Error('Codex returned an unsupported tool call');
      let result: unknown;
      try { result = await this.bridge.call(reply.toolName, reply.input ?? {}); }
      catch (error) { result = modelToolErrorValue(error); }
      prompt = `App tool ${reply.toolName} returned:\n${JSON.stringify(result)}\nContinue the original request. Return another app tool call or the final reply.`;
    }
  }

  private run(prompt: string): Promise<CodexReply> {
    const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
    const args = this.threadId
      ? ['exec', 'resume', this.threadId, '--json', '--sandbox', 'read-only', '--output-schema', schemaPath, '-']
      : ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--output-schema', schemaPath, '-'];

    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe', windowsHide: true });
      this.child = child;
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', code => {
        this.child = null;
        if (code !== 0) return reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}`));
        try {
          let answer = '';
          for (const line of stdout.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as Record<string, unknown>;
            if (event.type === 'thread.started' && typeof event.thread_id === 'string') this.threadId = event.thread_id;
            const item = event.item as Record<string, unknown> | undefined;
            if (event.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') answer = item.text;
          }
          const reply = JSON.parse(answer) as CodexReply;
          if ((reply.action !== 'reply' && reply.action !== 'tool') || (reply.input !== null && typeof reply.input !== 'object')) throw new Error('invalid response');
          resolve(reply);
        } catch {
          reject(new Error('Codex CLI returned an invalid structured response'));
        }
      });
      child.stdin.end(prompt);
    });
  }
}
