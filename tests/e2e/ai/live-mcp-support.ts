import { spawn, spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

/**
 * What the live MCP test needs beyond the browser: a client process it can
 * stop for certain, and a way to say whether a change was the one asked for
 * and nothing more. Kept apart from the spec so both can be tested without a
 * signed-in client.
 */

export interface ClientRun {
  code: number | null;
  output: string;
}

export interface ClientProcess {
  done: Promise<ClientRun>;
  /** What the client has said so far. */
  output: () => string;
  /** Ends the client and everything it started, and waits until it is gone. */
  stop: () => Promise<void>;
}

/** Windows starts `claude` and `codex` through a `.cmd` shim, which only a shell runs. */
export function argForShell(arg: string): string {
  return /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/**
 * Starts a client and hands it `input` on stdin.
 *
 * Killing the process Node started is not enough. On Windows that process is
 * the shell the `.cmd` shim needs, and the client is its grandchild; on other
 * systems the npm shim starts the real binary as a child of its own. Either
 * way the client would go on running, and `done` — which waits for its
 * output to close — would never come. So the whole tree is ended: `taskkill
 * /T` on Windows, the process group elsewhere.
 */
export function startClientProcess(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; input: string },
): ClientProcess {
  const windows = process.platform === 'win32';
  const child = windows
    ? spawn([command, ...args].map(argForShell).join(' '), { cwd: options.cwd, env: options.env, shell: true, windowsHide: true })
    : spawn(command, [...args], { cwd: options.cwd, env: options.env, detached: true });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });
  child.stdin.on('error', () => undefined);
  child.stdin.end(options.input);
  let finished = false;
  const done = new Promise<ClientRun>((resolve) => {
    child.on('close', (code) => {
      finished = true;
      resolve({ code, output });
    });
  });

  const stop = async (): Promise<void> => {
    if (finished || child.pid === undefined) return;
    if (windows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      done.then(() => 'gone' as const),
      new Promise<'still running'>((resolve) => { timer = setTimeout(() => resolve('still running'), 15_000); }),
    ]);
    clearTimeout(timer);
    if (outcome !== 'gone') throw new Error(`The client (pid ${child.pid}) was told to stop and is still running.`);
  };

  return { done, output: () => output, stop };
}

export interface StoryStep {
  id: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoryState {
  appearanceRevision: string;
  scenes: Record<string, { revision: string; summary: Record<string, unknown>; timeline: StoryStep[] }>;
}

/** Every scene of the story as it is stored, and the reader appearance, read over MCP. */
export async function storyState(
  read: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  binding: string,
): Promise<StoryState> {
  const state: StoryState = { appearanceRevision: '', scenes: {} };
  for (const { id } of await read('list_scenes', { binding }) as { id: string }[]) {
    const { activeScene, appearance } = await read('get_scene', { binding, sceneId: id }) as {
      activeScene: { revision: string; timeline: StoryStep[] } & Record<string, unknown>;
      appearance: { revision: string };
    };
    const { revision, timeline, ...summary } = activeScene;
    state.scenes[id] = { revision, summary, timeline };
    state.appearanceRevision = appearance.revision;
  }
  return state;
}

/**
 * Everything a change did besides setting `content` on one step. Empty when
 * the change was exactly that. `content` may name more than one acceptable
 * result: what the author selected can be read with or without the line break
 * a triple click takes along.
 *
 * The text showing up somewhere on the page says little: an agent that adds
 * a step with that text, and leaves the selected one as it was, shows it too.
 */
export function changesBeyondTheLine(
  before: StoryState,
  after: StoryState,
  target: { sceneId: string; stepId: string; content: string | readonly string[] },
): string[] {
  const problems: string[] = [];
  if (after.appearanceRevision !== before.appearanceRevision) problems.push('the reader appearance changed');
  const beforeIds = Object.keys(before.scenes).sort();
  const afterIds = Object.keys(after.scenes).sort();
  if (!isDeepStrictEqual(beforeIds, afterIds)) problems.push(`the scenes are not the same: ${beforeIds.join(',')} → ${afterIds.join(',')}`);
  // Otherwise a scene nobody touched would pass for the change.
  if (!before.scenes[target.sceneId]?.timeline.some(step => step.id === target.stepId)) {
    problems.push(`step ${target.stepId} is not in scene ${target.sceneId}`);
  }
  for (const id of beforeIds) {
    const was = before.scenes[id];
    const is = after.scenes[id];
    if (!is) continue;
    if (id !== target.sceneId) {
      if (is.revision !== was.revision) problems.push(`scene ${id} changed`);
      continue;
    }
    if (!isDeepStrictEqual(is.summary, was.summary)) problems.push(`scene ${id} itself changed, beyond its steps`);
    const wasSteps = was.timeline.map(step => step.id);
    const isSteps = is.timeline.map(step => step.id);
    if (!isDeepStrictEqual(isSteps, wasSteps)) {
      problems.push(`steps were added, removed or moved: ${wasSteps.join(',')} → ${isSteps.join(',')}`);
      continue;
    }
    const contents = typeof target.content === 'string' ? [target.content] : target.content;
    was.timeline.forEach((step, index) => {
      const candidates = step.id === target.stepId
        ? contents.map((content) => ({ ...step, data: { ...step.data, content } }))
        : [step];
      if (candidates.some((candidate) => isDeepStrictEqual(is.timeline[index], candidate))) return;
      const what = step.id === target.stepId ? `step ${step.id} is not the selected line rewritten` : `step ${step.id} changed`;
      problems.push(`${what}: ${fieldsApart(candidates[0], is.timeline[index]).join('; ')}`);
    });
  }
  return problems;
}

/** Which fields of a step, and of its `data`, are not what they should be — so a live run says how it went wrong. */
function fieldsApart(expected: StoryStep, actual: StoryStep): string[] {
  const apart = (path: string, want: Record<string, unknown>, got: Record<string, unknown>): string[] =>
    [...new Set([...Object.keys(want), ...Object.keys(got)])]
      .filter((key) => key !== 'data' && !isDeepStrictEqual(want[key], got[key]))
      .map((key) => `${path}${key} ${JSON.stringify(want[key])} → ${JSON.stringify(got[key])}`);
  return [
    ...apart('', expected, actual),
    ...apart('data.', expected.data ?? {}, actual.data ?? {}),
  ];
}
