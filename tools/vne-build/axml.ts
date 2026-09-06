/**
 * Read Android's binary XML.
 *
 * The manifest inside an APK is not text. The first version of this read it as
 * one big UTF-16 string and matched `android.permission.[A-Z_]+` against it,
 * which answered the question by accident: a name appearing anywhere in the
 * string pool counted, whether it was declared, mentioned by a library whose
 * declaration was then removed, or sitting in an unrelated attribute. Worse,
 * the failure direction was wrong — an encoding the scan did not understand
 * produced an empty list and a green result, so the check most likely to be
 * broken was the one that looked cleanest.
 *
 * This parses the chunk structure instead, so a permission counts because it is
 * the `android:name` of a `uses-permission` element, and an unrecognised format
 * throws rather than returning nothing.
 *
 * Format reference: AOSP `ResourceTypes.h`. Only the subset a manifest uses is
 * implemented; anything else is an error rather than a silent skip.
 */

const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_CDATA_TYPE = 0x0104;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const UTF8_FLAG = 1 << 8;
const NO_STRING = 0xffffffff;

/** `Res_value` data types, of which a manifest uses very few. */
const TYPE_NULL = 0x00;
const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;

export const ANDROID_NAMESPACE = 'http://schemas.android.com/apk/res/android';

export interface AxmlAttribute {
  namespace: string | null;
  name: string;
  /** Decoded: a string, a number, a boolean, or null for a reference. */
  value: string | number | boolean | null;
}

export interface AxmlElement {
  name: string;
  namespace: string | null;
  attributes: AxmlAttribute[];
  children: AxmlElement[];
}

/**
 * The string pool.
 *
 * Both encodings are here because both occur: `aapt2` writes UTF-8 pools and
 * plenty of the tooling in this chain still writes UTF-16. Reading only one of
 * them would be the same bug as the string scan, in a smaller costume.
 */
function readStringPool(bytes: Uint8Array, view: DataView, start: number): string[] {
  const size = view.getUint32(start + 4, true);
  const stringCount = view.getUint32(start + 8, true);
  const flags = view.getUint32(start + 16, true);
  const stringsStart = view.getUint32(start + 20, true);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const decoder = new TextDecoder(utf8 ? 'utf-8' : 'utf-16le');

  const strings: string[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    const offset = start + stringsStart + view.getUint32(start + 28 + index * 4, true);
    if (offset < 0 || offset >= start + size) {
      throw new Error('Binary XML: a string pool entry points outside the pool.');
    }

    if (utf8) {
      // Two lengths — characters, then bytes — each one or two bytes wide.
      let at = offset;
      at += (bytes[at] & 0x80) !== 0 ? 2 : 1;
      let byteLength = bytes[at];
      if ((byteLength & 0x80) !== 0) {
        byteLength = ((byteLength & 0x7f) << 8) | bytes[at + 1];
        at += 2;
      } else {
        at += 1;
      }
      strings.push(decoder.decode(bytes.subarray(at, at + byteLength)));
    } else {
      let at = offset;
      let charLength = view.getUint16(at, true);
      if ((charLength & 0x8000) !== 0) {
        charLength = ((charLength & 0x7fff) << 16) | view.getUint16(at + 2, true);
        at += 4;
      } else {
        at += 2;
      }
      strings.push(decoder.decode(bytes.subarray(at, at + charLength * 2)));
    }
  }
  return strings;
}

function stringAt(pool: string[], index: number): string | null {
  // 0xFFFFFFFF is "no string" — how an absent namespace is written.
  return index === NO_STRING || index >= pool.length ? null : pool[index];
}

function decodeValue(
  pool: string[],
  rawValueIndex: number,
  dataType: number,
  data: number,
): string | number | boolean | null {
  const raw = stringAt(pool, rawValueIndex);
  if (raw !== null) return raw;
  switch (dataType) {
    case TYPE_STRING: return stringAt(pool, data);
    case TYPE_INT_DEC:
    case TYPE_INT_HEX: return data;
    case TYPE_INT_BOOLEAN: return data !== 0;
    case TYPE_NULL:
    case TYPE_REFERENCE: return null;
    default: return data;
  }
}

/**
 * Parse a binary `AndroidManifest.xml` into a tree.
 *
 * Throws on anything it does not recognise. That direction is the point: this
 * exists to make claims about an artifact a reader installs, and a parser that
 * shrugs turns "nothing wrong found" into "nothing looked at".
 */
