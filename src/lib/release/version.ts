/**
 * Release versioning.
 *
 * Deliberately narrower than semver: `MAJOR.MINOR.PATCH`, no pre-release tags,
 * no build metadata, no leading zeroes. Authors are writers, and the only
 * question this has to answer unambiguously is "is this newer than what is
 * already published". Pre-release ordering rules would add a way to get that
 * wrong in exchange for nothing a novel needs.
 */
import { generateId } from '@/lib/id-utils';

export const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** First release when the author has published nothing yet. */
export const FIRST_RELEASE_VERSION = '1.0.0';

export const RELEASE_VERSION_BUMPS = ['major', 'minor', 'patch'] as const;
export type ReleaseVersionBump = (typeof RELEASE_VERSION_BUMPS)[number];

export interface ReleaseVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Returns `null` for anything that is not a usable version, never throws. */
export function parseReleaseVersion(value: unknown): ReleaseVersion | null {
  if (typeof value !== 'string') return null;
  const match = RELEASE_VERSION_PATTERN.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isReleaseVersion(value: unknown): value is string {
  return parseReleaseVersion(value) !== null;
}

export function formatReleaseVersion(version: ReleaseVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Negative when `a` precedes `b`, positive when it follows, zero when equal. */
export function compareReleaseVersions(a: string, b: string): number {
  const left = parseReleaseVersion(a);
  const right = parseReleaseVersion(b);
  if (!left) throw new Error(`Invalid release version: ${String(a)}`);
  if (!right) throw new Error(`Invalid release version: ${String(b)}`);
  return (
    left.major - right.major
    || left.minor - right.minor
    || left.patch - right.patch
  );
}

/**
 * Whether `candidate` may be published over `previous`. Equal versions are not
 * newer: republishing the same number would leave two different artifacts
 * claiming to be the same release.
 */
export function isNewerReleaseVersion(candidate: string, previous: string | null | undefined): boolean {
  if (!isReleaseVersion(candidate)) return false;
  if (previous === null || previous === undefined) return true;
  if (!isReleaseVersion(previous)) return true;
  return compareReleaseVersions(candidate, previous) > 0;
}

export function nextReleaseVersion(
  previous: string | null | undefined,
  bump: ReleaseVersionBump = 'patch',
): string {
  const parsed = previous === null || previous === undefined ? null : parseReleaseVersion(previous);
  if (!parsed) return FIRST_RELEASE_VERSION;
  if (bump === 'major') return formatReleaseVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
  if (bump === 'minor') return formatReleaseVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  return formatReleaseVersion({ ...parsed, patch: parsed.patch + 1 });
}

/** The highest version in a history, ignoring entries that are not versions. */
export function latestReleaseVersion(versions: readonly string[]): string | null {
  let latest: string | null = null;
  for (const version of versions) {
    if (!isReleaseVersion(version)) continue;
    if (latest === null || compareReleaseVersions(version, latest) > 0) latest = version;
  }
  return latest;
}

export function generateReleaseId(): string {
  return generateId('release');
}
