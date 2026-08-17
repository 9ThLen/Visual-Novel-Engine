import { embeddedCommands, getEmbeddedCommands } from '@/lib/vn-plate-editor/embedded-commands';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { createEmbeddedScript } from '@/lib/vn-plate-editor/embedded-script';
import { createEmbeddedStyles } from '@/lib/vn-plate-editor/embedded-styles';

interface EmbeddedHarnessApi {
  insertCommand: (id: string) => void;
  commandMatches: (command: ReturnType<typeof getEmbeddedCommands>[number], query: string) => boolean;
  renderCharacterPopover: (node: HTMLElement) => void;
  getCharacters: () => unknown[];
  undoHistory: () => void;
  redoHistory: () => void;
  saveNow: () => void;
  openBackgroundPopover: (block: HTMLElement, anchor?: HTMLElement) => void;
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
        saveNow: saveNow,
        openBackgroundPopover: openBackgroundPopover
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

  const messages: { type: string; requestId?: string; dataUri?: string; name?: string }[] = [];
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

function createVoidBlockHarness(
  backgroundAssets: NonNullable<Parameters<typeof createEmbeddedScript>[0]['backgroundAssets']> = [],
) {
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
    backgroundAssets,
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

/**
 * Every evaluated harness script keeps its own document-level listeners, and
 * the harness cannot remove them. A click therefore reaches earlier instances
 * too, so the newest request — the one owned by the script under test — is the
 * last one posted.
 */
function lastPickVideoMessage(messages: unknown[]) {
  return messages.filter((message): message is { type: string; requestId: string } => {
    return Boolean(message && typeof message === 'object' && (message as { type?: string }).type === 'pickVideoAsset');
  }).at(-1);
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
const sceneWithEffect = {
  sceneId: 'scene_1',
  sceneName: 'Scene 1',
  blocks: [{ id: 'text_1', kind: 'text' as const, content: 'Hello' }],
};

describe('createEmbeddedScript', () => {
  it('creates, edits, validates, and serializes an interactive object without browser prompts', () => {
    const harness = createVoidBlockHarness([{
      id: 'scene_background',
      name: 'Scene background.png',
      uri: 'blob:scene-background',
      assetUri: 'assets/background/scene-background.png',
    }]);
    const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
    const editor = document.getElementById('editor') as HTMLElement;
    editor.innerHTML = '';
    const background = appendVoidBlock(editor, 'background_1', 'background', 'background-block');
    background.dataset.assetId = 'scene_background';
    placeCaretInNewParagraph();

    api.insertCommand('interactive_object');

    const block = document.querySelector('.interactive-object-block') as HTMLElement;
    const popover = document.querySelector('.interactive-object-popover') as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.textContent).toContain('Немає дій');
    expect(popover).not.toBeNull();
    expect(document.querySelectorAll('.editor-popover-backdrop')).toHaveLength(1);
    expect(popover.querySelector('.interactive-popover-header [data-object-action="cancel"]')).toBeNull();
    expect(popover.querySelector<HTMLElement>('.interactive-stage')?.style.backgroundImage)
      .toContain('blob:scene-background');

    (popover.querySelector('[data-object-action="add"]') as HTMLButtonElement).click();
    (popover.querySelector('#ioName') as HTMLInputElement).value = 'Двері';
    const dialogueEditor = popover.querySelector('[data-action-field="dialogue"]') as HTMLElement;
    expect(dialogueEditor).not.toBeNull();
    expect(popover.querySelector('[data-action-field="speaker"]')).toBeNull();
    dialogueEditor.textContent = 'Маша: Зачинено.';
    dialogueEditor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dialogueEditor.querySelector('.speaker-token')?.textContent).toBe('Маша:');
    expect(document.querySelector('.character-popover.is-nested')).not.toBeNull();
    expect(document.querySelectorAll('.editor-popover-backdrop')).toHaveLength(1);
    expect(api.getCharacters()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Маша' }),
    ]));
    const hotspot = popover.querySelector('.interactive-stage-hotspot') as HTMLElement;
    hotspot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect((popover.querySelector('[data-position="x"]') as HTMLInputElement).value).toBe('45');
    (popover.querySelector('[data-position="x"]') as HTMLInputElement).value = '95';
    (popover.querySelector('[data-object-action="save"]') as HTMLButtonElement).click();
    expect(document.querySelector('.interactive-object-popover')).not.toBeNull();
    expect(popover.querySelector('.interactive-object-error')?.textContent).toContain('межах сцени');
    (popover.querySelector('[data-position="x"]') as HTMLInputElement).value = '44';
    (popover.querySelector('[data-object-action="save"]') as HTMLButtonElement).click();

    expect(document.querySelector('.interactive-object-popover')).toBeNull();
    expect(document.querySelector('.editor-popover-backdrop')).toBeNull();
    expect(block.textContent).toContain('Двері');
    expect(block.textContent).toContain('1 дія');
    const lastSave = saveMessages(harness.messages).at(-1);
    const saved = lastSave?.scene.blocks.find((item) => item.id === block.dataset.id) as unknown as {
      blockType: string;
      step: { blockType: string; data: { name: string; actions: { type: string; text: string; speaker?: string; characterId?: string }[] } };
    };
    expect(saved.blockType).toBe('interactive_object');
    expect(saved.step.blockType).toBe('interactive_object');
    expect(saved.step.data).toMatchObject({
      name: 'Двері',
      actions: [{
        type: 'dialogue',
        text: 'Зачинено.',
        speaker: 'Маша',
        characterId: expect.any(String),
      }],
    });
    harness.cleanup();
  });

