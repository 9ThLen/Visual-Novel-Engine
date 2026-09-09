/**
 * Leaving the document editor.
 *
 * Scene-to-scene navigation inside the editor pushes a fresh `/document-editor`
 * entry (open a branch, add a scene, duplicate one), so the history above the
 * story hub is as deep as the session was long. `router.back()` therefore
 * walked that history one scene at a time instead of leaving — and an author
 * who looped between two scenes could not reach the hub at all.
 *
 * The exit button never consults history: it pops straight to the story hub for
 * this story, and pushes it when the editor was opened by a deep link and the
 * hub is not on the stack.
 */
export interface EditorExitRouter {
  dismissTo: (href: { pathname: '/story-home'; params: { storyId: string } }) => void;
}

export const STORY_HOME_ROUTE = '/story-home' as const;

export function exitEditorToStoryHome(router: EditorExitRouter, storyId: string): void {
  router.dismissTo({ pathname: STORY_HOME_ROUTE, params: { storyId } });
}
