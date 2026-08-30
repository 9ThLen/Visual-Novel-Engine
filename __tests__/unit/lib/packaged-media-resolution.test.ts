/**
 * How a published bundle finds its own media.
 *
 * The reader asks the resolver for whatever string the scene stored. In a
 * bundle that string is usually an `idb-media://` uri naming a database on the
 * author's machine, and the file it means sits in `media/` next to
 * `index.html`. These cases pin the one hop between the two.
 */
import {
  getPackagedMediaMap,
  resetAssetResolverForTests,
  resolveAssetUri,
  setPackagedMediaMap,
} from '@/lib/asset-resolver';

const PACKAGED = 'media/aaaa.png';

function withEntryScript(src: string): () => void {
  const script = document.createElement('script');
  script.src = src;
  document.head.appendChild(script);
  return () => script.remove();
}

describe('packaged media resolution', () => {
  beforeEach(() => resetAssetResolverForTests());
  afterEach(() => resetAssetResolverForTests());

  it('is off until a bundle turns it on', () => {
    expect(getPackagedMediaMap()).toBeNull();
  });

  it('answers an idb-media uri with the file the bundle carries', async () => {
    setPackagedMediaMap({ 'idb-media://cover': PACKAGED });
    await expect(resolveAssetUri('idb-media://cover')).resolves.toContain(PACKAGED);
  });

  /**
   * The map is consulted before anything else on purpose. An `idb-media://` uri
   * would otherwise be looked up in a database this browser has never written,
   * and the reader would play a story with no pictures.
   */
  it('wins over the IndexedDB lookup that would otherwise find nothing', async () => {
    setPackagedMediaMap({ 'idb-media://cover': PACKAGED });
    const resolved = await resolveAssetUri('idb-media://cover');
    expect(resolved).not.toBeNull();
    expect(String(resolved)).not.toContain('blob:');
  });

  // Serving from a sub-path is the normal case for a project page; the media
  // has to follow the bundle rather than the site root.
  it('resolves against the path the bundle is served from', async () => {
    const cleanup = withEntryScript('http://example.test/novel/_expo/static/js/web/entry-abc.js');
    try {
      setPackagedMediaMap({ 'idb-media://cover': PACKAGED });
      await expect(resolveAssetUri('idb-media://cover'))
        .resolves.toBe(`http://example.test/novel/${PACKAGED}`);
    } finally {
      cleanup();
    }
  });

  it('leaves references the bundle does not carry to the normal path', async () => {
    setPackagedMediaMap({ 'idb-media://cover': PACKAGED });
    await expect(resolveAssetUri('https://example.test/remote.png'))
      .resolves.toBe('https://example.test/remote.png');
  });

  /**
   * Clearing must also drop the caches. A uri resolved while a map was active
   * would otherwise keep answering with a file that is no longer there — which
   * is exactly what a test, or a studio tab that had previewed a release, would
   * hit next.
   */
  it('forgets packaged answers when the map is cleared', async () => {
    setPackagedMediaMap({ 'idb-media://cover': PACKAGED });
    await resolveAssetUri('idb-media://cover');

    setPackagedMediaMap(null);
    expect(getPackagedMediaMap()).toBeNull();
    const resolved = await resolveAssetUri('idb-media://cover');
    expect(String(resolved ?? '')).not.toContain(PACKAGED);
  });

  it('treats an empty map as no map at all', () => {
    setPackagedMediaMap({});
    expect(getPackagedMediaMap()).toBeNull();
  });
});
