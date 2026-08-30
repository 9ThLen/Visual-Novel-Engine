/**
 * What a build's output is allowed to say to a browser.
 *
 * EAS prints the account a build belongs to, the path of the keystore it signed
 * with, the fingerprint of the certificate and URLs carrying short-lived
 * credentials. Once any of that reaches a tab it is one screenshot away from a
 * bug report, so it is redacted on the way out — and redacted rather than
 * dropped, because a line that says which step failed is the reason to show
 * logs at all.
 */
import {
  describeLogSanitizer,
  sanitizeBuildLog,
  sanitizeBuildLogLine,
} from '../../../tools/build-helper/src/log-sanitizer';

describe('sanitizing build output', () => {
  it('keeps the part that tells an author what is happening', () => {
    expect(sanitizeBuildLogLine('Compiling :app:mergeReleaseResources'))
      .toBe('Compiling :app:mergeReleaseResources');
  });

  it('redacts the account a build belongs to', () => {
    expect(sanitizeBuildLogLine('Signed in as writer@example.com'))
      .toBe('Signed in as [redacted] email');
    expect(sanitizeBuildLogLine('Project @studio-name/my-novel'))
      .toBe('Project [redacted] project');
  });

  it('redacts a build url, which names the account and the project', () => {
    const line = 'Build details: https://expo.dev/accounts/studio/projects/novel/builds/abc-123';
    expect(sanitizeBuildLogLine(line)).toBe('Build details: [redacted] build url');
  });

  it('redacts a signing fingerprint', () => {
    const line = 'SHA-256: AB:CD:EF:01:23:45:67:89:AB:CD';
    expect(sanitizeBuildLogLine(line)).toContain('[redacted] fingerprint');
    expect(sanitizeBuildLogLine(line)).not.toContain('AB:CD:EF');
  });

  it('redacts credentials printed with their values', () => {
    for (const line of [
      'keystore: /var/keys/upload.jks',
      'key alias = upload',
      'API_KEY: sk-live-abcdef',
      'token=eyJhbGciOi',
    ]) {
      expect(sanitizeBuildLogLine(line), line).toContain('[redacted] credential');
    }
  });

  it('redacts an absolute path, which names the machine and its user', () => {
    expect(sanitizeBuildLogLine('Reading C:\\Users\\viktor\\project\\gradle.properties'))
      .toContain('[redacted] path');
    expect(sanitizeBuildLogLine('Reading /Users/viktor/project/gradle.properties'))
      .toContain('[redacted] path');
    expect(sanitizeBuildLogLine('Reading /home/runner/work/project'))
      .toContain('[redacted] path');
  });

  /**
   * The helper's own pairing token would be the worst thing to echo: it is the
   * key to the endpoint that runs builds on this machine.
   */
  it('redacts a literal secret it was told about', () => {
    expect(sanitizeBuildLogLine('using token deadbeefcafe', { secrets: ['deadbeefcafe'] }))
      .toBe('using token [redacted]');
  });

  it('caps a line so one runaway message cannot fill a job record', () => {
    const long = 'x'.repeat(2000);
    expect(sanitizeBuildLogLine(long, { maxLineLength: 50 })).toHaveLength(51);
  });

  it('sanitizes a whole log at once', () => {
    expect(sanitizeBuildLog(['ok', 'as writer@example.com'])).toEqual([
      'ok',
      'as [redacted] email',
    ]);
  });

  /**
   * A bare regex in a security filter is unreviewable, so each carries what it
   * is for and the set can be read back.
   */
  it('can explain itself', () => {
    const described = describeLogSanitizer();
    expect(described.length).toBeGreaterThan(0);
    for (const entry of described) {
      expect(entry.why.length).toBeGreaterThan(10);
    }
  });
});
