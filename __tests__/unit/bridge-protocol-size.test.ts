import { makeEnvelope, MAX_IMAGE_MESSAGE_BYTES, MAX_MESSAGE_BYTES, parseEnvelope } from '../../lib/bridge-protocol';

const raw = (type: Parameters<typeof makeEnvelope>[0], payload: unknown) => JSON.stringify(makeEnvelope(type, payload));

describe('bridge payload size tiers', () => {
  it('keeps normal messages at 1 MB', () => {
    expect(parseEnvelope(raw('user_message', { text: 'x'.repeat(MAX_MESSAGE_BYTES + 1) }))).toHaveProperty('parseError');
  });

  it('allows image and hinted binary tool envelopes up to 8 MB', () => {
    expect(parseEnvelope(raw('image_result', { data: 'x'.repeat(5_000_000) }))).toMatchObject({ type: 'image_result' });
    expect(parseEnvelope(raw('tool_result', { binaryTool: true, data: 'x'.repeat(1_500_000) }))).toMatchObject({ type: 'tool_result' });
    expect(parseEnvelope(raw('user_message', {
      text: '',
      attachments: [{ id: 'a', name: 'a.pdf', kind: 'pdf', mimeType: 'application/pdf', byteSize: 1, base64: 'x'.repeat(1_500_000) }],
    }))).toMatchObject({ type: 'user_message' });
  });

  it('rejects every envelope beyond 8 MB', () => {
    expect(parseEnvelope(raw('image_result', { data: 'x'.repeat(MAX_IMAGE_MESSAGE_BYTES + 1) }))).toHaveProperty('parseError');
  });
});
