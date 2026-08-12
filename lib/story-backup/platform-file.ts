import { Platform } from 'react-native';

import { sourceFromBlob, sourceFromReadableStream } from '@/lib/story-backup/hash';
import type {
  StoryArchiveBinarySink,
  StoryArchiveBinarySource,
} from '@/lib/story-backup/types';

const STORY_BACKUP_MIME = 'application/vnd.vne.story-backup+zip';

export type PickedStoryImportFile = {
  name: string;
  kind: 'json';
  text: string;
} | {
  name: string;
  kind: 'backup';
  source: StoryArchiveBinarySource;
};

type FileSystemFileHandle = {
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(reason?: unknown): Promise<void>;
  }>;
};

function safeBackupFilename(title: string): string {
  const base = title.trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return `${base || 'story'}.vnebackup`;
}

class WebDownloadSink implements StoryArchiveBinarySink {
  private readonly chunks: Uint8Array[] = [];

  constructor(private readonly filename: string) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk.slice());
  }

  async close(): Promise<void> {
    const blob = new Blob(this.chunks, { type: STORY_BACKUP_MIME });
    this.chunks.length = 0;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async abort(): Promise<void> {
    this.chunks.length = 0;
  }
}

class NativeArchiveSink implements StoryArchiveBinarySink {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>;

  constructor(
    private readonly file: InstanceType<typeof import('expo-file-system').File>,
    private readonly filename: string,
  ) {
    this.writer = file.writableStream().getWriter();
  }

  async write(chunk: Uint8Array): Promise<void> {
    await this.writer.write(chunk);
  }

  async close(): Promise<void> {
    await this.writer.close();
    const Sharing = await import('expo-sharing');
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable');
    await Sharing.shareAsync(this.file.uri, {
      mimeType: STORY_BACKUP_MIME,
      dialogTitle: this.filename,
      UTI: 'public.zip-archive',
    });
  }

  async abort(reason: unknown): Promise<void> {
    await this.writer.abort(reason).catch(() => undefined);
    if (this.file.exists) this.file.delete();
  }
}

export async function createStoryArchiveFileSink(title: string): Promise<StoryArchiveBinarySink> {
  const filename = safeBackupFilename(title);
  if (Platform.OS === 'web') {
    const picker = (globalThis as typeof globalThis & {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;
    if (picker) {
      const handle = await picker({
        suggestedName: filename,
        types: [{
          description: 'Visual Novel Engine backup',
          accept: { [STORY_BACKUP_MIME]: ['.vnebackup'] },
        }],
      });
      return handle.createWritable();
    }
    return new WebDownloadSink(filename);
  }

  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  return new NativeArchiveSink(file, filename);
}

async function sourceLooksLikeJson(source: StoryArchiveBinarySource): Promise<boolean> {
  const decoder = new TextDecoder();
  let inspected = '';
  for await (const chunk of source.open()) {
    inspected += decoder.decode(chunk, { stream: true });
    const first = inspected.trimStart()[0];
    if (first) return first === '{' || first === '[';
    if (inspected.length >= 1024) return false;
  }
  return false;
}

async function readSourceText(source: StoryArchiveBinarySource): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of source.open()) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

export async function pickStoryImportFile(): Promise<PickedStoryImportFile | null> {
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', STORY_BACKUP_MIME, 'application/zip', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  let source: StoryArchiveBinarySource;
  if (Platform.OS === 'web' && asset.file) {
    source = sourceFromBlob(asset.file);
  } else {
    const { File } = await import('expo-file-system');
    const file = new File(asset.uri);
    source = sourceFromReadableStream(() => file.readableStream(), file.size);
  }
  return await sourceLooksLikeJson(source)
    ? { name: asset.name, kind: 'json', text: await readSourceText(source) }
    : { name: asset.name, kind: 'backup', source };
}
