import { getEmbeddedCommands } from './embedded-commands';
import { sceneToEditorHtml } from './embedded-renderers';
import { createEmbeddedScript } from './embedded-script';
import { createEmbeddedStyles } from './embedded-styles';
import type { VNPlateEditorPayload } from './types';
import { escapeHtml, jsonForScript } from './embedded-utils';

/**
 * URLs of the editor script/styles shared by every scene iframe (built once,
 * see shared-assets.ts). When provided, the per-scene srcDoc shrinks from
 * ~250KB of inline code to just the scene payload — the browser fetches and
 * compiles the shared assets a single time for all iframes.
 */
export interface SharedEditorAssets {
  scriptUrl: string;
  styleUrl: string;
}

export function createVNPlateEditorHtml(payload: VNPlateEditorPayload, shared?: SharedEditorAssets): string {
  const commands = getEmbeddedCommands(payload.language);
  const styles = shared
    ? `<link rel="stylesheet" href="${shared.styleUrl}" />`
    : `<style>${createEmbeddedStyles()}</style>`;
  const scripts = shared
    ? `<script src="${shared.scriptUrl}"></script>
  <script>window.__VN_PLATE_BOOT(${jsonForScript(payload)}, ${jsonForScript(commands)});</script>`
    : `<script>${createEmbeddedScript(payload, commands)}</script>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  ${styles}
</head>
<body>
  <div class="shell">
    <main class="paper">
      <p class="eyebrow">Scene</p>
      <input id="title" class="title" value="${escapeHtml(payload.scene.sceneName)}" />
      <div id="editor" contenteditable="true" spellcheck="true">${sceneToEditorHtml(payload.scene, payload.backgroundAssets || [], payload.audioAssets || [], payload.characters, payload.scenes || [])}</div>
    </main>
  </div>
  <div id="slashMenu" class="slash-menu hidden"></div>
  ${scripts}
</body>
</html>`;
}