  it('removes a newly inserted interactive object when clicking outside its editor', () => {
    const harness = createVoidBlockHarness();
    const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
    placeCaretInNewParagraph();

    api.insertCommand('interactive_object');
    expect(document.querySelector('.interactive-object-block')).not.toBeNull();
    (document.querySelector('.editor-popover-backdrop') as HTMLElement).click();

    expect(document.querySelector('.interactive-object-block')).toBeNull();
    expect(document.querySelector('.interactive-object-popover')).toBeNull();
    harness.cleanup();
  });

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

  it('offers localized appearance and disappearance controls in the character block popover', () => {
    const script = createEmbeddedScript({
      editorId: 'editor_character_entrance',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [],
    }, embeddedCommands);

    expect(script).toContain('data-field="character-action"');
    expect(script).toContain('data-field="character-transition"');
    expect(script).toContain("appearance: 'Appearance'");
    expect(script).toContain("disappearance: 'Disappearance'");
    expect(script).toContain("appearance: 'Поява'");
    expect(script).toContain("disappearance: 'Зникнення'");
    expect(script).toContain("paragraph.dataset.characterAction = characterAction");
    expect(script).toContain("paragraph.dataset.characterTransition = characterTransition");
  });

  it('renders localized character controls and persists a hide action in the document', () => {
    const scene = {
      sceneId: 'scene_1',
      sceneName: 'Scene 1',
      blocks: [{
        id: 'character_exit',
        kind: 'dialogue' as const,
        speakerName: 'Ada',
        characterId: 'char_ada',
        spriteId: 'sprite_idle',
        characterAction: 'hide' as const,
        characterTransition: 'slide-right' as const,
        text: '',
      }],
    };
    const base = {
      editorId: 'editor_character_exit',
      scene,
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [],
    };

    const ukHtml = createVNPlateEditorHtml({ ...base, language: 'uk' });
    const enHtml = createVNPlateEditorHtml({ ...base, language: 'en' });

    expect(ukHtml).toContain('data-character-action="hide"');
    expect(ukHtml).toContain('data-character-transition="slide-right"');
    expect(ukHtml).toContain('aria-label="Редагувати персонажа Ada"');
    expect(enHtml).toContain('aria-label="Edit character Ada"');
  });

