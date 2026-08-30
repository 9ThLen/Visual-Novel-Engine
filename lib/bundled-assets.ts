/**
 * Art that ships inside the app, as static `require` calls.
 *
 * Its own module for one reason: **the player build substitutes it.** Metro
 * bundles what it can see through a static require, so every file named here is
 * inside every artifact — around 110 MB of demo backgrounds, sample music and
 * character sprites that a published novel never shows. A release carries its
 * own bytes (`lib/story-backup/capture.ts` resolves bundled references and packs
 * them), so the player answers from the packaged map and needs none of this.
 *
 * `player-profile.js` points Metro at `bundled-assets.player.ts` instead, which
 * is the same module with an empty map. See `PLAYER_MODULE_SUBSTITUTIONS`.
 */
export const BUNDLED_ASSETS: Record<string, number> = {
  // Background assets - full paths
  'assets/background/bg-ancient-library.png': require('../assets/background/bg-ancient-library.png'),
  'assets/background/bg-grand-hall.png': require('../assets/background/bg-grand-hall.png'),
  'assets/background/bg-hall-mirrors.png': require('../assets/background/bg-hall-mirrors.png'),
  'assets/background/bg-museum-entrance.png': require('../assets/background/bg-museum-entrance.png'),
  'assets/background/bg-treasure-chamber.png': require('../assets/background/bg-treasure-chamber.png'),
  'assets/background/bg-upper-library.png': require('../assets/background/bg-upper-library.png'),

  // Story illustration assets
  'assets/images/img-reflection-hint.png': require('../assets/images/img-reflection-hint.png'),
  'assets/images/img-phoenix-illustration.png': require('../assets/images/img-phoenix-illustration.png'),
  'assets/images/img-constellation-phoenix.png': require('../assets/images/img-constellation-phoenix.png'),

  // Background assets - short names
  'bg-ancient-library': require('../assets/background/bg-ancient-library.png'),
  'bg-grand-hall': require('../assets/background/bg-grand-hall.png'),
  'bg-hall-mirrors': require('../assets/background/bg-hall-mirrors.png'),
  'bg-museum-entrance': require('../assets/background/bg-museum-entrance.png'),
  'bg-treasure-chamber': require('../assets/background/bg-treasure-chamber.png'),
  'bg-upper-library': require('../assets/background/bg-upper-library.png'),

  // Character assets
  'assets/charakters/char-guide.png': require('../assets/charakters/char-guide.png'),
  'assets/charakters/char-librarian.png': require('../assets/charakters/char-librarian.png'),
  'assets/charakters/char-reflection.png': require('../assets/charakters/char-reflection.png'),
  'assets/charakters/char-demo-analyst.png': require('../assets/charakters/char-demo-analyst.png'),
  'assets/charakters/char-demo-curator.png': require('../assets/charakters/char-demo-curator.png'),
  'assets/charakters/char-demo-maker.png': require('../assets/charakters/char-demo-maker.png'),
  'assets/charakters/char-demo-oracle.png': require('../assets/charakters/char-demo-oracle.png'),
  'char-guide': require('../assets/charakters/char-guide.png'),
  'char-librarian': require('../assets/charakters/char-librarian.png'),
  'char-reflection': require('../assets/charakters/char-reflection.png'),
  'char-demo-analyst': require('../assets/charakters/char-demo-analyst.png'),
  'char-demo-curator': require('../assets/charakters/char-demo-curator.png'),
  'char-demo-maker': require('../assets/charakters/char-demo-maker.png'),
  'char-demo-oracle': require('../assets/charakters/char-demo-oracle.png'),

  // Splash screen assets
  'assets/splash-screens/splash-chapter1.png': require('../assets/splash-screens/splash-chapter1.png'),
  'assets/splash-screens/splash-title.png': require('../assets/splash-screens/splash-title.png'),
  'assets/splash-screens/splash-victory.png': require('../assets/splash-screens/splash-victory.png'),
  'splash-chapter1': require('../assets/splash-screens/splash-chapter1.png'),
  'splash-title': require('../assets/splash-screens/splash-title.png'),
  'splash-victory': require('../assets/splash-screens/splash-victory.png'),

  // Audio assets
  'assets/sounds-sample/music-eerie.mp3': require('../assets/sounds-sample/music-eerie.mp3'),
  'assets/sounds-sample/music-magical.mp3': require('../assets/sounds-sample/music-magical.mp3'),
  'assets/sounds-sample/music-mysterious-adventure.mp3': require('../assets/sounds-sample/music-mysterious-adventure.mp3'),
  'assets/sounds-sample/music-peaceful.mp3': require('../assets/sounds-sample/music-peaceful.mp3'),
  'assets/sounds-sample/music-triumphant.mp3': require('../assets/sounds-sample/music-triumphant.mp3'),
  'assets/sounds-sample/sfx-door-open.mp3': require('../assets/sounds-sample/sfx-door-open.mp3'),
  'assets/sounds-sample/sfx-item-get-special.mp3': require('../assets/sounds-sample/sfx-item-get-special.mp3'),
  'assets/sounds-sample/sfx-item-get.mp3': require('../assets/sounds-sample/sfx-item-get.mp3'),
  'assets/sounds-sample/sfx-stairs.mp3': require('../assets/sounds-sample/sfx-stairs.mp3'),
  'assets/sounds-sample/voice-guide-welcome.mp3': require('../assets/sounds-sample/voice-guide-welcome.mp3'),
};
