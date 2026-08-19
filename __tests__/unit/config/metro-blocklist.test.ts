// metro-blocklist.js is CommonJS because metro.config.js consumes it directly;
// Vite's interop lets the test import it like any other module.
import metroBlockList from '../../../metro-blocklist';

const { createBlockList } = metroBlockList as { createBlockList: (root: string) => RegExp[] };

const POSIX_ROOT = '/home/runner/work/Visual-Novel-Engine/Visual-Novel-Engine';
const WINDOWS_ROOT = 'D:\\Programs\\D\\visual_novel_engine';

function blocks(root: string, filePath: string): boolean {
  return (createBlockList(root) as RegExp[]).some((pattern) => pattern.test(filePath));
}

describe('metro blockList', () => {
  it('blocks the project server directory', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/server/index.ts`)).toBe(true);
    expect(blocks(WINDOWS_ROOT, `${WINDOWS_ROOT}\\server\\index.ts`)).toBe(true);
  });

  it('blocks the mysql2 driver wherever it is installed', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/node_modules/mysql2/index.js`)).toBe(true);
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/node_modules/.pnpm/mysql2@3.0.0/node_modules/mysql2/index.js`)).toBe(true);
    expect(blocks(WINDOWS_ROOT, `${WINDOWS_ROOT}\\node_modules\\mysql2\\index.js`)).toBe(true);
  });

  // The regression that broke every CI web bundle: an unanchored /server\/.*/
  // also matches node_modules/fontfaceobserver/, which expo-font needs on web.
  // It only misfired on POSIX paths, so Windows development never noticed.
  it('does not block packages whose name merely ends in "server"', () => {
    const paths = [
      'node_modules/fontfaceobserver/fontfaceobserver.js',
      'node_modules/.pnpm/fontfaceobserver@2.3.0/node_modules/fontfaceobserver/fontfaceobserver.js',
      'node_modules/.pnpm/expo-font@14.0.11/node_modules/fontfaceobserver/fontfaceobserver.js',
    ];
    for (const relative of paths) {
      expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/${relative}`)).toBe(false);
      expect(blocks(WINDOWS_ROOT, `${WINDOWS_ROOT}\\${relative.replace(/\//g, '\\')}`)).toBe(false);
    }
  });

  it('does not block project files that merely contain the word server', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/components/server-status.tsx`)).toBe(false);
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/lib/ai/bridge-server-client.ts`)).toBe(false);
  });

  it('does not block a nested server directory inside a dependency', () => {
    expect(blocks(POSIX_ROOT, `${POSIX_ROOT}/node_modules/some-package/server/index.js`)).toBe(false);
  });
});
