/**
 * Write Android's binary XML, so the parser can be tested against real ones.
 *
 * The parser it exercises replaced a string scan over the decoded manifest. A
 * test that fed that parser a hand-rolled blob shaped like whatever the parser
 * happened to read would repeat the original mistake one level up, so this
 * encodes the actual chunk format described in AOSP `ResourceTypes.h` —
 * including both string-pool encodings, because reading only one of them was
 * one of the ways the old version could quietly return nothing.
 */

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;

const UTF8_FLAG = 1 << 8;
const NO_STRING = 0xffffffff;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;

export const ANDROID_NAMESPACE = 'http://schemas.android.com/apk/res/android';

export interface FakeAttribute {
  name: string;
  value: string | number;
  /** Attributes in the Android namespace; `package` on `<manifest>` is not. */
  android?: boolean;
}

export interface FakeElement {
  name: string;
  attributes?: FakeAttribute[];
  children?: FakeElement[];
}

class Bytes {
  private data: number[] = [];
  get length(): number { return this.data.length; }
  u8(value: number): this { this.data.push(value & 0xff); return this; }
  u16(value: number): this { return this.u8(value).u8(value >>> 8); }
  u32(value: number): this { return this.u16(value & 0xffff).u16(value >>> 16); }
  raw(values: ArrayLike<number>): this { for (let i = 0; i < values.length; i += 1) this.data.push(values[i] & 0xff); return this; }
  padTo4(): this { while (this.data.length % 4 !== 0) this.u8(0); return this; }
  toUint8Array(): Uint8Array { return Uint8Array.from(this.data); }
}

function stringPool(strings: string[], utf8: boolean): Uint8Array {
  const data = new Bytes();
  const offsets: number[] = [];
  for (const value of strings) {
    offsets.push(data.length);
    if (utf8) {
      const encoded = new TextEncoder().encode(value);
      data.u8(value.length).u8(encoded.length).raw(encoded).u8(0);
    } else {
      data.u16(value.length);
      for (const character of value) data.u16(character.charCodeAt(0));
      data.u16(0);
    }
  }
  data.padTo4();

  const headerSize = 28;
  const stringsStart = headerSize + strings.length * 4;
  const chunk = new Bytes()
    .u16(RES_STRING_POOL_TYPE)
    .u16(headerSize)
    .u32(stringsStart + data.length)
    .u32(strings.length)
    .u32(0)
    .u32(utf8 ? UTF8_FLAG : 0)
    .u32(stringsStart)
    .u32(0);
  for (const offset of offsets) chunk.u32(offset);
  return chunk.raw(data.toUint8Array()).toUint8Array();
}

/**
 * Encode a document. String values become string-typed attributes and numbers
 * become decimal ints, which is exactly how `versionName` and `versionCode`
 * differ in a real manifest.
 */
export function encodeBinaryXml(root: FakeElement, options: { utf8?: boolean } = {}): Uint8Array {
  const strings: string[] = [];
  const intern = (value: string): number => {
    const existing = strings.indexOf(value);
    if (existing >= 0) return existing;
    strings.push(value);
    return strings.length - 1;
  };

  // Interned before the body is written: the pool chunk comes first in the file
  // and every index in the body points into it.
  intern('android');
  intern(ANDROID_NAMESPACE);
  const walk = (element: FakeElement): void => {
    intern(element.name);
    for (const attribute of element.attributes ?? []) {
      intern(attribute.name);
      if (typeof attribute.value === 'string') intern(attribute.value);
    }
    for (const child of element.children ?? []) walk(child);
  };
  walk(root);

  const body = new Bytes();
  const node = (type: number, payload: (out: Bytes) => void, extra: number): void => {
    body.u16(type).u16(16).u32(16 + extra).u32(1).u32(NO_STRING);
    payload(body);
  };

  node(RES_XML_START_NAMESPACE_TYPE, (out) => {
    out.u32(intern('android')).u32(intern(ANDROID_NAMESPACE));
  }, 8);

  const emit = (element: FakeElement): void => {
    const attributes = element.attributes ?? [];
    node(RES_XML_START_ELEMENT_TYPE, (out) => {
      out.u32(NO_STRING).u32(intern(element.name));
      out.u16(20).u16(20).u16(attributes.length).u16(0).u16(0).u16(0);
      for (const attribute of attributes) {
        const isString = typeof attribute.value === 'string';
        out.u32(attribute.android ? intern(ANDROID_NAMESPACE) : NO_STRING);
        out.u32(intern(attribute.name));
        out.u32(isString ? intern(attribute.value as string) : NO_STRING);
        out.u16(8).u8(0).u8(isString ? TYPE_STRING : TYPE_INT_DEC);
        out.u32(isString ? intern(attribute.value as string) : (attribute.value as number));
      }
    }, 20 + attributes.length * 20);

    for (const child of element.children ?? []) emit(child);

    node(RES_XML_END_ELEMENT_TYPE, (out) => {
      out.u32(NO_STRING).u32(intern(element.name));
    }, 8);
  };
  emit(root);

  node(RES_XML_END_NAMESPACE_TYPE, (out) => {
    out.u32(intern('android')).u32(intern(ANDROID_NAMESPACE));
  }, 8);

  const pool = stringPool(strings, options.utf8 ?? false);
  const bodyBytes = body.toUint8Array();
  return new Bytes()
    .u16(RES_XML_TYPE)
    .u16(8)
    .u32(8 + pool.length + bodyBytes.length)
    .raw(pool)
    .raw(bodyBytes)
    .toUint8Array();
}

/** A manifest shaped like the one EAS produces, with the parts under test. */
export function fakeManifest(input: {
  applicationId?: string;
  versionCode?: number;
  versionName?: string;
  permissions?: string[];
  /** Names present in the string pool but declared by nothing. */
  mentionedOnly?: string[];
}): Uint8Array {
  return encodeBinaryXml({
    name: 'manifest',
    attributes: [
      { name: 'package', value: input.applicationId ?? 'com.vne.story.demo.s1' },
      { name: 'versionCode', value: input.versionCode ?? 1_000_000, android: true },
      { name: 'versionName', value: input.versionName ?? '1.0.0', android: true },
    ],
    children: [
      ...(input.permissions ?? []).map((name) => ({
        name: 'uses-permission',
        attributes: [{ name: 'name', value: name, android: true }],
      })),
      {
        name: 'application',
        attributes: [
          { name: 'label', value: 'A Novel', android: true },
          // Where a name can sit without being a declaration — the case the
          // string scan could not tell from a real one.
          ...(input.mentionedOnly ?? []).map((value, index) => ({
            name: `meta${index}`,
            value,
            android: true,
          })),
        ],
      },
    ],
  });
}
