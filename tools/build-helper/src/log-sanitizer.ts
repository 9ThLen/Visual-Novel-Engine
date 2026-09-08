/**
 * What a build's output is allowed to say to a browser.
 *
 * Build logs are the most useful thing a helper can hand back and the most
 * careless. EAS prints the account the build belongs to, the absolute path of
 * the keystore it signed with, the fingerprint of the signing certificate, and
 * URLs carrying short-lived credentials. None of that is the app's business, and
 * once it reaches a browser tab it is one screenshot away from a bug report.
 *
 * Redacting rather than dropping: a line that says "signing with <redacted
 * keystore>" still tells an author which step they are on, which is the reason
 * to show logs at all.
 *
 * This is a filter, not a guarantee. It cannot know every shape a future
 * toolchain will print, so the helper also limits *what it runs*: nothing here
 * excuses passing raw output through when a builder can be asked for structured
 * progress instead.
 */

export interface LogSanitizerOptions {
  /** The helper's own pairing token, if it could ever be echoed. */
  secrets?: readonly string[];
  maxLineLength?: number;
}

const REDACTED = '[redacted]';

/**
 * Ordered: the broader patterns run last so a more specific one has already
 * claimed what it recognises. Each carries what it is for, because a bare regex
 * in a security filter is unreviewable.
 */
const PATTERNS: readonly { pattern: RegExp; replacement: string; why: string }[] = [
  {
    // `https://expo.dev/accounts/<owner>/projects/<slug>/builds/<uuid>`
    pattern: /https?:\/\/\S*\/accounts\/[^/\s]+\S*/gi,
    replacement: `${REDACTED} build url`,
    why: 'a build URL names the account and the project it belongs to',
  },
  {
    // Signed artifact and object-store URLs carry credentials in query strings.
    pattern: /https?:\/\/\S+[?&](?:token|sig|signature|x-amz-signature|access_token|api[_-]?key|code)=[^\s&]+[^\s]*/gi,
    replacement: `${REDACTED} credential url`,
    why: 'signed download URLs carry short-lived credentials even without an account path',
  },
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: `${REDACTED} email`,
    why: 'EAS prints the signed-in account',
  },
  {
    // `@owner/slug` as EAS writes a project identifier.
    pattern: /(^|\s)@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g,
    replacement: `$1${REDACTED} project`,
    why: 'the project identifier names the account',
  },
  {
    pattern: /\b(?:SHA-?1|SHA-?256|MD5)\s*[:=]\s*(?:[A-Fa-f0-9]{2}:){5,}[A-Fa-f0-9]{2}/g,
    replacement: `${REDACTED} fingerprint`,
    why: 'a signing certificate fingerprint identifies the key',
  },
  {
    pattern: /\b(?:keystore|key ?alias|key ?password|store ?password|credential[s]?|secret|token|api[_ -]?key)\b\s*[:=]\s*\S+/gi,
    replacement: `${REDACTED} credential`,
    why: 'credentials are sometimes printed with their values',
  },
  {
    // Windows and POSIX home directories, which carry the operator's name.
    pattern: /[A-Za-z]:\\Users\\[^\\\s"']+/g,
    replacement: `${REDACTED} path`,
    why: 'an absolute path names the machine and its user',
  },
  {
    pattern: /\/(?:Users|home)\/[^/\s"']+/g,
    replacement: `${REDACTED} path`,
    why: 'an absolute path names the machine and its user',
  },
  {
    pattern: /\/(?:tmp|workspace|var|opt|builds)\/[^\s"']+/gi,
    replacement: `${REDACTED} path`,
    why: 'an absolute toolchain path can disclose the operator or build layout',
  },
];

/** The patterns and their reasons, so a reviewer can read the policy. */
export function describeLogSanitizer(): { pattern: string; why: string }[] {
  return PATTERNS.map(({ pattern, why }) => ({ pattern: pattern.source, why }));
}

export function sanitizeBuildLogLine(line: string, options: LogSanitizerOptions = {}): string {
  // Remove terminal control sequences that can hide or rewrite a secret in a
  // browser console while keeping ordinary progress output readable.
  let output = line.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '');

  // Literal secrets first: they may be substrings the patterns would not match.
  for (const secret of options.secrets ?? []) {
    if (secret) output = output.split(secret).join(REDACTED);
  }

  for (const { pattern, replacement } of PATTERNS) {
    output = output.replace(new RegExp(pattern.source, pattern.flags), replacement);
  }

  const max = options.maxLineLength ?? 500;
  return output.length > max ? `${output.slice(0, max)}…` : output;
}

export function sanitizeBuildLog(
  lines: readonly string[],
  options: LogSanitizerOptions = {},
): string[] {
  return lines.map((line) => sanitizeBuildLogLine(line, options));
}
