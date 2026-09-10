export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_TEXT_ATTACHMENT_BYTES = 256 * 1024;
export const MAX_BINARY_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 120;

export type AttachmentKind = 'image' | 'pdf' | 'text';

export interface AttachmentRef {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  assetId?: string;
}

export interface StoredChatAttachment extends AttachmentRef {
  storyId: string;
  messageId?: string;
  blob: Blob;
  createdAt: number;
}

export interface AgentAttachment extends AttachmentRef {
  bytes: Uint8Array;
}

const BIDI_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function sanitizeAttachmentName(input: string): string {
  const basename = input.replace(/\\/g, '/').split('/').at(-1)?.trim() ?? '';
  if (!basename || BIDI_OR_CONTROL.test(basename)) throw new Error('Invalid attachment filename');
  return basename.slice(0, MAX_ATTACHMENT_NAME_LENGTH);
}

export function detectAttachment(bytes: Uint8Array): Pick<AttachmentRef, 'kind' | 'mimeType'> {
  if (startsWith(bytes, PNG)) return { kind: 'image', mimeType: 'image/png' };
  if (startsWith(bytes, JPEG)) return { kind: 'image', mimeType: 'image/jpeg' };
  if (startsWith(bytes, WEBP_RIFF) && startsWith(bytes, WEBP, 8)) return { kind: 'image', mimeType: 'image/webp' };
  if (startsWith(bytes, PDF)) return { kind: 'pdf', mimeType: 'application/pdf' };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) || startsWith(bytes, [0x3c, 0x73, 0x76, 0x67])) {
    throw new Error('Unsupported attachment format');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0') || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new Error('Attachment is not valid UTF-8 text');
  }
  return { kind: 'text', mimeType: 'text/plain' };
}

export function validateAgentAttachments(attachments: readonly AgentAttachment[]): void {
  if (attachments.length > MAX_CHAT_ATTACHMENTS) throw new Error('Too many attachments');
  let total = 0;
  for (const attachment of attachments) {
    const detected = detectAttachment(attachment.bytes);
    if (detected.kind !== attachment.kind || detected.mimeType !== attachment.mimeType) throw new Error('Attachment type mismatch');
    const limit = attachment.kind === 'text' ? MAX_TEXT_ATTACHMENT_BYTES : MAX_BINARY_ATTACHMENT_BYTES;
    if (!attachment.bytes.byteLength || attachment.bytes.byteLength > limit || attachment.byteSize !== attachment.bytes.byteLength) {
      throw new Error('Attachment size is invalid');
    }
    total += attachment.bytes.byteLength;
  }
  if (total > MAX_MESSAGE_ATTACHMENT_BYTES) throw new Error('Attachments exceed message size limit');
}
