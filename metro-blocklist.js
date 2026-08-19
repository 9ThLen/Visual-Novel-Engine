/**
 * Paths Metro must not serve: the standalone `server/` app (Node-only code that
 * never belongs in a client bundle) and the `mysql2` driver it pulls in.
 *
 * The patterns are anchored on purpose. An unanchored `server\/.*` matches any
 * path *containing* "server/", and `node_modules/fontfaceobserver/` contains it —
 * so expo-font's web font loader lost its dependency and the whole web bundle
 * failed to build. It only showed up on Linux: Metro matches Windows paths with
 * backslashes, which a forward-slash pattern never hits, so the bug was invisible
 * during local development and broke every CI run.
 */

/** Escape a path for literal use inside a RegExp, accepting either separator. */
function pathToPattern(value) {
  return value
    .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    .replace(/\\\\|\\\//g, '[\\\\/]');
}

/**
 * Built from the given root as a plain string rather than via `path.resolve`, so
 * the patterns describe the paths Metro actually reports on whichever platform
 * produced them — and so the unit test can check both separator styles.
 *
 * @param {string} projectRoot absolute path of the Expo project
 * @returns {RegExp[]} blockList patterns for `config.resolver.blockList`
 */
function createBlockList(projectRoot) {
  const sep = '[\\\\/]';
  const root = pathToPattern(String(projectRoot).replace(/[\\/]+$/, ''));
  return [
    // Only this project's own server directory, not every nested "server" folder.
    new RegExp(`^${root}${sep}server${sep}.*`),
    // The driver itself, wherever it is installed.
    new RegExp(`${sep}node_modules${sep}mysql2${sep}.*`),
  ];
}

module.exports = { createBlockList, pathToPattern };