export function parseBinaryXml(bytes: Uint8Array): AxmlElement {
  if (bytes.length < 8) throw new Error('Binary XML: too short to be a document.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== RES_XML_TYPE) {
    throw new Error('Binary XML: not a compiled XML document (bad magic).');
  }

  let pool: string[] | null = null;
  const stack: AxmlElement[] = [];
  let root: AxmlElement | null = null;

  let offset = view.getUint16(2, true); // past the file header
  while (offset + 8 <= bytes.length) {
    const type = view.getUint16(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > bytes.length) {
      throw new Error(`Binary XML: the chunk at ${offset} declares an impossible size.`);
    }

    switch (type) {
      case RES_STRING_POOL_TYPE:
        pool = readStringPool(bytes, view, offset);
        break;

      case RES_XML_START_ELEMENT_TYPE: {
        if (!pool) throw new Error('Binary XML: an element appears before the string pool.');
        const namespace = stringAt(pool, view.getUint32(offset + 16, true));
        const name = stringAt(pool, view.getUint32(offset + 20, true));
        if (name === null) throw new Error('Binary XML: an element has no name.');

        const attributeStart = view.getUint16(offset + 24, true);
        const attributeSize = view.getUint16(offset + 26, true);
        const attributeCount = view.getUint16(offset + 28, true);

        const attributes: AxmlAttribute[] = [];
        for (let index = 0; index < attributeCount; index += 1) {
          // ResXMLTree_attribute: ns, name, rawValue, then a Res_value whose
          // data type is its 16th byte and whose payload is its last four.
          // `attributeStart` counts from the attrExt struct, which begins after
          // the 16-byte node header — not from the chunk.
          const at = offset + 16 + attributeStart + index * attributeSize;
          if (at + 20 > offset + size) {
            throw new Error('Binary XML: attributes run past the element that holds them.');
          }
          const attributeName = stringAt(pool, view.getUint32(at + 4, true));
          if (attributeName === null) continue;
          attributes.push({
            namespace: stringAt(pool, view.getUint32(at, true)),
            name: attributeName,
            value: decodeValue(
              pool,
              view.getUint32(at + 8, true),
              view.getUint8(at + 15),
              view.getUint32(at + 16, true),
            ),
          });
        }

        const element: AxmlElement = { name, namespace, attributes, children: [] };
        if (stack.length > 0) stack[stack.length - 1].children.push(element);
        else if (root) throw new Error('Binary XML: more than one root element.');
        else root = element;
        stack.push(element);
        break;
      }

      case RES_XML_END_ELEMENT_TYPE:
        if (stack.length === 0) throw new Error('Binary XML: an element closes that never opened.');
        stack.pop();
        break;

      case RES_XML_START_NAMESPACE_TYPE:
      case RES_XML_END_NAMESPACE_TYPE:
      case RES_XML_CDATA_TYPE:
      case RES_XML_RESOURCE_MAP_TYPE:
        break;

      default:
        throw new Error(`Binary XML: unrecognised chunk type 0x${type.toString(16)} at ${offset}.`);
    }
    offset += size;
  }

  if (!root) throw new Error('Binary XML: the document has no root element.');
  if (stack.length > 0) throw new Error('Binary XML: the document ends inside an element.');
  return root;
}

/** Every element with this tag name, at any depth. */
export function elementsNamed(root: AxmlElement, name: string): AxmlElement[] {
  const found: AxmlElement[] = [];
  const walk = (element: AxmlElement): void => {
    if (element.name === name) found.push(element);
    for (const child of element.children) walk(child);
  };
  walk(root);
  return found;
}

/**
 * An attribute by name, preferring the Android namespace.
 *
 * `package` on `<manifest>` carries no namespace while `android:versionCode`
 * beside it does, so both spellings must be reachable — but a same-named
 * attribute in some third namespace must never answer for the Android one,
 * which is why this is not a plain name match.
 */
export function attribute(element: AxmlElement, name: string): AxmlAttribute | null {
  return element.attributes.find((entry) => entry.name === name && entry.namespace === ANDROID_NAMESPACE)
    ?? element.attributes.find((entry) => entry.name === name && entry.namespace === null)
    ?? null;
}
