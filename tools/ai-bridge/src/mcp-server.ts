/**
 * The bridge's MCP endpoint: the same tools the built-in chat uses, offered to
 * an agent the author runs themselves.
 *
 * It is a facade and nothing more. The tools come from the one registry, the
 * calls go through the gate into the tab that holds the story, and a proposal
 * ends up as the same card the author already knows. Nothing is kept between
 * two HTTP requests here — the server and its transport are made for a request
 * and thrown away after it — so a dropped connection cancels nothing: what has
 * to last lives in the gate.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { EXTERNAL_BRIDGE_TOOLS, type BridgeToolDef } from '../../../src/lib/ai/bridge-tools';
import { MAX_MESSAGE_BYTES } from '../../../src/lib/bridge-protocol';
import { MAX_STATUS_WAIT_SECONDS, type ExternalAgentGate } from './external-agent-gate';
import { modelToolErrorValue } from './provider';

export const MCP_PATH = '/mcp';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const INSTRUCTIONS = [
  'These tools read and change a visual novel that its author has open in an editor in their browser.',
  'Start with get_editor_context: it says where the author is and what they selected, and returns a `binding`.',
  'Pass that binding to every other call. If a call answers BINDING_STALE, the author has opened another story:',
  'call get_editor_context again.',
  'Nothing is written without the author. A propose_* call returns at once with a proposalId and status `pending`;',
  'the author sees the change in the editor and applies or rejects it. Ask get_proposal_status for the outcome.',
  'One proposal waits at a time. After any outcome other than `applied`, read the scene again before proposing more.',
].join(' ');

const BINDING = z.string().min(1).describe('The binding returned by get_editor_context.');
const REQUEST_ID = z.string().min(1).max(200).optional()
  .describe('Your own key for this proposal. Repeating a call with the same key returns the same proposal instead of making a second one.');

export interface McpEndpointOptions {
  /** Not the pairing token: an agent is not the editor and does not get the editor's key. */
  token: string;
  /** Browser origins that may call. A request with no Origin — any agent that is not a web page — is not checked against it. */
  allowedOrigins: ReadonlySet<string>;
  gate: ExternalAgentGate;
  log: (line: string) => void;
  /** Log what was asked and answered. Off, a log line names the tool and how it went, and none of the author's text. */
  debug?: boolean;
  version?: string;
}

/** The tools as an agent sees them: the registry's, with the fields the facade adds. */
export function externalToolSurface(): { name: string; description: string; shape: z.ZodRawShape; definition: BridgeToolDef }[] {
  return EXTERNAL_BRIDGE_TOOLS.map((definition) => {
    const givesBinding = definition.name === 'get_editor_context';
    const proposes = definition.awaitsAuthor === true;
    return {
      name: definition.name,
      description: [
        definition.description,
        givesBinding ? 'Returns the `binding` every other call needs.' : '',
        proposes ? 'Returns at once with a proposalId and status `pending`; read the outcome with get_proposal_status.' : '',
      ].filter(Boolean).join(' '),
      shape: {
        ...definition.inputSchema.shape,
        ...(givesBinding ? {} : { binding: BINDING }),
        ...(proposes ? { requestId: REQUEST_ID } : {}),
      },
      definition,
    };
  });
}

