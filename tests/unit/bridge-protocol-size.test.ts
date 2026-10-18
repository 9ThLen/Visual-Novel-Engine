import { BRIDGE_PROTOCOL_VERSION, isServerMessage, makeEnvelope, MAX_IMAGE_MESSAGE_BYTES, MAX_MESSAGE_BYTES, parseEnvelope } from '../../src/lib/bridge-protocol';

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

describe('bridge protocol v5', () => {
  it('refuses an envelope from the version before it', () => {
    const previous = JSON.stringify({ ...makeEnvelope('ping', {}), protocolVersion: BRIDGE_PROTOCOL_VERSION - 1 });

    expect(BRIDGE_PROTOCOL_VERSION).toBe(5);
    expect(parseEnvelope(previous)).toHaveProperty('parseError');
  });

  it('knows the messages that cancel a tool call and acknowledge its result', () => {
    expect(isServerMessage(makeEnvelope('tool_cancel', { toolCallId: 'call_1', reason: 'expired' }))).toBe(true);
    expect(isServerMessage(makeEnvelope('tool_result_ack', { toolCallId: 'call_1' }))).toBe(true);
  });

  it('keeps a message that carries the editor context inside the normal size tier', () => {
    const context = { selection: { text: 'x'.repeat(4000) } };

    expect(parseEnvelope(raw('user_message', { text: 'Rewrite this', editorContext: context }))).toMatchObject({ type: 'user_message' });
    expect(parseEnvelope(raw('user_message', { text: 'x'.repeat(MAX_MESSAGE_BYTES), editorContext: context }))).toHaveProperty('parseError');
  });
});
