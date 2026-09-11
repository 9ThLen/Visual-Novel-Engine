import type { Readable } from 'node:stream';

/**
 * Everything on a stream, as text.
 *
 * Used for the one value that must not travel as a command-line argument: on
 * Windows every process can read every other process's command line, so an API
 * key passed that way is readable by anything running as the user — including
 * whatever the key was being protected from.
 *
 * The stream is put into text mode rather than concatenated afterwards, so a
 * character split across two chunks is decoded once, by the stream, instead of
 * twice, by us.
 */
export async function readAll(stream: Readable): Promise<string> {
  stream.setEncoding('utf8');
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}
