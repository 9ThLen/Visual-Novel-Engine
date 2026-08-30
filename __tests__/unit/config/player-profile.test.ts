import { existsSync } from 'node:fs';
import path from 'node:path';

// Both files are CommonJS because metro.config.js consumes them directly.
import metroBlockList from '../../../metro-blocklist';
import playerProfile from '../../../player-profile';

const {
  isPlayerProfile,
  PLAYER_ROUTER_ROOT,
  PLAYER_STORE_SUBSTITUTION,
  PLAYER_BLOCKED_TREES,
  PLAYER_FORBIDDEN_MODULES,
  PLAYER_EXCLUDED_PLUGINS,
  PLAYER_AUTOLINKING_EXCLUDE,
  PLAYER_BLOCKED_PERMISSIONS,
  playerAutolinkingPackageJson,
} = playerProfile as {
  isPlayerProfile: (env?: Record<string, string | undefined>) => boolean;
  PLAYER_ROUTER_ROOT: string;
  PLAYER_STORE_SUBSTITUTION: { from: string; to: string };
  PLAYER_BLOCKED_TREES: string[];
  PLAYER_FORBIDDEN_MODULES: string[];
  PLAYER_EXCLUDED_PLUGINS: string[];
  PLAYER_AUTOLINKING_EXCLUDE: string[];
  PLAYER_BLOCKED_PERMISSIONS: string[];
  playerAutolinkingPackageJson: () => {
    expo: { autolinking: { android: { exclude: string[] }; ios: { exclude: string[] } } };
  };
};

const { createPlayerBlockList } = metroBlockList as {
  createPlayerBlockList: (root: string) => RegExp[];
};

const REPO_ROOT = path.resolve(__dirname, '../../..');
const POSIX_ROOT = '/home/runner/work/Visual-Novel-Engine/Visual-Novel-Engine';
const WINDOWS_ROOT = 'D:\\Programs\\D\\visual_novel_engine';

function blocks(root: string, filePath: string): boolean {
  return createPlayerBlockList(root).some((pattern) => pattern.test(filePath));
}

describe('the player build profile', () => {
  it('is selected only by VNE_PROFILE=player', () => {
    expect(isPlayerProfile({})).toBe(false);
    expect(isPlayerProfile({ VNE_PROFILE: 'studio' })).toBe(false);
    expect(isPlayerProfile({ VNE_PROFILE: 'player' })).toBe(true);
  });

  // A path that no longer exists silently stops protecting anything, and a
  // renamed directory is exactly when the boundary is easiest to lose.
  it('names paths that exist', () => {
    for (const tree of [PLAYER_ROUTER_ROOT.replace(/^\.\//, ''), ...PLAYER_BLOCKED_TREES]) {
      expect(existsSync(path.join(REPO_ROOT, tree)), tree).toBe(true);
    }
    for (const module of [
      PLAYER_STORE_SUBSTITUTION.from,
      PLAYER_STORE_SUBSTITUTION.to,
      ...PLAYER_FORBIDDEN_MODULES,
    ]) {
      expect(existsSync(path.join(REPO_ROOT, module)), module).toBe(true);
    }
  });

  it('substitutes the studio store rather than blocking it', () => {
    // Blocking would break the build: every reader screen imports it.
    expect(PLAYER_BLOCKED_TREES).not.toContain('stores');
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/stores/use-app-store.ts`)).toBe(false);
    expect(PLAYER_FORBIDDEN_MODULES).toContain(PLAYER_STORE_SUBSTITUTION.from);
    expect(PLAYER_FORBIDDEN_MODULES).not.toContain(PLAYER_STORE_SUBSTITUTION.to);
  });

  it('excludes every dropped plugin from autolinking too', () => {
    // Dropping a config plugin removes what it declares; it does not unlink the
    // native module. Both are needed, so the lists must agree.
    for (const plugin of PLAYER_EXCLUDED_PLUGINS) {
      expect(PLAYER_AUTOLINKING_EXCLUDE, plugin).toContain(plugin);
    }
  });

  /**
   * Autolinking reads `package.json`, never the Expo app config — see
   * `createAutolinkingOptionsLoader` in `expo-modules-autolinking`. The list
   * lived in `app.config.js` for a while, where `expo config` echoed it back and
   * it linked exactly nothing differently. It belongs in the staged project R9
   * produces, and this is the shape that project needs.
   */
  it('offers the autolinking block a staged project needs', () => {
    const block = playerAutolinkingPackageJson();
    expect(block.expo.autolinking.android.exclude).toEqual(PLAYER_AUTOLINKING_EXCLUDE);
    expect(block.expo.autolinking.ios.exclude).toEqual(PLAYER_AUTOLINKING_EXCLUDE);
  });

  it('does not hand the same array out twice', () => {
    // A caller writing a staged package.json must not be able to mutate the
    // profile by editing what it was given.
    const first = playerAutolinkingPackageJson().expo.autolinking.android.exclude;
    first.push('expo-camera');
    expect(playerAutolinkingPackageJson().expo.autolinking.android.exclude)
      .toEqual(PLAYER_AUTOLINKING_EXCLUDE);
  });

  it('blocks permissions as fully qualified android names', () => {
    for (const permission of PLAYER_BLOCKED_PERMISSIONS) {
      expect(permission).toMatch(/^android\.permission\.[A-Z_]+$/);
    }
  });
});

describe('the player metro blockList', () => {
  it('blocks the authoring trees on both path separators', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/components/editor/PlayMode.tsx`)).toBe(true);
    expect(blocks(WINDOWS_ROOT, `${WINDOWS_ROOT}\\components\\editor\\PlayMode.tsx`)).toBe(true);
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/lib/vn-plate-editor/anything.ts`)).toBe(true);
  });

  it('leaves the reader alone', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/components/reader/ReaderDisplay.tsx`)).toBe(false);
    expect(blocks(WINDOWS_ROOT, `${WINDOWS_ROOT}\\components\\reader\\ReaderDisplay.tsx`)).toBe(false);
  });

  /**
   * `lib/document-editor/scene-graph-*` is graph traversal the reader's coverage
   * code walks, and `lib/ai/permissions.ts` is read by `lib/user-settings.ts`.
   * Blocking their directories would break the player build outright — which is
   * why those two trees are absent here and the reachability checker names
   * individual files instead.
   */
  it('does not block shared code that merely sits in an authoring directory', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/lib/document-editor/scene-graph-traversal.ts`)).toBe(false);
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/lib/ai/permissions.ts`)).toBe(false);
  });

  it('does not block a dependency whose path happens to contain a blocked name', () => {
    expect(
      blocks(POSIX_ROOT, `${POSIX_ROOT}/node_modules/some-package/components/editor/index.js`),
    ).toBe(false);
  });
});
