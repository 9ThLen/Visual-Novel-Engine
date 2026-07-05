import { embeddedCommands } from '@/lib/vn-plate-editor/embedded-commands';
import { createEmbeddedScript } from '@/lib/vn-plate-editor/embedded-script';

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
});
