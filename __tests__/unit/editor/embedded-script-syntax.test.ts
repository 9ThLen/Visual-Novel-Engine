import { embeddedCommands, getEmbeddedCommands } from '@/lib/vn-plate-editor/embedded-commands';
import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
import { createEmbeddedScript } from '@/lib/vn-plate-editor/embedded-script';

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

  window.eval(createEmbeddedScript({
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
  }, embeddedCommands));

  return {
    cleanup() {
      (window as unknown as { FileReader: typeof FileReader }).FileReader = originalFileReader;
      (window as unknown as { Image: typeof Image }).Image = originalImage;
      Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: originalGetContext,
      });
      document.body.innerHTML = '';
    },
  };
}

function openCharacterPopover() {
  const paragraph = document.createElement('p');
  const token = document.createElement('span');
  token.dataset.characterId = 'char_librarian';
  token.dataset.blockId = 'block_1';
  paragraph.appendChild(token);
  document.body.appendChild(paragraph);
  (window as unknown as { renderCharacterPopover: (node: HTMLElement) => void }).renderCharacterPopover(token);
  return document.querySelector('.character-sprite-file') as HTMLInputElement;
}

// The embedded editor script is assembled as a template string, so tsc never
// parses its contents. Compiling it with the Function constructor (without
// executing) catches syntax errors introduced by edits to the template.
describe('createEmbeddedScript', () => {
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
    expect(html).toContain('accept="image/png,image/webp"');
    expect(html).toContain('function isAllowedCharacterSpriteFile');
    expect(html).toContain('function isFullyOpaqueImage');
    expect(html).toContain('getImageData');
    expect(html).toContain('reader.onerror');
    expect(html).toContain('img.onerror');
    expect(html).toContain("spriteUploadInput.value = ''");
  });

  it('rejects a fully opaque character sprite upload before mutating the character library', () => {
    const harness = createSpriteUploadHarness([255, 255]);
    try {
      const input = openCharacterPopover();
      const file = new File(['opaque'], 'opaque.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });

      input.dispatchEvent(new Event('change', { bubbles: true }));

      const error = document.querySelector('.asset-error') as HTMLElement;
      const characters = (window as unknown as { characters: { sprites: unknown[] }[] }).characters;
      expect(error.style.display).toBe('block');
      expect(error.textContent).toContain('transparent background');
      expect(characters[0].sprites).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('accepts a character sprite upload when at least one pixel has transparency', () => {
    const harness = createSpriteUploadHarness([255, 0]);
    try {
      const input = openCharacterPopover();
      const file = new File(['transparent'], 'transparent.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });

      input.dispatchEvent(new Event('change', { bubbles: true }));

      const characters = (window as unknown as { characters: { sprites: { uri: string }[] }[] }).characters;
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
});
