/**
 * The binary manifest parser.
 *
 * It exists because the check it replaced could not tell a declaration from a
 * mention, and — worse — answered "nothing found" for any encoding it did not
 * understand, which is the reading most likely to be wrong and the one that
 * looked cleanest. Both properties are asserted here directly.
 */
import { attribute, elementsNamed, parseBinaryXml, ANDROID_NAMESPACE } from '../../../tools/vne-build/axml';
import { encodeBinaryXml, fakeManifest } from '../../helpers/android-manifest';

describe('parsing a binary AndroidManifest', () => {
  it('reads the identity attributes with their types intact', () => {
    const root = parseBinaryXml(fakeManifest({
      applicationId: 'com.vne.story.museum.s7abc',
      versionCode: 1_000_001,
      versionName: '1.0.1',
    }));

    expect(root.name).toBe('manifest');
    // `package` carries no namespace, the two versions do; a parser that
    // matched on bare names would still pass, so the namespace is asserted.
    expect(attribute(root, 'package')?.value).toBe('com.vne.story.museum.s7abc');
    expect(attribute(root, 'package')?.namespace).toBeNull();
    expect(attribute(root, 'versionCode')?.value).toBe(1_000_001);
    expect(attribute(root, 'versionName')?.namespace).toBe(ANDROID_NAMESPACE);
  });

  it('finds declared permissions at any depth', () => {
    const root = parseBinaryXml(fakeManifest({
      permissions: ['android.permission.INTERNET', 'android.permission.VIBRATE'],
    }));
    expect(elementsNamed(root, 'uses-permission')
      .map((element) => attribute(element, 'name')?.value))
      .toEqual(['android.permission.INTERNET', 'android.permission.VIBRATE']);
  });

  /**
   * The bug the parser was written for. A name in the string pool is not a
   * grant, and the old string scan counted it as one.
   */
  it('does not mistake a mentioned permission for a declared one', () => {
    const root = parseBinaryXml(fakeManifest({
      permissions: ['android.permission.INTERNET'],
      mentionedOnly: ['android.permission.CAMERA'],
    }));
    const declared = elementsNamed(root, 'uses-permission')
      .map((element) => attribute(element, 'name')?.value);

    expect(declared).toEqual(['android.permission.INTERNET']);
    expect(declared).not.toContain('android.permission.CAMERA');
  });

  it('reads a UTF-8 string pool as well as a UTF-16 one', () => {
    const utf8 = parseBinaryXml(encodeBinaryXml({
      name: 'manifest',
      attributes: [{ name: 'package', value: 'com.vne.story.utf8.s1' }],
    }, { utf8: true }));
    expect(attribute(utf8, 'package')?.value).toBe('com.vne.story.utf8.s1');
  });

  it('keeps nesting rather than flattening it', () => {
    const root = parseBinaryXml(encodeBinaryXml({
      name: 'manifest',
      children: [{ name: 'application', children: [{ name: 'activity' }] }],
    }));
    expect(root.children[0].name).toBe('application');
    expect(root.children[0].children[0].name).toBe('activity');
    expect(elementsNamed(root, 'activity')).toHaveLength(1);
  });

  /**
   * The direction that matters. Every one of these used to be an empty
   * permission list and a green report.
   */
  describe('refuses what it cannot read', () => {
    it('rejects a document that is not compiled XML', () => {
      expect(() => parseBinaryXml(new TextEncoder().encode('<manifest/>')))
        .toThrow('bad magic');
    });

    it('rejects a truncated document', () => {
      expect(() => parseBinaryXml(new Uint8Array([3, 0, 8]))).toThrow('too short');
    });

    it('rejects an unrecognised chunk instead of skipping it', () => {
      const document = fakeManifest({ permissions: ['android.permission.INTERNET'] });
      // A chunk type nothing in a manifest uses, with a plausible size.
      const tampered = new Uint8Array(document.length + 8);
      tampered.set(document.subarray(0, 8), 0);
      new DataView(tampered.buffer).setUint16(8, 0x4242, true);
      new DataView(tampered.buffer).setUint16(10, 8, true);
      new DataView(tampered.buffer).setUint32(12, 8, true);
      tampered.set(document.subarray(8), 16);
      expect(() => parseBinaryXml(tampered)).toThrow('unrecognised chunk type');
    });

    /**
     * These three used to come back as ordinary absences — a null namespace, a
     * skipped attribute, a mismatched close nobody compared — which is the same
     * failure direction as the string scan: damage arriving as "nothing here".
     */
    it('rejects a string index outside the pool', () => {
      const document = fakeManifest({ permissions: ['android.permission.INTERNET'] });
      const view = new DataView(document.buffer, document.byteOffset, document.byteLength);
      // The root element's name index, pointed past the end of the pool.
      const start = view.getUint16(2, true) + view.getUint32(view.getUint16(2, true) + 4, true);
      view.setUint32(start + 16 + 20 + 4, 9999, true);
      expect(() => parseBinaryXml(document)).toThrow(/outside a pool/);
    });

    it('rejects an attribute whose name will not resolve', () => {
      const document = fakeManifest({ permissions: ['android.permission.INTERNET'] });
      const view = new DataView(document.buffer, document.byteOffset, document.byteLength);
      const poolStart = view.getUint16(2, true);
      const bodyStart = poolStart + view.getUint32(poolStart + 4, true);
      // First element, first attribute, its name index.
      const attribute = bodyStart + 24 + 16 + 20;
      view.setUint32(attribute + 4, 0xffffffff, true);
      expect(() => parseBinaryXml(document)).toThrow(/attribute has no name/);
    });

    it('rejects a close tag that names a different element', () => {
      const document = fakeManifest({ permissions: ['android.permission.INTERNET'] });
      const view = new DataView(document.buffer, document.byteOffset, document.byteLength);
      const poolStart = view.getUint16(2, true);
      let at = poolStart + view.getUint32(poolStart + 4, true);
      // Walk to the first end-element chunk and rename what it closes.
      while (view.getUint16(at, true) !== 0x0103) at += view.getUint32(at + 4, true);
      view.setUint32(at + 20, 0, true); // 'android', which opened nothing
      expect(() => parseBinaryXml(document)).toThrow(/is closed by/);
    });

    it('rejects a chunk whose declared size runs past the file', () => {
      const document = fakeManifest({});
      const view = new DataView(document.buffer, document.byteOffset, document.byteLength);
      view.setUint32(12, 0xffff, true); // the string pool's size field
      expect(() => parseBinaryXml(document)).toThrow('impossible size');
    });
  });
});
