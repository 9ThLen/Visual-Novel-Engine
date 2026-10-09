/**
 * The frame's «new scene» command sends the host everything the frame holds,
 * and the host saves it along with the new scene.
 *
 * Typing reports on a debounce. A report still pending when the command runs
 * used to arrive after that save, carrying the same content — and marked the
 * scene unsaved again in an editor the author had just left for the new scene.
 * An editor with unsaved work takes nothing from the store, so that one went
 * stale under the screen above it.
 */
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
// @ts-expect-error The installed jsdom test runtime does not ship declarations.
import { JSDOM } from 'jsdom';

type Posted = { type: string; scene?: { blocks: { content?: string }[] } };

/** Boots the real editor script in a frame and records what it posts to the host. */
function bootFrame() {
  const dom = new JSDOM('<iframe></iframe>', { url: 'http://localhost:3000', runScripts: 'dangerously', pretendToBeVisual: true });
  const target = dom.window.document.querySelector('iframe')!.contentWindow!;
  const posted: Posted[] = [];
  vi.spyOn(dom.window, 'postMessage').mockImplementation((message: Posted) => { posted.push(message); });
  target.document.open();
  target.document.write(createVNPlateEditorHtml({
    editorId: 'frame',
    scene: { sceneId: 'scene-1', sceneName: 'Scene', blocks: [{ id: 'blk_line', kind: 'text', content: 'Rain.' }] },
    characters: [],
    isPhone: false,
  }));
  target.document.close();
  // jsdom has no editing commands, and the format state reads them as soon as
  // a selection sits inside the editor.
  target.document.queryCommandState = () => false;
  target.document.queryCommandValue = () => '';

  const editor = target.document.getElementById('editor') as HTMLElement;
  const line = editor.querySelector('[data-id="blk_line"]') as HTMLElement;

  /** Types at the end of the line, as the browser does: text first, then `input`. */
  const type = (typedText: string) => {
    const text = Array.from(line.childNodes).find((node): node is Text => (node as Node).nodeType === 3)!;
    text.appendData(typedText);
    const range = target.document.createRange();
    range.setStart(text, text.data.length);
    range.collapse(true);
    const selection = target.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    editor.dispatchEvent(new target.Event('input', { bubbles: true }));
  };

  const pickCommand = (commandId: string) => {
    const item = target.document.querySelector(`.slash-item[data-id="${commandId}"]`) as HTMLElement;
    item.dispatchEvent(new target.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  };

  return { dom, posted, type, pickCommand };
}

// Longer than the frame's 260 ms report debounce.
const outlastDebounce = () => new Promise((resolve) => setTimeout(resolve, 400));

const textsOf = (message: Posted) => (message.scene?.blocks ?? [])
  .map((block) => block.content)
  .filter(Boolean);

describe('editor frame «new scene» command', () => {
  let frame: ReturnType<typeof bootFrame>;

  beforeEach(() => {
    frame = bootFrame();
  });

  afterEach(() => {
    frame.dom.window.close();
    vi.restoreAllMocks();
  });

  it('sends what was typed along with the request, reported or not', () => {
    frame.type(' Then thunder. /new');
    frame.pickCommand('newScene');

    const request = frame.posted.find((message) => message.type === 'createNextScene')!;
    expect(textsOf(request)).toEqual(['Rain. Then thunder.']);
    expect(frame.posted.some((message) => message.type === 'save')).toBe(false);
  });

  it('does not report the same content again once the host has it', async () => {
    frame.type(' Then thunder. /new');
    frame.pickCommand('newScene');
    await outlastDebounce();

    const types = frame.posted.map((message) => message.type);
    expect(types).toContain('createNextScene');
    expect(types.slice(types.indexOf('createNextScene') + 1)).not.toContain('save');
  });

  it('still reports what the author types afterwards', async () => {
    frame.type(' /new');
    frame.pickCommand('newScene');
    frame.type(' More.');
    await outlastDebounce();

    const reports = frame.posted.filter((message) => message.type === 'save');
    expect(reports).toHaveLength(1);
    expect(textsOf(reports[0])).toEqual(['Rain. More.']);
  });
});
