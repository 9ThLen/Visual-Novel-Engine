import type { SceneDocument, SceneNode } from './sceneTypes';

export function serializeNode(node: SceneNode): string {
  switch (node.type) {
    case 'dialogue':
      return `${node.characterName}: ${node.text}`;
    case 'narration':
      return node.text;
    case 'background':
      return `[background ${node.assetId}]`;
    case 'character':
      return node.action === 'hide'
        ? `[hide ${node.characterId}]`
        : `[show ${node.characterId}${node.spriteId ? ` ${node.spriteId}` : ''}]`;
    case 'music': {
      const base = node.mode === 'silence'
        ? `[silence music${node.assetId ? ` ${node.assetId}` : ''}`
        : `[music ${node.assetId ?? ''}`;
      const volume = typeof node.volume === 'number' ? ` volume=${node.volume}` : '';
      const loop = node.loop ? ' loop' : '';
      const fadeIn = typeof node.fadeIn === 'number' ? ` fadeIn=${node.fadeIn}` : '';
      const fadeOut = typeof node.fadeOut === 'number' ? ` fadeOut=${node.fadeOut}` : '';
      const boundTo = node.boundTo ? ` ${node.boundTo}` : '';
      const autoFadeAfter = typeof node.autoFadeAfter === 'number' ? ` autoFadeAfter=${node.autoFadeAfter}` : '';
      return `${base}${volume}${loop}${fadeIn}${fadeOut}${boundTo}${autoFadeAfter}]`;
    }
    case 'sound': {
      const base = node.mode === 'silence'
        ? `[silence sound${node.assetId ? ` ${node.assetId}` : ''}`
        : `[sound ${node.assetId ?? ''}`;
      const volume = typeof node.volume === 'number' ? ` volume=${node.volume}` : '';
      const loop = node.loop ? ' loop' : '';
      const fadeIn = typeof node.fadeIn === 'number' ? ` fadeIn=${node.fadeIn}` : '';
      const fadeOut = typeof node.fadeOut === 'number' ? ` fadeOut=${node.fadeOut}` : '';
      const pitchVariation = typeof node.pitchVariation === 'number' ? ` pitchVariation=${node.pitchVariation}` : '';
      const boundTo = node.boundTo ? ` ${node.boundTo}` : '';
      return `${base}${volume}${loop}${fadeIn}${fadeOut}${pitchVariation}${boundTo}]`;
    }
    case 'choice': {
      const options = node.options
        .map((option) => option.targetSceneId ? `${option.label} -> ${option.targetSceneId}` : option.label)
        .join(' | ');
      return `[choice ${node.prompt ?? ''}${options ? ` | ${options}` : ''}]`;
    }
    case 'command':
      return node.raw;
    case 'transition': {
      const target = node.mode === 'end' ? 'end'
        : node.mode === 'next' || !node.targetSceneId ? 'next'
        : node.targetSceneId;
      return `[transition ${target}${node.transitionType ? ` ${node.transitionType}` : ''}]`;
    }
    case 'variable':
      return `[variable ${node.variableName}=${String(node.value)}]`;
    case 'effect':
      return `[effect ${node.effectType}${node.intensity != null ? ` ${node.intensity}` : ''}${node.durationMs != null ? ` ${node.durationMs}` : ''}]`;
    case 'camera':
      return node.action === 'pan'
        ? `[camera pan ${node.panX ?? 0} ${node.panY ?? 0}]`
        : `[camera ${node.action}${node.zoomLevel != null ? ` ${node.zoomLevel}` : ''}]`;
    case 'interactive_object':
      return `[interactive_object ${node.objectId}]`;
    default:
      return '';
  }
}

export function serializeScene(scene: SceneDocument): string {
  return scene.nodes.map(serializeNode).join('\n');
}
