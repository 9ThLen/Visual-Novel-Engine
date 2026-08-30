/**
 * The identity a novel carries when it ships as its own application.
 *
 * A desktop or mobile build needs three things a release does not have: an
 * application id, a product name a filesystem will accept, and a version number
 * an installer will accept. All three are *derived*, never typed, and derived
 * from the parts of a release that do not move.
 *
 * **Why the application id comes from the story id and nothing else.** On
 * Windows the identifier decides where the app installs and, more importantly,
 * which WebView2 data directory it gets — that directory is where the reader's
 * saves live. On Android it is the package name, and the OS treats a changed
 * package as a different app. So an id derived from the title would orphan every
 * save the first time the author renamed their novel, and an id derived from the
 * author's name would do it when they married. The story id is the only thing
 * that is stable for the life of the work.
 *
 * **Why there is always a hash in it.** Two different stories whose ids slugify
 * the same must not land on the same application id: the second installer would
 * replace the first novel and inherit its saved games. The trailing segment is a
 * hash of the whole story id, so distinct ids stay distinct even when their
 * readable parts collapse to the same text.
 *
 * The hash is FNV-1a, not SHA-256, on purpose: this runs in the app as well as
 * in Node, it must be synchronous, and it is a uniqueness suffix rather than a
 * security boundary. Nothing is authenticated by it.
 *
 * R9 extends this module with the Android-only parts (version code, signing
 * fingerprint, EAS project). They are not here yet because nothing has needed
 * them, and an unused field is a field nobody has checked.
 */

/** Default reverse-DNS prefix. Every story built by this engine shares it. */
export const NATIVE_ID_PREFIX = 'com.vne.story';

/**
 * The intersection of what Tauri and Android will both accept.
 *
 * Tauri v2 rejects an identifier containing anything outside `[A-Za-z0-9-.]`;
 * Android package segments must be Java identifiers, which forbid `-`. What
 * survives both is letters, digits and dots — so that is all this ever emits,
 * even though each platform alone would allow a little more.
 */
const ID_SEGMENT = /^[a-z][a-z0-9]*$/;

/** A segment that is a Java keyword makes an Android package name invalid. */
const JAVA_RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
]);

const MAX_SLUG_LENGTH = 24;
const MAX_PRODUCT_NAME_LENGTH = 60;

/** Windows forbids these in a filename, and the installer name is one. */
const WINDOWS_FORBIDDEN = /[<>:"/\\|?*]/g;

/** A whole name equal to one of these is not a usable filename on Windows. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const FALLBACK_PRODUCT_NAME = 'Untitled Story';

/**
 * Windows Installer stores a version as three fields of fixed width, and WiX
 * refuses anything that does not fit. A release version is already
 * `MAJOR.MINOR.PATCH` with no pre-release part (`lib/release/version.ts`), so
 * range is the only thing left to check.
 */
export const DESKTOP_VERSION_LIMITS = { major: 255, minor: 255, patch: 65535 } as const;

export interface NativeIdentity {
  storyId: string;
  /** Reverse-DNS. Valid as a Tauri identifier and as an Android package name. */
  applicationId: string;
  /** What a reader sees: window title, Start menu entry, installer filename. */
  productName: string;
  /** `MAJOR.MINOR.PATCH`, taken from the release. */
  version: string;
}

/** FNV-1a, 32-bit. Deterministic across platforms; see the module note. */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // Multiply by the FNV prime (16777619) in 32-bit arithmetic. Math.imul
    // rather than `*` because the product exceeds what a double holds exactly.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The readable part of an application id: the story id, made into a segment. */
function storyIdSlug(storyId: string): string {
  const cleaned = storyId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, MAX_SLUG_LENGTH);
  if (!cleaned) return 'story';
  return JAVA_RESERVED.has(cleaned) ? `s${cleaned}` : cleaned;
}

/**
 * The application id for a story. Deterministic: the same story id always
 * produces the same id, on every machine and in every version, which is what
 * makes "mint once, then read-only" cost nothing to enforce — there is no
 * minted state to lose.
 */
