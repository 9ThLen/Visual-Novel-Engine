/**
 * What the identity environment variables are allowed to change.
 *
 * A staged Android project passes its application id, name and version code in
 * as environment variables, because that is the seam `eas.json` can carry per
 * build profile. The risk that comes with it is that the same variables, left
 * exported in a shell, would rename and repackage the *studio* — and an app
 * that installs under someone else's package id takes over their install and
 * their data. So the config reads them only under the player profile, and that
 * is checked here rather than trusted.
 */
const PLAYER_ENV = {
  VNE_PLAYER_APP_ID: 'com.vne.story.rain.s1',
  VNE_PLAYER_APP_NAME: 'Rain',
  VNE_PLAYER_VERSION: '2.1.0',
  VNE_PLAYER_VERSION_CODE: '2001000',
  VNE_PLAYER_SLUG: 'com-vne-story-rain-s1',
  VNE_PLAYER_SCHEME: 'rains1',
  VNE_PLAYER_ICON: './assets/player-icon.png',
};

interface AppConfig {
  name: string;
  slug: string;
  version: string;
  icon: string;
  scheme: string;
  android: { package: string; versionCode?: number };
  ios: { bundleIdentifier: string };
  extra: { eas: { projectId: string } };
}

async function loadConfig(env: Record<string, string | undefined>): Promise<AppConfig> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    vi.resetModules();
    const module = await import('../../app.config.js');
    return (module.default ?? module) as AppConfig;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('the app config under the player profile', () => {
  it('takes its identity from the staged environment', async () => {
    const config = await loadConfig({ VNE_PROFILE: 'player', ...PLAYER_ENV });

    expect(config.name).toBe('Rain');
    expect(config.version).toBe('2.1.0');
    expect(config.android.package).toBe('com.vne.story.rain.s1');
    expect(config.android.versionCode).toBe(2_001_000);
    expect(config.ios.bundleIdentifier).toBe('com.vne.story.rain.s1');
    expect(config.icon).toBe('./assets/player-icon.png');
    // Its own, so two novels on one phone do not register the same one.
    expect(config.scheme).toBe('rains1');
  });

  /**
   * The one that matters. A stray export must not be able to repackage the
   * editor: an app that installs under another package id takes over that
   * install, and with it the author's stored work.
   */
  it('ignores them entirely without the player profile', async () => {
    const config = await loadConfig({ VNE_PROFILE: undefined, ...PLAYER_ENV });

    expect(config.name).toBe('Visual Novel Engine');
    expect(config.slug).toBe('visual-novel-engine');
    expect(config.version).toBe('1.0.0');
    expect(config.android.package).not.toBe('com.vne.story.rain.s1');
    expect(config.android.versionCode).toBeUndefined();
    expect(config.scheme).not.toBe('rains1');
  });

  /**
   * The EAS project is the exception: an author's builds belong to the author's
   * account, which is also who Android holds the signing key against for the
   * life of the story.
   */
  it('lets the EAS project be overridden, and defaults to the engine\'s', async () => {
    const mine = await loadConfig({ VNE_EAS_PROJECT_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(mine.extra.eas.projectId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    const engine = await loadConfig({ VNE_EAS_PROJECT_ID: undefined });
    expect(engine.extra.eas.projectId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