function toolResult(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

function buildServer(options: McpEndpointOptions): McpServer {
  const { gate } = options;
  const server = new McpServer({ name: 'visual-novel-engine', version: options.version ?? '0.0.0' }, { instructions: INSTRUCTIONS });

  /** One external call: counted, timed, logged without its content, and never thrown out of. */
  const run = async (toolName: string, input: unknown, call: () => unknown | Promise<unknown>): Promise<CallToolResult> => {
    const started = Date.now();
    let outcome = 'ok';
    try {
      gate.admit();
      const value = await call();
      if (options.debug) options.log(`AI Bridge external ${toolName} input ${JSON.stringify(input)} output ${JSON.stringify(value)}`);
      return toolResult(value);
    } catch (error) {
      const failure = modelToolErrorValue(error);
      const details = typeof failure.details === 'object' && failure.details !== null ? failure.details as Record<string, unknown> : {};
      outcome = typeof details.reason === 'string' ? details.reason : failure.errorCode;
      if (options.debug) options.log(`AI Bridge external ${toolName} input ${JSON.stringify(input)} error ${JSON.stringify(failure)}`);
      return toolResult(failure, true);
    } finally {
      options.log(`AI Bridge external ${toolName} ${outcome} ${Date.now() - started}ms`);
    }
  };

  for (const tool of externalToolSurface()) {
    const { name, definition } = tool;
    const reads = definition.effect === 'read';
    server.registerTool(name, {
      description: tool.description,
      inputSchema: tool.shape,
      annotations: { readOnlyHint: reads, destructiveHint: false, openWorldHint: false },
    }, (args: Record<string, unknown>) => {
      const { binding, requestId, ...input } = args;
      return run(name, args, () => {
        if (name === 'get_editor_context') return gate.editorContext(args);
        if (definition.awaitsAuthor) return gate.propose(name, String(binding), typeof requestId === 'string' ? requestId : undefined, input);
        return gate.read(name, String(binding), input);
      });
    });
  }

  server.registerTool('get_proposal_status', {
    description: `How a proposal stands: pending, applied, rejected, expired, cancelled, failed or unknown. With waitSeconds (up to ${MAX_STATUS_WAIT_SECONDS}) the call waits that long for the author before answering \`pending\`. \`unknown\` means the editor went away before saying whether the change was written.`,
    inputSchema: {
      binding: z.string().min(1).describe('The binding the proposal was made with.'),
      proposalId: z.string().min(1),
      waitSeconds: z.number().min(0).max(MAX_STATUS_WAIT_SECONDS).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, args => run('get_proposal_status', args, () => gate.proposalStatus(args.proposalId, args.binding, args.waitSeconds)));

  server.registerTool('cancel_proposal', {
    description: 'Take back a proposal the author has not decided on. If the answer is not `cancelled`, the author was faster: the status says how it ended.',
    inputSchema: {
      binding: z.string().min(1).describe('The binding the proposal was made with.'),
      proposalId: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, args => run('cancel_proposal', args, () => gate.cancelProposal(args.proposalId, args.binding)));

  return server;
}

function sameSecret(candidate: string, secret: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(candidate);
  const b = encoder.encode(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function refuse(response: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  const body = new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': body.byteLength, ...headers });
  response.end(body);
}

function hostName(header: string | undefined): string {
  const host = (header ?? '').trim().toLowerCase();
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  const colon = host.lastIndexOf(':');
  return colon < 0 ? host : host.slice(0, colon);
}

/** The body, or null when it is larger than a message may be. */
async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const piece = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk as Uint8Array;
    size += piece.byteLength;
    if (size > MAX_MESSAGE_BYTES) return null;
    chunks.push(piece);
  }
  const whole = new Uint8Array(size);
  let offset = 0;
  for (const piece of chunks) {
    whole.set(piece, offset);
    offset += piece.byteLength;
  }
  return new TextDecoder().decode(whole);
}

/**
 * Answers one HTTP request on the MCP path.
 *
 * A local web page can reach a loopback port as easily as an agent can, so the
 * token is not the only check: the Host must be a loopback name, which a page
 * that got here by rebinding its own domain cannot send, and a request that
 * carries an Origin must carry one the bridge already answers.
 */
export function createMcpEndpoint(options: McpEndpointOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    try {
      if (!LOOPBACK_HOSTS.has(hostName(request.headers.host))) return refuse(response, 403, 'Host is not a loopback address');
      const origin = request.headers.origin;
      if (origin !== undefined && !options.allowedOrigins.has(origin)) return refuse(response, 403, 'Origin is not allowed');
      const authorization = request.headers.authorization ?? '';
      const presented = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() ?? '';
      if (!presented || !sameSecret(presented, options.token)) {
        return refuse(response, 401, 'Missing or invalid MCP token', { 'WWW-Authenticate': 'Bearer realm="vne-ai-bridge"' });
      }
      // Stateless: there is no stream to open and no session to delete.
      if (request.method !== 'POST') return refuse(response, 405, 'Only POST is supported', { Allow: 'POST' });

      const raw = await readBody(request);
      if (raw === null) return refuse(response, 413, `Message exceeds ${MAX_MESSAGE_BYTES} bytes`);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return refuse(response, 400, 'Body is not JSON');
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(', '));
      }
      const server = buildServer(options);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await server.connect(transport);
        const answer = await transport.handleRequest(
          new Request(`http://${request.headers.host}${request.url ?? MCP_PATH}`, { method: 'POST', headers }),
          { parsedBody: body },
        );
        const payload = new Uint8Array(await answer.arrayBuffer());
        // The client may have gone while a status call waited for the author.
        if (response.destroyed) return;
        response.writeHead(answer.status, Object.fromEntries(answer.headers));
        response.end(payload);
      } finally {
        await transport.close().catch(() => undefined);
        await server.close().catch(() => undefined);
      }
    } catch (error) {
      options.log(`AI Bridge external request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      if (!response.headersSent) refuse(response, 500, 'Internal error');
      else response.end();
    }
  };
}
