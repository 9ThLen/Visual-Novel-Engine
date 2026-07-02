import type { Character } from '@/lib/character-types';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import type { BackgroundBlockData, CharacterBlockData } from '@/lib/engine/types';
import type { VNPlateBackgroundAsset } from './types';
import { escapeHtml } from './embedded-utils';

function formatTransition(value?: string): string {
  if (!value) return 'Fade';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSeconds(durationMs?: number): string {
  const seconds = Number.isFinite(durationMs) ? Number(durationMs) / 1000 : 0.5;
  return `${Number(seconds.toFixed(2))}s`;
}

function technicalSummary(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  if (block.blockType === 'background') {
    const data = block.step.data as BackgroundBlockData;
    return `${formatTransition(data.transition)} · ${formatSeconds(data.duration)} · ${data.fit || 'cover'}`;
  }
  return block.summary || block.label || block.blockType;
}

function effectLabel(effectType: string): string {
  const labels: Record<string, string> = {
    shake: 'Shake',
    flash: 'Flash',
    blur: 'Blur',
    rain: 'Дощ',
    snow: 'Snow',
    glitch: 'Glitch',
    vignette: 'Vignette',
  };
  return labels[effectType] || 'Ефект';
}

function inlinePartToHtml(part: DocumentInlinePart): string {
  if (part.type === 'text') return escapeHtml(part.text);
  const characterId = part.characterId ? ` data-character-id="${escapeHtml(part.characterId)}"` : '';
  const fadeIn = part.fadeIn != null ? ` data-fade-in="${escapeHtml(String(part.fadeIn))}"` : '';
  const fadeOut = part.fadeOut != null ? ` data-fade-out="${escapeHtml(String(part.fadeOut))}"` : '';
  const rain = part.rain ? ` data-rain-options="${escapeHtml(JSON.stringify(part.rain))}"` : '';
  const snow = part.snow ? ` data-snow-options="${escapeHtml(JSON.stringify(part.snow))}"` : '';
  return [
    `<span class="effect-chip" contenteditable="false" draggable="true" tabindex="0" role="button" data-kind="effect" data-id="${escapeHtml(part.id)}" data-effect-type="${escapeHtml(part.effectType)}" data-target="${escapeHtml(part.target)}"${characterId} data-intensity="${escapeHtml(String(part.intensity))}" data-duration="${escapeHtml(String(part.duration))}"${fadeIn}${fadeOut}${rain}${snow}>`,
    `<span class="effect-chip-icon">✦</span>`,
    `<span>${escapeHtml(effectLabel(part.effectType))}</span>`,
    `<span class="effect-chip-menu">⋮</span>`,
    '</span>',
  ].join('');
}

function inlinePartsToHtml(parts: DocumentInlinePart[] | undefined, fallbackText: string): string {
  if (parts?.length) {
    const html = parts.map(inlinePartToHtml).join('');
    return html || '<br>';
  }
  return escapeHtml(fallbackText || '') || '<br>';
}

function assetLabel(asset: VNPlateBackgroundAsset): string {
  return asset.name ? asset.name.replace(/\.[^.]+$/, '') : '';
}

function findBackgroundAsset(
  assets: VNPlateBackgroundAsset[],
  value: string | null | undefined,
): VNPlateBackgroundAsset | null {
  const normalized = (value || '').trim();
  if (!normalized) return null;
  return assets.find((asset) =>
    asset.id === normalized
    || asset.uri === normalized
    || asset.name === normalized
    || assetLabel(asset) === normalized
  ) ?? null;
}

function backgroundBlockToHtml(
  block: Extract<DocumentBlock, { kind: 'technical' }>,
  backgroundAssets: VNPlateBackgroundAsset[],
): string {
  const data = block.step.data as BackgroundBlockData;
  const assetId = data.assetId || '';
  const asset = findBackgroundAsset(backgroundAssets, assetId);
  const assetName = asset ? assetLabel(asset) || asset.name || asset.id : assetId ? assetId.replace(/^asset_/, '') : 'No background selected';
  const transition = data.transition || 'fade';
  const duration = Number.isFinite(data.duration) ? data.duration : 500;
  const delay = Number.isFinite(data.delay) ? data.delay : 0;
  const fit = data.fit || 'cover';
  const position = data.position || 'center';

  return [
    `<div class="void-block background-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="background" data-asset-id="${escapeHtml(assetId)}" data-transition="${escapeHtml(transition)}" data-duration-ms="${escapeHtml(String(duration))}" data-delay="${escapeHtml(String(delay))}" data-fit="${escapeHtml(fit)}" data-position="${escapeHtml(position)}">`,
    '<div class="background-copy">',
    '<div class="background-command-line">',
    '<span class="void-title">/background</span>',
    `<span class="background-asset">${escapeHtml(assetName)}</span>`,
    '</div>',
    `<div class="void-summary">${escapeHtml(technicalSummary(block))}</div>`,
    '</div>',
    '<div class="block-actions">',
    '<button type="button" class="block-button" data-action="pick-background">Pick</button>',
    '<button type="button" class="block-button" data-action="edit-background">Edit</button>',
    '</div>',
    '</div>',
  ].join('');
}

export function blockToHtml(block: DocumentBlock, backgroundAssets: VNPlateBackgroundAsset[] = []): string {
  if (block.kind === 'text') {
    return `<p data-kind="text" data-id="${escapeHtml(block.id)}">${inlinePartsToHtml(block.parts, block.content)}</p>`;
  }

  if (block.kind === 'dialogue') {
    const characterId = block.characterId || '';
    const color = block.tokenColor || '#ff4d6d';
    const openControls = block.openCharacterControls ? ' data-open-character-controls="true"' : '';
    return [
      `<p data-kind="dialogue" data-id="${escapeHtml(block.id)}" data-speaker="${escapeHtml(block.speakerName)}" data-character-id="${escapeHtml(characterId)}" data-sprite-id="${escapeHtml(block.spriteId || '')}"${openControls}>`,
      `<span class="speaker-token dialogue-badge" contenteditable="false" tabindex="0" role="button" aria-label="Edit character ${escapeHtml(block.speakerName || 'Character')}" data-character-id="${escapeHtml(characterId)}" data-block-id="${escapeHtml(block.id)}" style="--speaker-color:${escapeHtml(color)}">${escapeHtml(block.speakerName || 'Character')}:</span> `,
      inlinePartsToHtml(block.parts, block.text),
      '</p>',
    ].join('');
  }

  if (block.kind === 'choice') {
    return [
      `<div class="void-block choice-block" contenteditable="false" data-kind="choice" data-id="${escapeHtml(block.id)}">`,
      '<div class="void-title">/choice</div>',
      `<div class="void-summary">${escapeHtml(block.question || 'Choice')}</div>`,
      '</div>',
    ].join('');
  }

  if (block.blockType === 'background') {
    return backgroundBlockToHtml(block, backgroundAssets);
  }

  if (block.blockType === 'character') {
    const data = block.step.data as Partial<CharacterBlockData>;
    const characterId = data.characterId || '';
    const speakerName = block.label || characterId || 'Character';
    return [
      `<p data-kind="dialogue" data-id="${escapeHtml(block.id)}" data-speaker="${escapeHtml(speakerName)}" data-character-id="${escapeHtml(characterId)}" data-sprite-id="${escapeHtml(data.spriteId || '')}" data-open-character-controls="true">`,
      `<span class="speaker-token dialogue-badge" contenteditable="false" tabindex="0" role="button" aria-label="Edit character ${escapeHtml(speakerName)}" data-character-id="${escapeHtml(characterId)}" data-block-id="${escapeHtml(block.id)}" style="--speaker-color:#ff4d6d">${escapeHtml(speakerName)}:</span> `,
      '<br>',
      '</p>',
    ].join('');
  }

  return [
    `<div class="void-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="${escapeHtml(block.commandId)}">`,
    `<div class="void-title">/${escapeHtml(block.commandId)}</div>`,
    `<div class="void-summary">${escapeHtml(technicalSummary(block))}</div>`,
    '</div>',
  ].join('');
}

export function sceneToEditorHtml(
  scene: DocumentScene,
  backgroundAssets: VNPlateBackgroundAsset[] = [],
  characters: Character[] = [],
): string {
  const blocks = scene.blocks.length
    ? scene.blocks
    : [{ id: 'empty', kind: 'text' as const, content: '' }];
  const colorById = new Map(characters.map((character) => [character.id, character.color]));
  return blocks.map((block) => {
    if (block.kind === 'dialogue' && block.characterId && !block.tokenColor) {
      return blockToHtml({ ...block, tokenColor: colorById.get(block.characterId) }, backgroundAssets);
    }
    return blockToHtml(block, backgroundAssets);
  }).join('');
}
