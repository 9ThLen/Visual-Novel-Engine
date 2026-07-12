import { embeddedCommands, getEmbeddedCommands } from '@/lib/vn-plate-editor/embedded-commands';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { createEmbeddedScript } from '@/lib/vn-plate-editor/embedded-script';

interface EmbeddedHarnessApi {
  insertCommand: (id: string) => void;
  commandMatches: (command: ReturnType<typeof getEmbeddedCommands>[number], query: string) => boolean;
  renderCharacterPopover: (node: HTMLElement) => void;
  getCharacters: () => unknown[];
  undoHistory: () => void;
  redoHistory: () => void;
  saveNow: () => void;
}

function evalEmbeddedScriptForHarness(
  payload: Parameters<typeof createEmbeddedScript>[0],
  commands = embeddedCommands,
): EmbeddedHarnessApi {
  window.eval(`
    (() => {
      ${createEmbeddedScript(payload, commands)}
      window.__embeddedHarnessApi = {
        insertCommand: insertCommand,
        commandMatches: commandMatches,
        renderCharacterPopover: renderCharacterPopover,
        getCharacters: function() { return characters; },
        undoHistory: undoHistory,
        redoHistory: redoHistory,
        saveNow: saveNow
      };
    })();
  `);

  return (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
}

function createSpriteUploadHarness(alphaValues: number[]) {
  document.body.innerHTML = `
    <div class="shell">
      <main class="paper">
        <input id="title" class="title" value="Scene 1" />
        <div id="editor" contenteditable="true" spellcheck="true"></div>
      </main>
    </div>
    <div id="slashMenu" class="slash-menu hidden"></div>
  `;
  const originalFileReader = window.FileReader;
  const originalImage = window.Image;
  const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
  const originalBridge = (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView;

  const messages: { type: string; requestId?: string; dataUri?: string }[] = [];
  (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView = {
    postMessage(message: string) {
      messages.push(JSON.parse(message));
    },
  };

  class MockFileReader {
    result = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File) {
      this.result = `data:${file.type || 'image/png'};base64,AAA=`;
      this.onload?.();
    }
  }

  class MockImage {
    naturalWidth = 2;
    naturalHeight = 1;
    width = 2;
    height = 1;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  }

  (window as unknown as { FileReader: typeof FileReader }).FileReader = MockFileReader as unknown as typeof FileReader;
  (window as unknown as { Image: typeof Image }).Image = MockImage as unknown as typeof Image;
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      drawImage: () => undefined,
      getImageData: () => {
        const data = new Uint8ClampedArray(alphaValues.length * 4);
        alphaValues.forEach((alpha, index) => {
          data[index * 4 + 3] = alpha;
        });
        return { data };
      },
    }),
  });

  const api = evalEmbeddedScriptForHarness({
    editorId: 'editor_sprite_upload',
    scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
    characters: [{
      id: 'char_librarian',
      name: 'Librarian',
      sprites: [],
      color: '#7c3aed',
      createdAt: 1,
    }],
    isPhone: false,
    backgroundAssets: [],
    audioAssets: [],
    scenes: [],
  }, embeddedCommands);

  return {
    api,
    messages,
    /** Deliver a host reply to the embedded editor's message listener. */
    postHostMessage(data: Record<string, unknown>) {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: 'vn-plate-host', editorId: 'editor_sprite_upload', ...data },
      }));
    },
    cleanup() {
      (window as unknown as { FileReader: typeof FileReader }).FileReader = originalFileReader;
      (window as unknown as { Image: typeof Image }).Image = originalImage;
      (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView = originalBridge;
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: originalGetContext,
      });
      delete (window as unknown as { __embeddedHarnessApi?: EmbeddedHarnessApi }).__embeddedHarnessApi;
      document.body.innerHTML = '';
    },
  };
}

