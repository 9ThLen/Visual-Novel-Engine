/**
 * Asking for a rating is a favour the reader grants once, at the peak: the
 * moment an ending lands. Ask again after every ending and the prompt becomes
 * furniture, so a reader who has already reviewed is only asked on a first
 * ending — never mid-collection.
 */
export function shouldPromptForReview(
  endingsBefore: number,
  endingsAfter: number,
  hasMyReview: boolean,
): boolean {
  if (endingsAfter <= endingsBefore) return false;
  return endingsBefore === 0 || !hasMyReview;
}
