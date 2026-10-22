/**
 * Where the spike's frame loads each picture from, per platform. Spike code
 * for stage 1 of the comic plan; how a built player hands art to a WebView is
 * one of the things the spike is there to find out.
 *
 *  - web / desktop: the bundled file's URL, made absolute — a srcdoc frame
 *    resolves relative URLs against its parent, but an absolute one cannot be
 *    misread;
 *  - Android, 'cache': expo-asset copies the bundled file into the app's cache
 *    directory once and the frame reads it as file:// — the same road the
 *    media library's own files would take;
 *  - Android, 'res': a release build keeps bundled art as drawable resources
 *    under minified names, and WebView can read those directly through
 *    file:///android_res/, with no copy.
 */
import { Asset } from 'expo-asset';
import { Image, Platform } from 'react-native';

export type SpikeAssetMode = 'cache' | 'res';

/* Static requires, so Metro bundles each file — a built player has no server to ask. */
const SPIKE_IMAGE_MODULES: Record<string, number> = {
  'bg-ancient-library': require('../../../assets/background/bg-ancient-library.png'),
  'bg-grand-hall': require('../../../assets/background/bg-grand-hall.png'),
  'bg-hall-mirrors': require('../../../assets/background/bg-hall-mirrors.png'),
  'bg-museum-entrance': require('../../../assets/background/bg-museum-entrance.png'),
  'bg-treasure-chamber': require('../../../assets/background/bg-treasure-chamber.png'),
  'bg-upper-library': require('../../../assets/background/bg-upper-library.png'),
  'char-librarian': require('../../../assets/charakters/char-librarian.png'),
  'char-guide': require('../../../assets/charakters/char-guide.png'),
  'char-reflection': require('../../../assets/charakters/char-reflection.png'),
  'char-demo-curator': require('../../../assets/charakters/char-demo-curator.png'),
};

export function spikeImageModules(): Record<string, number> {
  return SPIKE_IMAGE_MODULES;
}

function hasScheme(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri);
}

async function resolveOne(module: number, mode: SpikeAssetMode): Promise<string> {
  if (Platform.OS === 'web') {
    const uri = Asset.fromModule(module).uri;
    return typeof window !== 'undefined' ? new URL(uri, window.location.href).href : uri;
  }
  if (mode === 'res') {
    // In a release build this is the drawable's name, e.g.
    // "assets_background_bgancientlibrary"; in a dev build it is Metro's URL.
    const source = Image.resolveAssetSource(module);
    if (source?.uri && !hasScheme(source.uri)) return `file:///android_res/drawable/${source.uri}.png`;
    return source?.uri ?? '';
  }
  const asset = Asset.fromModule(module);
  if (!asset.localUri) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export async function resolveSpikeImageUrls(mode: SpikeAssetMode): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(SPIKE_IMAGE_MODULES).map(async ([key, module]) => [key, await resolveOne(module, mode)] as const),
  );
  return Object.fromEntries(entries);
}