function createSnippetHarness() {
  document.body.innerHTML = `
    <div class="shell">
      <main class="paper">
        <input id="title" class="title" value="Scene 1" />
        <div id="editor" contenteditable="true" spellcheck="true"></div>
      </main>
    </div>
    <div id="slashMenu" class="slash-menu hidden"></div>
  `;

  const api = evalEmbeddedScriptForHarness({
    editorId: 'editor_snippets',
    scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
    characters: [],
    isPhone: false,
    backgroundAssets: [],
    audioAssets: [],
    scenes: [],
  }, getEmbeddedCommands('en'));

  return {
    api,
    cleanup() {
      delete (window as unknown as { __embeddedHarnessApi?: EmbeddedHarnessApi }).__embeddedHarnessApi;
      document.body.innerHTML = '';
    },
  };
}

function createVoidBlockHarness() {
  const messages: unknown[] = [];
  const originalBridge = (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView;

  document.body.innerHTML = `
    <div class="shell">
      <main class="paper">
        <input id="title" class="title" value="Scene 1" />
        <div id="editor" contenteditable="true" spellcheck="true"></div>
      </main>
    </div>
    <div id="slashMenu" class="slash-menu hidden"></div>
  `;

  (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView = {
    postMessage(message: string) {
      messages.push(JSON.parse(message));
    },
  };

  evalEmbeddedScriptForHarness({
    editorId: 'editor_void_blocks',
    scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
    characters: [],
    isPhone: false,
    backgroundAssets: [],
    audioAssets: [],
    scenes: [{ id: 'scene_2', name: 'Scene 2' }],
  }, getEmbeddedCommands('en'));

  return {
    messages,
    cleanup() {
      (window as unknown as { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView = originalBridge;
      delete (window as unknown as { __embeddedHarnessApi?: EmbeddedHarnessApi }).__embeddedHarnessApi;
      document.body.innerHTML = '';
    },
  };
}

function placeCaretInNewParagraph(): HTMLParagraphElement {
  const editor = document.getElementById('editor') as HTMLElement;
  const paragraph = document.createElement('p');
  paragraph.dataset.kind = 'text';
  paragraph.dataset.id = 'p_test';
  const text = document.createTextNode('');
  paragraph.appendChild(text);
  editor.appendChild(paragraph);
  const range = document.createRange();
  range.setStart(text, 0);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return paragraph;
}

function appendTextParagraph(editor: HTMLElement, id: string, text = ''): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.dataset.kind = 'text';
  paragraph.dataset.id = id;
  paragraph.appendChild(document.createTextNode(text));
  editor.appendChild(paragraph);
  return paragraph;
}

function appendVoidBlock(editor: HTMLElement, id: string, command: string, extraClass = ''): HTMLElement {
  const block = document.createElement('div');
  block.className = ['void-block', extraClass].filter(Boolean).join(' ');
  block.contentEditable = 'false';
  block.dataset.kind = command === 'choice' ? 'choice' : 'technical';
  block.dataset.id = id;
  if (command === 'choice') {
    block.dataset.choice = JSON.stringify({
      question: 'Choice',
      options: [{ id: 'option_1', text: 'Go', targetSceneId: null }],
    });
  } else {
    block.dataset.command = command;
  }
  if (command === 'transition') {
    block.dataset.mode = 'next';
    block.dataset.targetSceneId = '';
    block.dataset.transitionType = 'fade';
    block.dataset.duration = '0.5';
  }
  return editor.appendChild(block);
}

function placeCaret(paragraph: HTMLParagraphElement, position: 'start' | 'end') {
  const text = paragraph.firstChild ?? paragraph.appendChild(document.createTextNode(''));
  const offset = position === 'start' ? 0 : text.textContent?.length ?? 0;
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function saveMessages(messages: unknown[]) {
  return messages.filter((message): message is { type: string; scene: { blocks: { id: string }[] } } => {
    return Boolean(message && typeof message === 'object' && (message as { type?: string }).type === 'save');
  });
}

function openCharacterPopover(api: EmbeddedHarnessApi) {
  const paragraph = document.createElement('p');
  const token = document.createElement('span');
  token.dataset.characterId = 'char_librarian';
  token.dataset.blockId = 'block_1';
  paragraph.appendChild(token);
  document.body.appendChild(paragraph);
  api.renderCharacterPopover(token);
  return document.querySelector('.character-sprite-file') as HTMLInputElement;
}

// The embedded editor script is assembled as a template string, so tsc never
// parses its contents. Compiling it with the Function constructor (without
// executing) catches syntax errors introduced by edits to the template.
describe('createEmbeddedScript', () => {
  it('undoes one text group at a time and keeps structural block changes atomic', () => {
    const harness = createVoidBlockHarness();
    const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
    const editor = document.getElementById('editor') as HTMLElement;
    const paragraph = editor.querySelector('p') as HTMLParagraphElement;

    paragraph.textContent = 'first';
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'first' }));
    paragraph.textContent = 'first ';
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    paragraph.textContent = 'first second';
    paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'second' }));

    api.undoHistory();
    expect(editor.textContent).toBe('first');
    api.redoHistory();
    expect(editor.textContent).toBe('first second');

    appendVoidBlock(editor, 'block_atomic', 'background', 'background-block');
    api.saveNow();
    expect(editor.querySelector('[data-id="block_atomic"]')).not.toBeNull();
    api.undoHistory();
    expect(editor.querySelector('[data-id="block_atomic"]')).toBeNull();
    expect(editor.textContent).toBe('first second');

    harness.cleanup();
  });

  it('offers every condition operator supported by goto blocks', () => {
    const script = createEmbeddedScript({
      editorId: 'operator_test',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [],
    }, getEmbeddedCommands('en'));

    expect(script).toContain("['==', '!=', '>', '<', '>=', '<=', 'contains', 'isEmpty', 'has', 'not_has']");
  });

  it('generates syntactically valid JavaScript', () => {
    const script = createEmbeddedScript({
      editorId: 'editor_test',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [{ id: 'scene_2', name: 'Next Scene' }],
    }, embeddedCommands);

    expect(() => new Function(script)).not.toThrow();
  });

  it('generates character sprite upload guards for transparent PNG and WebP files', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_sprite_guard_contract',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [],
    });

    expect(html).toContain('class="asset-error" role="alert"');
    expect(html).toContain('accept="image/png,image/webp,image/jpeg"');
    expect(html).toContain('function isAllowedCharacterSpriteFile');
    expect(html).toContain('function isFullyOpaqueImage');
    expect(html).toContain('getImageData');
    expect(html).toContain('reader.onerror');
    expect(html).toContain('img.onerror');
    expect(html).toContain("spriteUploadInput.value = ''");
  });

  it('routes a fully opaque character sprite upload through host background removal', () => {
    const harness = createSpriteUploadHarness([255, 255]);
    try {
      const input = openCharacterPopover(harness.api);
      const file = new File(['opaque'], 'opaque.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });

      input.dispatchEvent(new Event('change', { bubbles: true }));

      // The opaque image is not rejected: a removal request goes to the host
      // and a progress status is shown while nothing is added yet.
      const request = harness.messages.find((message) => message.type === 'removeBackground');
      const status = document.querySelector('.asset-error') as HTMLElement;
      expect(request?.dataUri).toBe('data:image/png;base64,AAA=');
      expect(request?.requestId).toBeTruthy();
      expect(status.style.display).toBe('block');
      expect(status.classList.contains('is-info')).toBe(true);
      expect(status.textContent).toContain('Removing background');
      expect((harness.api.getCharacters() as { sprites: unknown[] }[])[0].sprites).toHaveLength(0);

      harness.postHostMessage({
        type: 'backgroundRemoved',
        requestId: request!.requestId,
        dataUri: 'data:image/png;base64,BBB=',
      });

      const characters = harness.api.getCharacters() as { sprites: { uri: string }[] }[];
      expect(characters[0].sprites).toHaveLength(1);
      expect(characters[0].sprites[0].uri).toBe('data:image/png;base64,BBB=');
    } finally {
      harness.cleanup();
    }
  });

  it('shows an error and adds nothing when host background removal fails', () => {
    const harness = createSpriteUploadHarness([255, 255]);
    try {
      const input = openCharacterPopover(harness.api);
      const file = new File(['opaque'], 'opaque.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });

      input.dispatchEvent(new Event('change', { bubbles: true }));

      const request = harness.messages.find((message) => message.type === 'removeBackground');
      harness.postHostMessage({ type: 'backgroundRemoved', requestId: request!.requestId, dataUri: null });

      const error = document.querySelector('.asset-error') as HTMLElement;
      expect(error.style.display).toBe('block');
      expect(error.classList.contains('is-info')).toBe(false);
      expect(error.textContent).toContain('background removal failed');
      expect((harness.api.getCharacters() as { sprites: unknown[] }[])[0].sprites).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('accepts a character sprite upload when at least one pixel has transparency', () => {
    const harness = createSpriteUploadHarness([255, 0]);
    try {
      const input = openCharacterPopover(harness.api);
      const file = new File(['transparent'], 'transparent.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });

      input.dispatchEvent(new Event('change', { bubbles: true }));

      const characters = harness.api.getCharacters() as { sprites: { uri: string }[] }[];
      expect(characters[0].sprites).toHaveLength(1);
      expect(characters[0].sprites[0].uri).toBe('data:image/png;base64,AAA=');
    } finally {
      harness.cleanup();
    }
  });

  it('localizes embedded slash commands to Ukrainian', () => {
    const commands = getEmbeddedCommands('uk');
    const background = commands.find((command) => command.id === 'background');
    const object = commands.find((command) => command.id === 'interactive_object');

    expect(background).toMatchObject({
      title: 'Фон',
      description: 'Змінити фонове зображення',
    });
    expect(object).toMatchObject({
      title: "Об'єкт",
      description: "Додати інтерактивний об'єкт сцени",
    });

    const script = createEmbeddedScript({
      editorId: 'editor_test',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      language: 'uk',
      backgroundAssets: [],
      audioAssets: [],
      scenes: [{ id: 'scene_2', name: 'Next Scene' }],
    }, commands);

    expect(script).toContain('"title":"Фон"');
    expect(script).toContain('"description":"Змінити фонове зображення"');
    expect(script).toContain("message.type === 'commandsUpdated'");
    expect(script).not.toContain('"title":"Background"');

    const html = createVNPlateEditorHtml({
      editorId: 'editor_test',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      language: 'uk',
      backgroundAssets: [],
      audioAssets: [],
      scenes: [{ id: 'scene_2', name: 'Next Scene' }],
    });

    expect(html).toContain('"title":"Фон"');
    expect(html).toContain('"description":"Змінити фонове зображення"');
  });

  it('matches embedded slash commands by single- and multi-word aliases', () => {
    const commands = getEmbeddedCommands('en');
    const stopEffect = commands.find((command) => command.id === 'stopEffect');
    expect(stopEffect).toBeDefined();

    const harness = createSnippetHarness();
    try {
      expect(harness.api.commandMatches(stopEffect!, 'stop')).toBe(true);
      expect(harness.api.commandMatches(stopEffect!, 'clear effect')).toBe(true);
      expect(harness.api.commandMatches(stopEffect!, 'зупинити ефект')).toBe(true);
      expect(harness.api.commandMatches(stopEffect!, 'missing')).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it('registers the choiceTwoBranches and sceneEnding snippets under a Snippets group', () => {
    const commands = getEmbeddedCommands('en');
    const choiceSnippet = commands.find((command) => command.id === 'choiceTwoBranches');
    const endingSnippet = commands.find((command) => command.id === 'sceneEnding');
    const background = commands.find((command) => command.id === 'background');

    expect(choiceSnippet).toMatchObject({
      group: 'snippet',
      groupLabel: 'Snippets',
      title: 'Choice, two branches',
    });
    expect(endingSnippet).toMatchObject({
      group: 'snippet',
      groupLabel: 'Snippets',
      title: 'Scene ending',
    });
    expect(background?.group).toBeUndefined();
  });

  it('inserts a two-option choice block via the choiceTwoBranches snippet, reusing the existing choice block renderer', () => {
    const harness = createSnippetHarness();
    try {
      const anchorParagraph = placeCaretInNewParagraph();
      harness.api.insertCommand('choiceTwoBranches');

      const choiceBlock = anchorParagraph.nextElementSibling as HTMLElement;
      expect(choiceBlock.classList.contains('choice-block')).toBe(true);
      expect(choiceBlock.dataset.kind).toBe('choice');
      const data = JSON.parse(choiceBlock.dataset.choice || '{}');
      expect(data.options).toHaveLength(2);
      expect(choiceBlock.querySelectorAll('.choice-option-card')).toHaveLength(2);
      // The insertion appends a fresh empty paragraph after the block for continued typing.
      const trailingParagraph = choiceBlock.nextElementSibling as HTMLElement;
      expect(trailingParagraph.tagName).toBe('P');
      expect(trailingParagraph.dataset.kind).toBe('text');
    } finally {
      harness.cleanup();
    }
  });

  it('inserts an end-mode transition block via the sceneEnding snippet, reusing the existing transition block helpers', () => {
    const harness = createSnippetHarness();
    try {
      const anchorParagraph = placeCaretInNewParagraph();
      harness.api.insertCommand('sceneEnding');

      const transitionBlock = anchorParagraph.nextElementSibling as HTMLElement;
      expect(transitionBlock.classList.contains('transition-block')).toBe(true);
      expect(transitionBlock.dataset.command).toBe('transition');
      expect(transitionBlock.dataset.mode).toBe('end');
    } finally {
      harness.cleanup();
    }
  });

  it('deletes a transition block with a double Backspace from the following paragraph', () => {
    const harness = createVoidBlockHarness();
    try {
      const editor = document.getElementById('editor') as HTMLElement;
      editor.innerHTML = '';
      appendTextParagraph(editor, 'before', 'Before');
      const transition = appendVoidBlock(editor, 'transition_1', 'transition', 'transition-block');
      const after = appendTextParagraph(editor, 'after');
      placeCaret(after, 'start');

      pressKey('Backspace');
      expect(transition.classList.contains('is-selected')).toBe(true);
      expect(editor.contains(transition)).toBe(true);

      pressKey('Backspace');
      expect(editor.contains(transition)).toBe(false);
      expect(saveMessages(harness.messages).at(-1)?.scene.blocks.some((block) => block.id === 'transition_1')).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it('deletes background and choice void blocks with boundary keyboard commands', () => {
    const harness = createVoidBlockHarness();
    try {
      const editor = document.getElementById('editor') as HTMLElement;
      editor.innerHTML = '';
      const beforeBackground = appendTextParagraph(editor, 'before_background', 'Before');
      const background = appendVoidBlock(editor, 'background_1', 'background', 'background-block');
      const beforeChoice = appendTextParagraph(editor, 'before_choice', 'Middle');
      const choice = appendVoidBlock(editor, 'choice_1', 'choice', 'choice-block');
      const afterChoice = appendTextParagraph(editor, 'after_choice');

      placeCaret(beforeBackground, 'end');
      pressKey('Delete');
      expect(background.classList.contains('is-selected')).toBe(true);
      pressKey('Delete');
      expect(editor.contains(background)).toBe(false);

      placeCaret(afterChoice, 'start');
      pressKey('Backspace');
      expect(choice.classList.contains('is-selected')).toBe(true);
      pressKey('Backspace');
      expect(editor.contains(choice)).toBe(false);

      const saved = saveMessages(harness.messages).at(-1);
      expect(saved?.scene.blocks.some((block) => block.id === 'background_1')).toBe(false);
      expect(saved?.scene.blocks.some((block) => block.id === 'choice_1')).toBe(false);
      expect(editor.contains(beforeChoice)).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('selects and deletes generic void blocks without specialized classes', () => {
    const harness = createVoidBlockHarness();
    try {
      const editor = document.getElementById('editor') as HTMLElement;
      editor.innerHTML = '';
      appendTextParagraph(editor, 'before', 'Before');
      const variable = appendVoidBlock(editor, 'variable_1', 'variable');
      appendTextParagraph(editor, 'after', 'After');

      variable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(variable.classList.contains('is-selected')).toBe(true);
      expect(variable.getAttribute('aria-selected')).toBe('true');

      pressKey('Delete');
      expect(editor.contains(variable)).toBe(false);
      expect(saveMessages(harness.messages).at(-1)?.scene.blocks.some((block) => block.id === 'variable_1')).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