  it('injects semantic plate colors without replacing character colors', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_theme_contract',
      scene: {
        sceneId: 'scene_1',
        sceneName: 'Scene 1',
        blocks: [{
          id: 'dialogue_1',
          kind: 'dialogue',
          speakerName: 'Ada',
          characterId: 'character_1',
          spriteId: null,
          tokenColor: '#C026D3',
          text: 'Hello',
        }],
      },
      characters: [],
      isPhone: false,
      backgroundAssets: [],
      audioAssets: [],
      scenes: [],
      theme: {
        background: '#F7F2EA',
        surface: '#FEFAF6',
        surfaceMuted: '#F1EEE6',
        foreground: '#3A281F',
        foregroundSecondary: '#655D56',
        border: '#A59B90',
        borderSubtle: '#E5DDD3',
        borderStrong: '#8D8277',
        primary: '#67683F',
        primarySoft: 'rgba(103, 104, 63, 0.12)',
        secondary: '#985A3E',
        secondarySoft: 'rgba(152, 90, 62, 0.12)',
        audio: '#806027',
        audioSoft: 'rgba(128, 96, 39, 0.12)',
      },
    });

    expect(html).toContain('--plate-primary: #67683F');
    expect(html).toContain('--plate-secondary: #985A3E');
    expect(html).toContain('--plate-audio: #806027');
    expect(html).toContain('--speaker-color:#C026D3');
  });

  it('styles popover menus with semantic palette tokens', () => {
    const styles = createEmbeddedStyles();

    expect(styles).toContain('.editor-popover-backdrop');
    expect(styles).toContain('backdrop-filter: blur(2px)');
    expect(styles).toContain('background: var(--plate-surface, #FEFAF6)');
    expect(styles).toContain('background: var(--plate-secondary, #985A3E)');
    expect(styles).toContain('border-color: var(--plate-primary, #67683F)');
    expect(styles).not.toContain('background: #ef4444');
    expect(styles).not.toContain('border-color: #60a5fa');
    expect(styles).not.toContain('border-color: #7c3aed');
  });

  it('uses the sage palette for editor text selection', () => {
    const styles = createEmbeddedStyles();

    expect(styles).toContain('::selection');
    expect(styles).toContain('var(--plate-primary, #67683F) 38%');
    expect(styles).toContain('color: var(--plate-foreground, #3A281F)');
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
    expect(html).toContain('function requestCharacterSpriteUpload');
    expect(html).toContain("type: 'uploadCharacterSpriteAsset'");
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

      const upload = harness.messages.find((message) => message.type === 'uploadCharacterSpriteAsset');
      expect(upload?.dataUri).toBe('data:image/png;base64,BBB=');
      harness.postHostMessage({
        type: 'characterSpriteAssetUploaded',
        requestId: upload!.requestId,
        asset: { id: 'asset_1', name: 'opaque.png', uri: 'blob:resolved', assetUri: 'idb://media/asset_1' },
      });

      const characters = harness.api.getCharacters() as { sprites: { uri: string; assetUri?: string }[] }[];
      expect(characters[0].sprites).toHaveLength(1);
      expect(characters[0].sprites[0]).toMatchObject({
        uri: 'blob:resolved',
        assetUri: 'idb://media/asset_1',
      });
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

      const upload = harness.messages.find((message) => message.type === 'uploadCharacterSpriteAsset');
      expect(upload?.dataUri).toBe('data:image/png;base64,AAA=');
      expect((harness.api.getCharacters() as { sprites: unknown[] }[])[0].sprites).toHaveLength(0);
      harness.postHostMessage({
        type: 'characterSpriteAssetUploaded',
        requestId: upload!.requestId,
        asset: { id: 'asset_1', name: 'transparent.png', uri: 'blob:resolved', assetUri: 'idb://media/asset_1' },
      });

      const characters = harness.api.getCharacters() as { sprites: { uri: string; assetUri?: string }[] }[];
      expect(characters[0].sprites).toHaveLength(1);
      expect(characters[0].sprites[0]).toMatchObject({
        uri: 'blob:resolved',
        assetUri: 'idb://media/asset_1',
      });
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
    expect(script).toContain("applyInteractiveObjectData(block, defaultInteractiveObjectData())");
    expect(script).toContain('openInteractiveObjectPopover(block)');
    expect(script).toContain("if (commandId === 'interactive_object')");
    expect(script).toContain('Інтерактивний об’єкт');
    expect(script).toContain('Немає дій');
    expect(script).not.toContain("window.prompt('Object name'");

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

  it('inserts a /video block that serializes back into a real video step', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('video');

      const videoBlock = anchorParagraph.nextElementSibling as HTMLElement;
      expect(videoBlock.classList.contains('video-block')).toBe(true);
      expect(videoBlock.dataset.command).toBe('video');
      expect(videoBlock.textContent).not.toContain('New block');

      api.saveNow();
      const lastSave = saveMessages(harness.messages).at(-1);
      const saved = lastSave?.scene.blocks.find((item) => item.id === videoBlock.dataset.id) as unknown as {
        blockType: string;
        step: { blockType: string; data: Record<string, unknown> } | null;
      };

      // Without a serializer branch the frame used to hand back step: null, so
      // the block was rebuilt from defaults on every normalization pass.
      expect(saved.blockType).toBe('video');
      expect(saved.step).not.toBeNull();
      expect(saved.step?.blockType).toBe('video');
      expect(saved.step?.data).toMatchObject({
        mode: 'play',
        layer: 'background',
        assetId: null,
        fit: 'cover',
        muted: true,
        loop: true,
      });
    } finally {
      harness.cleanup();
    }
  });

  it('asks the host to pick a video without sending any bytes', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      placeCaretInNewParagraph();
      api.insertCommand('video');

      // Inserting the block opens its popover so the author can choose a clip.
      const popover = document.querySelector('.video-popover') as HTMLElement;
      expect(popover).not.toBeNull();

      (popover.querySelector('[data-action="import-video"]') as HTMLButtonElement).click();

      const pickMessage = lastPickVideoMessage(harness.messages);
      expect(pickMessage).toBeDefined();
      // The whole point of the host-side picker: an intent, never bytes.
      expect(Object.keys(pickMessage as object).sort()).toEqual(['editorId', 'requestId', 'source', 'type']);
    } finally {
      harness.cleanup();
    }
  });

  it('writes the picked asset id into the block when the host replies', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('video');
      const videoBlock = anchorParagraph.nextElementSibling as HTMLElement;

      const popover = document.querySelector('.video-popover') as HTMLElement;
      (popover.querySelector('[data-action="import-video"]') as HTMLButtonElement).click();
      const pickMessage = lastPickVideoMessage(harness.messages);

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'vn-plate-host',
          editorId: 'editor_void_blocks',
          type: 'videoAssetPicked',
          requestId: pickMessage?.requestId,
          asset: { id: 'asset_clip', name: 'Intro.mp4' },
        },
      }));

      expect(JSON.parse(videoBlock.dataset.video || '{}').assetId).toBe('asset_clip');
      expect(videoBlock.textContent).toContain('Intro.mp4');
    } finally {
      harness.cleanup();
    }
  });

  it('surfaces a rejected import instead of silently doing nothing', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      placeCaretInNewParagraph();
      api.insertCommand('video');

      const popover = document.querySelector('.video-popover') as HTMLElement;
      (popover.querySelector('[data-action="import-video"]') as HTMLButtonElement).click();
      const pickMessage = lastPickVideoMessage(harness.messages);

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'vn-plate-host',
          editorId: 'editor_void_blocks',
          type: 'videoAssetPicked',
          requestId: pickMessage?.requestId,
          asset: null,
          error: 'tooLarge',
        },
      }));

      expect(popover.querySelector('.video-popover-error')?.textContent).toContain('64');
    } finally {
      harness.cleanup();
    }
  });

  it('offers effect presets that write canonical fields', () => {
    const html = createVNPlateEditorHtml({
      editorId: 'editor_presets',
      scene: sceneWithEffect,
      characters: [],
      backgroundAssets: [],
      isPhone: false,
    });

    // The definitions are inlined from lib/engine/animation-presets, so the
    // frame and the rest of the app cannot drift apart.
    expect(html).toContain('var EFFECT_PRESETS =');
    expect(html).toContain('var CHARACTER_PRESETS =');
    expect(html).toContain('data-effect-preset=');
    expect(html).toContain('Гроза');
    expect(html).toContain("EFFECT_PRESETS.forEach(function(item) { if (item.id === presetId) presetEntry = item; });");
  });

  it('lets the author turn a video block into a stop step', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('video');
      const videoBlock = anchorParagraph.nextElementSibling as HTMLElement;

      const popover = document.querySelector('.video-popover') as HTMLElement;
      const modeSelect = popover.querySelector('#videoMode') as HTMLSelectElement;
      expect(modeSelect).not.toBeNull();

      modeSelect.value = 'stop';
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      // Playback options mean nothing for a stop step and step aside.
      expect((popover.querySelector('#videoAsset') as HTMLElement).hidden).toBe(true);

      (popover.querySelector('[data-action="save-video"]') as HTMLButtonElement).click();

      const data = JSON.parse(videoBlock.dataset.video || '{}');
      expect(data.mode).toBe('stop');
      expect(data.layer).toBe('background');
      expect(videoBlock.textContent).toContain('Зупинити');

      api.saveNow();
      const lastSave = saveMessages(harness.messages).at(-1);
      const saved = lastSave?.scene.blocks.find((item) => item.id === videoBlock.dataset.id) as unknown as {
        step: { data: { mode: string } } | null;
      };
      expect(saved.step?.data.mode).toBe('stop');
    } finally {
      harness.cleanup();
    }
  });

  it('lets the author make a skippable cutscene', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('video');
      const videoBlock = anchorParagraph.nextElementSibling as HTMLElement;

      const popover = document.querySelector('.video-popover') as HTMLElement;
      const layerSelect = popover.querySelector('#videoLayer') as HTMLSelectElement;
      layerSelect.value = 'cutscene';
      layerSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // The skip delay only makes sense for a cutscene, so it appears with it.
      const skipInput = popover.querySelector('#videoSkipAfter') as HTMLInputElement;
      expect(skipInput.hidden).toBe(false);
      skipInput.value = '2.5';

      (popover.querySelector('[data-action="save-video"]') as HTMLButtonElement).click();

      const data = JSON.parse(videoBlock.dataset.video || '{}');
      expect(data).toMatchObject({
        mode: 'play',
        layer: 'cutscene',
        skippableAfterMs: 2500,
        // A cutscene carries its own sound and never loops.
        muted: false,
        loop: false,
      });
    } finally {
      harness.cleanup();
    }
  });

  it('hides the skip delay for a background clip', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      placeCaretInNewParagraph();
      api.insertCommand('video');

      const popover = document.querySelector('.video-popover') as HTMLElement;
      expect((popover.querySelector('#videoSkipAfter') as HTMLElement).hidden).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('keeps an authored video payload when the block round-trips through the frame', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('video');

      const videoBlock = anchorParagraph.nextElementSibling as HTMLElement;
      videoBlock.dataset.video = JSON.stringify({
        mode: 'play',
        layer: 'background',
        assetId: 'video_intro',
        posterAssetId: 'poster_intro',
        fit: 'contain',
        playbackRate: 1.5,
        startAt: 2,
        endAt: 8,
        muted: true,
        volume: 0,
        loop: true,
        skippableAfterMs: null,
      });

      api.saveNow();
      const lastSave = saveMessages(harness.messages).at(-1);
      const saved = lastSave?.scene.blocks.find((item) => item.id === videoBlock.dataset.id) as unknown as {
        step: { data: Record<string, unknown> } | null;
      };

      expect(saved.step?.data).toMatchObject({
        assetId: 'video_intro',
        posterAssetId: 'poster_intro',
        fit: 'contain',
        playbackRate: 1.5,
        startAt: 2,
        endAt: 8,
      });
    } finally {
      harness.cleanup();
    }
  });

  it('inserts a /camera block that serializes back into a real camera step', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('camera');

      const cameraBlock = anchorParagraph.nextElementSibling as HTMLElement;
      expect(cameraBlock.classList.contains('camera-block')).toBe(true);
      expect(cameraBlock.dataset.command).toBe('camera');
      // /camera used to fall through to the placeholder branch: a dead block
      // that serialized with step: null.
      expect(cameraBlock.textContent).not.toContain('New block');

      api.saveNow();
      const lastSave = saveMessages(harness.messages).at(-1);
      const saved = lastSave?.scene.blocks.find((item) => item.id === cameraBlock.dataset.id) as unknown as {
        blockType: string;
        step: { blockType: string; data: Record<string, unknown> } | null;
      };

      expect(saved.blockType).toBe('camera');
      expect(saved.step).not.toBeNull();
      expect(saved.step?.blockType).toBe('camera');
      expect(saved.step?.data).toMatchObject({ action: 'zoom', zoomLevel: 1.5, duration: 1, easing: 'ease-in-out' });
    } finally {
      harness.cleanup();
    }
  });

  it('writes only the fields that belong to the chosen camera action', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('camera');
      const cameraBlock = anchorParagraph.nextElementSibling as HTMLElement;

      const popover = document.querySelector('.camera-popover') as HTMLElement;
      const actionSelect = popover.querySelector('#camAction') as HTMLSelectElement;
      actionSelect.value = 'pan';
      actionSelect.dispatchEvent(new Event('change', { bubbles: true }));

      expect((popover.querySelector('#camPanX') as HTMLElement).hidden).toBe(false);
      expect((popover.querySelector('#camZoom') as HTMLElement).hidden).toBe(true);

      (popover.querySelector('#camPanX') as HTMLInputElement).value = '18';
      (popover.querySelector('#camDuration') as HTMLInputElement).value = '2.5';
      (popover.querySelector('[data-action="save-camera"]') as HTMLButtonElement).click();

      const data = JSON.parse(cameraBlock.dataset.camera || '{}');
      expect(data).toMatchObject({ action: 'pan', panX: 18, panY: 0, duration: 2.5 });
      // An absent zoom means "hold the zoom we already have"; carrying the old
      // 1.5 over would silently zoom on a pan step.
      expect(data.zoomLevel).toBeUndefined();
    } finally {
      harness.cleanup();
    }
  });

  it('names the focused character in the camera summary and follows a rename', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'vn-plate-host',
          editorId: 'editor_void_blocks',
          type: 'charactersUpdated',
          characters: [{ id: 'char_1', name: 'Мія', sprites: [] }],
        },
      }));

      api.insertCommand('camera');
      const cameraBlock = anchorParagraph.nextElementSibling as HTMLElement;
      const popover = document.querySelector('.camera-popover') as HTMLElement;
      const actionSelect = popover.querySelector('#camAction') as HTMLSelectElement;
      actionSelect.value = 'focus';
      actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect((popover.querySelector('#camTarget') as HTMLElement).hidden).toBe(false);

      (popover.querySelector('#camTarget') as HTMLSelectElement).value = 'char_1';
      (popover.querySelector('[data-action="save-camera"]') as HTMLButtonElement).click();

      expect(JSON.parse(cameraBlock.dataset.camera || '{}').target).toBe('char_1');
      expect(cameraBlock.textContent).toContain('Мія');

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'vn-plate-host',
          editorId: 'editor_void_blocks',
          type: 'charactersUpdated',
          characters: [{ id: 'char_1', name: 'Мія Соколова', sprites: [] }],
        },
      }));
      expect(cameraBlock.textContent).toContain('Мія Соколова');
    } finally {
      harness.cleanup();
    }
  });

  it('applies a camera preset into the canonical fields', () => {
    const harness = createVoidBlockHarness();
    try {
      const api = (window as unknown as { __embeddedHarnessApi: EmbeddedHarnessApi }).__embeddedHarnessApi;
      const anchorParagraph = placeCaretInNewParagraph();
      api.insertCommand('camera');
      const cameraBlock = anchorParagraph.nextElementSibling as HTMLElement;

      const popover = document.querySelector('.camera-popover') as HTMLElement;
      (popover.querySelector('[data-camera-preset="slowPan"]') as HTMLButtonElement).click();

      // A preset is authoring sugar: what lands on the block is plain canonical
      // data, with no trace of the preset it came from.
      const data = JSON.parse(cameraBlock.dataset.camera || '{}');
      expect(data).toMatchObject({ action: 'pan', panX: 12, panY: 0, duration: 3, easing: 'ease-in-out' });
      expect(data.id).toBeUndefined();
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

  it('matches a persisted background URI to its resolved preview without exposing an editable asset field', () => {
    document.body.innerHTML = `
      <main class="paper">
        <input id="title" value="Scene 1" />
        <div id="editor" contenteditable="true"></div>
      </main>
      <div id="slashMenu" class="slash-menu hidden"></div>
    `;
    const api = evalEmbeddedScriptForHarness({
      editorId: 'background_preview_test',
      scene: { sceneId: 'scene_1', sceneName: 'Scene 1', blocks: [] },
      characters: [],
      isPhone: false,
      backgroundAssets: [{
        id: 'asset_1',
        name: 'Ancient Library.png',
        uri: 'blob:resolved-background',
        assetUri: 'assets/background/bg-ancient-library.png',
      }],
      audioAssets: [],
      scenes: [],
    }, embeddedCommands);
    const block = appendVoidBlock(document.getElementById('editor')!, 'background_1', 'background', 'background-block');
    block.dataset.assetId = 'assets/background/bg-ancient-library.png';
    block.dataset.transition = 'fade';
    block.dataset.durationMs = '500';

    api.openBackgroundPopover(block, block);

    expect(document.querySelector<HTMLInputElement>('#bgAssetInput')).toBeNull();
    expect(document.querySelector('#bgAssetValue')?.textContent).toBe('Ancient Library');
    expect(document.querySelector<HTMLElement>('.background-preview')?.style.backgroundImage)
      .toContain('blob:resolved-background');
    expect(document.querySelector('.editor-popover-backdrop')).not.toBeNull();

    (document.querySelector('.editor-popover-backdrop') as HTMLElement).click();

    expect(document.querySelector('.background-popover')).toBeNull();
    expect(document.querySelector('.editor-popover-backdrop')).toBeNull();

    delete (window as unknown as { __embeddedHarnessApi?: EmbeddedHarnessApi }).__embeddedHarnessApi;
    document.body.innerHTML = '';
  });
});