export function deriveApplicationId(storyId: string, prefix: string = NATIVE_ID_PREFIX): string {
  if (typeof storyId !== 'string' || storyId.trim() === '') {
    throw new Error('Cannot derive an application id without a story id');
  }
  // `s` because a segment may not begin with a digit and base36 often does.
  const suffix = `s${fnv1a32(storyId).toString(36)}`;
  return `${prefix}.${storyIdSlug(storyId)}.${suffix}`;
}

/**
 * Whether an id is one both bundlers will accept.
 *
 * `.app` is called out separately because Tauri rejects it for its own reason:
 * a macOS bundle is a directory named `<something>.app`, and an identifier
 * ending that way collides with it.
 */
export function applicationIdProblem(applicationId: string): string | null {
  if (typeof applicationId !== 'string' || applicationId.trim() === '') {
    return 'The application id is empty.';
  }
  if (applicationId.length > 155) {
    return `The application id is ${applicationId.length} characters; the limit is 155.`;
  }
  if (applicationId.toLowerCase().endsWith('.app')) {
    return 'An application id may not end in ".app" — it collides with the macOS bundle name.';
  }
  const segments = applicationId.split('.');
  if (segments.length < 2) {
    return 'An application id needs at least two dot-separated parts, e.g. com.example.novel.';
  }
  for (const segment of segments) {
    if (!ID_SEGMENT.test(segment)) {
      return `"${segment}" is not a usable part of an application id: `
        + 'use lowercase letters and digits, starting with a letter.';
    }
    if (JAVA_RESERVED.has(segment)) {
      return `"${segment}" is a reserved word and cannot be part of an Android package name.`;
    }
  }
  return null;
}

export function isValidApplicationId(applicationId: string): boolean {
  return applicationIdProblem(applicationId) === null;
}

/**
 * A title, made safe to be a filename, a window title and a Start menu entry.
 *
 * Titles carry colons and question marks far more often than software names do,
 * and both are illegal in a Windows filename — an unsanitized one fails deep
 * inside the installer bundler with an error that names neither the title nor
 * the character.
 */
export function normalizeProductName(
  title: unknown,
  fallback: string = FALLBACK_PRODUCT_NAME,
): string {
  const cleaned = String(typeof title === 'string' ? title : '')
    .replace(WINDOWS_FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PRODUCT_NAME_LENGTH)
    // Windows silently drops a trailing dot or space from a filename, which
    // turns two names into one. Trimmed after the cut, because the cut can
    // create one.
    .replace(/[. ]+$/, '');
  if (!cleaned) return fallback;
  return WINDOWS_RESERVED.test(cleaned) ? `${cleaned} Story` : cleaned;
}

/** Why this version cannot go on a desktop installer, or `null` if it can. */
export function desktopVersionProblem(version: unknown): string | null {
  if (typeof version !== 'string') return 'The release has no version.';
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return `"${version}" is not MAJOR.MINOR.PATCH; a desktop installer needs three numbers.`;
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  const limits = DESKTOP_VERSION_LIMITS;
  if (major > limits.major || minor > limits.minor || patch > limits.patch) {
    return `Version ${version} is outside what a Windows installer records `
      + `(at most ${limits.major}.${limits.minor}.${limits.patch}).`;
  }
  return null;
}

export interface DeriveNativeIdentityInput {
  storyId: string;
  title?: unknown;
  version: string;
  prefix?: string;
}

/**
 * The whole identity, or a stated reason it cannot be formed. Throwing rather
 * than returning a partial identity: every caller here is about to write files
 * or start a build, and neither is worth doing with a name the platform will
 * reject at the end.
 */
export function deriveNativeIdentity(input: DeriveNativeIdentityInput): NativeIdentity {
  const applicationId = deriveApplicationId(input.storyId, input.prefix);
  const idProblem = applicationIdProblem(applicationId);
  if (idProblem) throw new Error(idProblem);

  const versionProblem = desktopVersionProblem(input.version);
  if (versionProblem) throw new Error(versionProblem);

  return {
    storyId: input.storyId,
    applicationId,
    productName: normalizeProductName(input.title),
    version: input.version,
  };
}
