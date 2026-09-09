import { createVNPlateEditorHtml } from '@/lib/vn-plate-editor/embedded-html';
// @ts-expect-error The installed jsdom test runtime does not ship declarations.
import { JSDOM } from 'jsdom';

describe('production editor frame', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach((meta) => meta.remove());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('uses inline assets immediately when the production CSP blocks blobs', async () => {
    vi.resetModules();
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
    document.head.append(meta);
    const { getSharedEditorAssets } = await import('@/lib/vn-plate-editor/shared-assets');
    expect(getSharedEditorAssets()).toBeNull();
  });

  it('boots and sends ready to the host origin from an about:blank frame', () => {
    const dom = new JSDOM('<iframe></iframe>', { url: 'http://localhost:3000', runScripts: 'dangerously', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe')!;
    const target = frame.contentWindow!;
    const post = vi.spyOn(dom.window, 'postMessage').mockImplementation(() => {});
    expect(target.location.origin).toBe('null');
    const html = createVNPlateEditorHtml({
      editorId: 'production-frame',
      scene: { sceneId: 'scene-1', sceneName: 'Scene', blocks: [] },
      characters: [], isPhone: false,
    });
    target.document.open();
    target.document.write(html);
    target.document.close();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }), dom.window.location.origin);
    dom.window.close();
  });
});
