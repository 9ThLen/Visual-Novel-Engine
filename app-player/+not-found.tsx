/**
 * A player has one story, so every route is that story.
 *
 * The studio's not-found screen is the right answer when a reader mistypes a URL
 * in an app with many pages. Here it is never the right answer, and on a bundle
 * opened from the filesystem it is the *only* answer the router can reach: the
 * document's path is `/C:/Users/…/index.html`, which matches no route. Sending
 * the reader to the story is both what they wanted and the only thing this
 * bundle contains.
 */
export { default } from './index';
