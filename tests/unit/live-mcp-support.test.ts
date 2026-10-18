// @vitest-environment node
import {
  changesBeyondTheLine,
  startClientProcess,
  type StoryState,
} from '../e2e/ai/live-mcp-support';

/**
 * A client like the real ones: a launcher that starts the program doing the
 * work and waits for it. The program says its pid and then idles until killed.
 */
const LAUNCHER = [
  "const c=require('child_process').spawn(process.execPath,['-e','console.log(process.pid);setInterval(()=>{},1000)'],{stdio:'inherit'});",
  'setInterval(()=>{},1000)',
].join('');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return check();
}

describe('the live MCP test’s client process', () => {
  it('is stopped with everything it started, and is waited for until it is gone', async () => {
    const client = startClientProcess(process.execPath, ['-e', LAUNCHER], { cwd: process.cwd(), env: process.env, input: '' });
    const workerPid = () => Number(/^(\d+)/m.exec(client.output())?.[1] ?? 0);
    expect(await until(() => workerPid() > 0, 10_000)).toBe(true);
    const worker = workerPid();
    expect(alive(worker)).toBe(true);

    await client.stop();

    expect(await until(() => !alive(worker), 3_000)).toBe(true);
    // `stop` waited for the run to end, so this does not hang.
    await expect(client.done).resolves.toMatchObject({ output: expect.stringContaining(String(worker)) });
  }, 20_000);

  it('hands back what the client said and how it ended when it ends on its own', async () => {
    const client = startClientProcess(process.execPath, ['-e', "process.stdin.pipe(process.stdout)"], { cwd: process.cwd(), env: process.env, input: 'the prompt' });

    await expect(client.done).resolves.toEqual({ code: 0, output: 'the prompt' });
    await client.stop();
  }, 20_000);
});

describe('whether a change was the selected line rewritten and nothing more', () => {
  const step = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, blockType: 'text', data: { content, ...extra } });
  const before: StoryState = {
    appearanceRevision: 'look-1',
    scenes: {
      scene_1: { revision: 'r1', summary: { id: 'scene_1', name: 'Library' }, timeline: [step('a', 'First.'), step('b', 'Second.', { speaker: 'Mira' }), step('c', 'Third.')] },
      scene_2: { revision: 's1', summary: { id: 'scene_2', name: 'Hall' }, timeline: [step('d', 'Elsewhere.')] },
    },
  };
  const target = { sceneId: 'scene_1', stepId: 'b', content: 'Rewritten.' };
  const withScene1 = (timeline: StoryState['scenes'][string]['timeline'], summary = before.scenes.scene_1.summary): StoryState => ({
    ...before,
    scenes: { ...before.scenes, scene_1: { revision: 'r2', summary, timeline } },
  });

  it('is nothing to report for exactly that', () => {
    const after = withScene1([step('a', 'First.'), step('b', 'Rewritten.', { speaker: 'Mira' }), step('c', 'Third.')]);

    expect(changesBeyondTheLine(before, after, target)).toEqual([]);
  });

  it('reports a step added with the text, the selected one left as it was', () => {
    const after = withScene1([step('a', 'First.'), step('b', 'Second.', { speaker: 'Mira' }), step('n', 'Rewritten.'), step('c', 'Third.')]);

    expect(changesBeyondTheLine(before, after, target)).toEqual(['steps were added, removed or moved: a,b,c → a,b,n,c']);
  });

  it('reports the text put into the step next to it', () => {
    const after = withScene1([step('a', 'First.'), step('b', 'Second.', { speaker: 'Mira' }), step('c', 'Rewritten.')]);

    expect(changesBeyondTheLine(before, after, target)).toEqual(['step b is not the selected line rewritten', 'step c changed']);
  });

  it('reports the selected step changed in more than its text', () => {
    const after = withScene1([step('a', 'First.'), step('b', 'Rewritten.'), step('c', 'Third.')]);

    expect(changesBeyondTheLine(before, after, target)).toEqual(['step b is not the selected line rewritten']);
  });

  it('reports anything else in the story that moved', () => {
    const after: StoryState = {
      appearanceRevision: 'look-2',
      scenes: {
        scene_1: { revision: 'r2', summary: { id: 'scene_1', name: 'Library at night' }, timeline: [step('a', 'First.'), step('b', 'Rewritten.', { speaker: 'Mira' }), step('c', 'Third.')] },
        scene_2: { revision: 's2', summary: { id: 'scene_2', name: 'Hall' }, timeline: [step('d', 'Changed too.')] },
      },
    };

    expect(changesBeyondTheLine(before, after, target)).toEqual([
      'the reader appearance changed',
      'scene scene_1 itself changed, beyond its steps',
      'scene scene_2 changed',
    ]);
  });

  it('does not pass a story nobody touched for a change to a step it does not have', () => {
    expect(changesBeyondTheLine(before, before, { ...target, stepId: 'gone' })).toEqual(['step gone is not in scene scene_1']);
  });
});
