/**
 * How a novel that ships inside an APK finds its own pictures.
 *
 * On the web a bundle is a folder and the asset map holds relative paths. An
 * APK has no folder: every file it carries is a module Metro assigned a number
 * to, and the map's paths mean nothing until they are turned into uris the
 * reader can draw. That translation is the whole of this file, and it is the
 * step where a story arrives on a phone with no art.
 *
 * The device half — `expo-asset` turning a module number into a uri — is
 * injected here. What is tested is the mapping, which is what actually goes
 * wrong: a key that does not match the asset map, or a missing entry silently
 * dropping a picture.
 */
import { getPackagedMediaMap } from '@/lib/asset-resolver';
import { __resetPlayerModeForTests, loadPlayerConfig } from '@/lib/player-mode';
import {
  activatePackagedRelease,
  registerPackagedRelease,
  type PackagedRelease,
} from '@/lib/release/packaged-release';

const STORY = {
  id: 'story_42',
  title: 'Rain',
  startSceneId: 's1',
  scenes: { s1: { id: 's1' } },
};

function packaged(overrides: Partial<PackagedRelease> = {}): PackagedRelease {
  return {
    config: {
      version: 1,
      story: STORY,
      assets: { 'idb-media://cover': 'media/abc.png', 'assets/bg.png': 'media/def.mp3' },
      release: { releaseId: 'r1', version: '1.0.0' },
    },
    media: { 'media/abc.png': 11, 'media/def.mp3': 22 },
    ...overrides,
  };
}

/** Stands in for `Asset.fromModule(n).localUri`. */
const fakeResolver = async (module: number | string) => `file:///android_asset/${module}.bin`;

describe('a release packaged inside a native build', () => {
  beforeEach(() => {
    __resetPlayerModeForTests();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (getPackagedMediaMap as any).mockClear?.();
  });

  it('turns the asset map into uris the reader can draw', async () => {
    const config = await activatePackagedRelease(packaged(), fakeResolver);

    expect(config?.story).toMatchObject({ id: 'story_42' });
    expect(getPackagedMediaMap()).toEqual({
      'idb-media://cover': 'file:///android_asset/11.bin',
      'assets/bg.png': 'file:///android_asset/22.bin',
    });
  });

  /**
   * The map is keyed by the story's *reference*, not by the file name, because
   * that is what the scenes carry — an `idb-media://` uri naming a database on
   * a machine the reader has never seen.
   */
  it('keys the resolved uris by what the story asks for', async () => {
    await activatePackagedRelease(packaged(), fakeResolver);
    expect(Object.keys(getPackagedMediaMap() ?? {})).toEqual(['idb-media://cover', 'assets/bg.png']);
  });

  /** One missing picture is one missing picture, not a story that will not open. */
  it('drops a reference the generated module has no entry for', async () => {
    const config = await activatePackagedRelease(
      packaged({ media: { 'media/abc.png': 11 } }),
      fakeResolver,
    );
    expect(config).not.toBeNull();
    expect(getPackagedMediaMap()).toEqual({ 'idb-media://cover': 'file:///android_asset/11.bin' });
  });

  it('carries nothing when the build was never staged', async () => {
    expect(await activatePackagedRelease(null, fakeResolver)).toBeNull();
  });

  it('refuses a config that is not a usable release', async () => {
    expect(await activatePackagedRelease(
      packaged({ config: { version: 1, story: { id: 'x' } } }),
      fakeResolver,
    )).toBeNull();
  });
});

describe('booting from a packaged release', () => {
  beforeEach(() => __resetPlayerModeForTests());

  /**
   * A native build has no page to inline a config into and no file to fetch, so
   * `loadPlayerConfig` has to reach the bundled module — through a registration,
   * because the module that knows how needs React Native and `player-mode.ts` is
   * loaded by Node scripts that have none.
   */
  it('reaches the bundled release through the registered loader', async () => {
    registerPackagedRelease(packaged());
    const config = await loadPlayerConfig();
    expect(config?.story).toMatchObject({ id: 'story_42' });
  });

  it('registers nothing in a build that carries no release', async () => {
    registerPackagedRelease(null);
    expect(await loadPlayerConfig()).toBeNull();
  });
});
