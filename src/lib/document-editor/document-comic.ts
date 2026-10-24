/**
 * What the editor knows of a scene's comic reading from the document it has
 * open (docs/plans/COMIC-MODE-PLAN.md, section 9.4). The setting itself lives
 * on the scene record; what keeps a scene a novel is in its steps, which the
 * document holds as it is being written.
 */
import { sceneComicCapabilities, type NovelOnlyReason } from '@/lib/comic/comic-presentation';

import type { DocumentScene } from './types';

/**
 * Why the scene can only be read as the novel, or null. Video and interactive
 * objects are technical blocks, so those are the steps that count.
 */
export function documentSceneNovelOnly(scene: Pick<DocumentScene, 'blocks'>): NovelOnlyReason | null {
  return sceneComicCapabilities(scene.blocks.flatMap((block) => (block.kind === 'technical' ? [block.step] : []))).novelOnly;
}
