import fs from 'node:fs';
import path from 'node:path';

describe('ReaderScreen lifecycle contract', () => {
  it('remounts StoryReaderResponsive when the current scene changes', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/reader.tsx'),
      'utf8',
    );
    const reader = source.match(/<StoryReaderResponsive[\s\S]*?\/>/)?.[0] ?? '';

    expect(reader).toContain('key={sceneRecord?.id ?? playbackState!.currentSceneId}');
    expect(reader).toContain('sceneId={sceneRecord?.id ?? playbackState!.currentSceneId}');
  });
});
