import fs from 'node:fs';
import path from 'node:path';

describe('ReaderScreen lifecycle contract', () => {
  it('remounts StoryReaderResponsive when the current scene or playback is replaced', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/reader.tsx'),
      'utf8',
    );
    const reader = source.match(/<StoryReaderResponsive[\s\S]*?\/>/)?.[0] ?? '';

    // The generation belongs in the key too: loading a save for the scene
    // already on screen leaves the scene id identical, and without a remount
    // the reader keeps page index, dialogue log and overlay state from the
    // playback that was just replaced.
    expect(reader).toContain('key={`${activeSceneId}:${playbackGeneration}`}');
    expect(reader).toContain('sceneId={activeSceneId}');
    expect(reader).toContain('playbackGeneration={playbackGeneration}');

    // The scene id still comes from the record first and the playback second —
    // but read once, above the guard, so neither has to be asserted non-null
    // in the render. Asserting one there crashed the screen for a story with
    // no playback to resume.
    expect(source).toContain(
      'const activeSceneId = sceneRecord?.id ?? playbackState?.currentSceneId;',
    );
    expect(source).toContain('|| !activeSceneId) {');
    expect(source).not.toContain('playbackState!');
  });

  it('keeps cross-scene rollback availability in render state', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/reader.tsx'),
      'utf8',
    );

    expect(source).toContain('const [sceneHistoryDepth, setSceneHistoryDepth] = useState(0)');
    expect(source).toContain('canRollbackScene={sceneHistoryDepth > 0}');
    expect(source).not.toContain('canRollbackScene={sceneHistoryRef.current.length > 0}');
  });

  it('tracks expected navigation by both story and scene', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/reader.tsx'),
      'utf8',
    );

    expect(source).toContain('storyId: playbackState.storyId');
    expect(source).toContain('sceneId: playbackState.currentSceneId');
    expect(source).toContain('onPlaybackReplaced={clearSceneHistory}');
  });

  it('clears route-local history only after a successful quick load', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/ReaderMenu.tsx'),
      'utf8',
    );
    const quickLoad = source.match(
      /const handleQuickLoad = async \(\) => \{[\s\S]*?\n  \};/,
    )?.[0] ?? '';

    const failedLoadGuard = quickLoad.indexOf('if (!loaded)');
    const historyReset = quickLoad.indexOf('onPlaybackReplaced?.()');
    const navigation = quickLoad.indexOf('router.replace');

    expect(failedLoadGuard).toBeGreaterThanOrEqual(0);
    expect(historyReset).toBeGreaterThan(failedLoadGuard);
    expect(navigation).toBeGreaterThan(historyReset);
  });
});
