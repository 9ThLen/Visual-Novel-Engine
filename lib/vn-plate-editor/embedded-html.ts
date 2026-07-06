import { getEmbeddedCommands } from './embedded-commands';
import { sceneToEditorHtml } from './embedded-renderers';
import { createEmbeddedScript } from './embedded-script';
import { createEmbeddedStyles } from './embedded-styles';
import type { VNPlateEditorPayload } from './types';
import { escapeHtml } from './embedded-utils';

export function createVNPlateEditorHtml(payload: VNPlateEditorPayload): string {
  const commands = getEmbeddedCommands(payload.language);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>${createEmbeddedStyles()}</style>
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
  <script>${createEmbeddedScript(payload, commands)}</script>
</body>
</html>`;
}
