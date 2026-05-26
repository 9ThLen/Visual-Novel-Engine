type ReaderChoiceLike = {
  targetSceneId?: string | null;
  nextSceneId?: string | null;
};

export function getChoiceTransitionTarget(choice: ReaderChoiceLike): string | null {
  return choice.targetSceneId ?? choice.nextSceneId ?? null;
}
