import {
  detectAttachment,
  sanitizeAttachmentName,
  validateAgentAttachments,
  type AgentAttachment,
} from '@/lib/ai/attachments';

const encoder = new TextEncoder();

describe('AI chat attachments', () => {
  it('detects supported magic bytes instead of trusting metadata', () => {
    expect(detectAttachment(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toEqual({ kind: 'image', mimeType: 'image/png' });
    expect(detectAttachment(encoder.encode('%PDF-1.7'))).toEqual({ kind: 'pdf', mimeType: 'application/pdf' });
    expect(() => detectAttachment(encoder.encode('GIF89a'))).toThrow('Unsupported');
    expect(() => detectAttachment(encoder.encode('<svg'))).toThrow('Unsupported');
  });

  it('strictly rejects invalid UTF-8 and binary controls', () => {
    expect(() => detectAttachment(new Uint8Array([0xc3, 0x28]))).toThrow();
    expect(() => detectAttachment(encoder.encode('hello\0world'))).toThrow();
    expect(detectAttachment(encoder.encode('# Markdown\nhello'))).toEqual({ kind: 'text', mimeType: 'text/plain' });
  });

  it('normalizes basenames and rejects bidi/control filename tricks', () => {
    expect(sanitizeAttachmentName('C:\\fake\\notes.md')).toBe('notes.md');
    expect(() => sanitizeAttachmentName('safe\u202Egnp.txt')).toThrow();
    expect(() => sanitizeAttachmentName('../')).toThrow();
  });

  it('checks actual bytes, declared type, and decoded size', () => {
    const bytes = encoder.encode('hello');
    const attachment: AgentAttachment = {
      id: 'a', name: 'a.txt', kind: 'text', mimeType: 'text/plain', byteSize: bytes.byteLength, bytes,
    };
    expect(() => validateAgentAttachments([attachment])).not.toThrow();
    expect(() => validateAgentAttachments([{ ...attachment, byteSize: 2 }])).toThrow('size');
    expect(() => validateAgentAttachments([{ ...attachment, kind: 'pdf', mimeType: 'application/pdf' }])).toThrow('type');
  });
});
