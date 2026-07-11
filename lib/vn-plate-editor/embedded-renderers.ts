import type { Character } from '@/lib/character-types';
import { branchColorForOptionIndex, branchShadowColor } from '@/lib/document-editor/branch-colors';
import type { DocumentBlock, DocumentInlinePart, DocumentScene } from '@/lib/document-editor/types';
import type { BackgroundBlockData, CharacterBlockData, GotoBlockData, InteractiveObjectBlockData, LabelBlockData, StopEffectBlockData } from '@/lib/engine/types';
import { normalizeTransitionData } from '@/lib/engine/transition-utils';
import type { VNPlateAudioAsset, VNPlateBackgroundAsset, VNPlateSceneRef } from './types';
import { escapeHtml } from './embedded-utils';
import { parseRichText, richTextAlignment } from '@/lib/rich-text';

function richTextToHtml(text: string): string {
  return parseRichText(text).map((span) => {
    let value = escapeHtml(span.text);
    if (span.bold) value = `<strong>${value}</strong>`;
    if (span.italic) value = `<em>${value}</em>`;
    if (span.underline) value = `<u>${value}</u>`;
    if (span.strikethrough) value = `<s>${value}</s>`;
    if (span.color) value = `<span style="color:${escapeHtml(span.color)}">${value}</span>`;
    return value;
  }).join('');
}

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
    return `${formatTransition(data.transition)} · ${formatSeconds(data.duration)}`;
  }
  return block.summary || block.label || block.blockType;
}

function effectLabel(effectType: string): string {
  const labels: Record<string, string> = {
    shake: 'Тряска',
    flash: 'Спалах',
    blur: 'Розмиття',
    rain: 'Дощ',
    snow: 'Сніг',
    fog: 'Туман',
    glitch: 'Гліч',
    vignette: 'Віньєтка',
  };
  return labels[effectType] || 'Ефект';
}

function effectIcon(effectType: string): string {
  const icons: Record<string, string> = {
    shake: '📳',
    flash: '⚡',
    blur: '🌀',
    rain: '🌧',
    snow: '❄️',
    fog: '🌫',
    glitch: '👾',
    vignette: '⭕',
  };
  return icons[effectType] || '✦';
}

function effectDetails(part: Extract<DocumentInlinePart, { type: 'effect' }>): string {
  const details: string[] = [];
  if (part.effectType === 'rain') {
    const variant = part.rain?.variant || (part.rain?.lightning ? 'storm' : 'rain');
    const variantLabels: Record<string, string> = { drizzle: 'мряка', storm: 'гроза', fallout: 'fallout' };
    if (variantLabels[variant]) details.push(variantLabels[variant]);
  }
  if (part.effectType === 'fog' && part.fog?.variant) {
    details.push(part.fog.variant === 'dense' ? 'щільний' : 'легкий');
  }
  if (part.durationMode === 'scene') {
    details.push('до кінця сцени');
  } else if (Number.isFinite(part.duration) && part.duration > 0) {
    details.push(`${Math.round(part.duration * 10) / 10}с`);
  }
  return details.join(' · ');
}

function audioAssetLabel(asset: VNPlateAudioAsset): string {
  return asset.name ? asset.name.replace(/\.[^.]+$/, '') : '';
}

function findAudioAsset(
  assets: VNPlateAudioAsset[],
  value: string | null | undefined,
): VNPlateAudioAsset | null {
  const normalized = (value || '').trim();
  if (!normalized) return null;
  return assets.find((asset) =>
    asset.id === normalized
    || asset.uri === normalized
    || asset.name === normalized
    || audioAssetLabel(asset) === normalized
  ) ?? null;
}

function audioInlineLabel(part: Extract<DocumentInlinePart, { type: 'music' | 'sound' }>, audioAssets: VNPlateAudioAsset[]): string {
  if (part.mode === 'silence') return 'Тиша';
  const asset = findAudioAsset(audioAssets, part.assetId);
  if (asset) return audioAssetLabel(asset) || asset.name || asset.id;
  return part.assetId ? part.assetId.replace(/^asset_/, '') : 'Оберіть трек';
}

function audioDetails(part: Extract<DocumentInlinePart, { type: 'music' | 'sound' }>): string {
  const details = [
    part.mode === 'silence' ? 'тиша' : 'трек',
    `${Math.round(part.volume * 100)}%`,
  ];
  if (part.loop) details.push('повтор');
  if (part.fadeIn > 0) {
    details.push(`вхід ${Number(part.fadeIn.toFixed(2))}с`);
  }
  if (part.fadeOut > 0) {
    details.push(`вихід ${Number(part.fadeOut.toFixed(2))}с`);
  }
  if (part.type === 'music') {
    details.push(part.boundTo === 'scene' ? 'сцена' : 'наскрізно');
    if (part.autoFadeAfter != null && part.autoFadeAfter > 0) {
      details.push(`авто ${Number(part.autoFadeAfter.toFixed(2))}с`);
    }
  }
  if (part.type === 'sound' && part.pitchVariation > 0) {
    details.push(`тон ${Math.round(part.pitchVariation * 100)}%`);
  }
  return details.join(' · ');
}

function audioPartToHtml(part: Extract<DocumentInlinePart, { type: 'music' | 'sound' }>, audioAssets: VNPlateAudioAsset[]): string {
  const kindClass = part.type === 'music' ? 'audio-chip--music' : 'audio-chip--sound';
  const icon = part.type === 'music' ? '♪' : 'SFX';
  const assetId = part.assetId || '';
  const boundTo = part.boundTo ? ` data-bound-to="${escapeHtml(part.boundTo)}"` : '';
  const autoFadeAfter = part.type === 'music' && part.autoFadeAfter != null
    ? ` data-auto-fade-after="${escapeHtml(String(part.autoFadeAfter))}"`
    : '';
  const pitchVariation = part.type === 'sound'
    ? ` data-pitch-variation="${escapeHtml(String(part.pitchVariation))}"`
    : '';
  return [
    `<span class="audio-chip ${kindClass}" contenteditable="false" draggable="true" tabindex="0" role="button" data-kind="${escapeHtml(part.type)}" data-id="${escapeHtml(part.id)}" data-mode="${escapeHtml(part.mode)}" data-asset-id="${escapeHtml(assetId)}" data-volume="${escapeHtml(String(part.volume))}" data-loop="${part.loop ? 'true' : 'false'}" data-fade-in="${escapeHtml(String(part.fadeIn))}" data-fade-out="${escapeHtml(String(part.fadeOut))}"${boundTo}${autoFadeAfter}${pitchVariation}>`,
    `<span class="audio-chip-icon">${escapeHtml(icon)}</span>`,
    `<span class="audio-chip-title">${escapeHtml(audioInlineLabel(part, audioAssets))}</span>`,
    `<span class="audio-chip-details">${escapeHtml(audioDetails(part))}</span>`,
    `<span class="audio-chip-menu">⋮</span>`,
    '</span>',
  ].join('');
}

function inlinePartToHtml(part: DocumentInlinePart, audioAssets: VNPlateAudioAsset[] = []): string {
  if (part.type === 'text') return richTextToHtml(part.text);
  if (part.type === 'music' || part.type === 'sound') return audioPartToHtml(part, audioAssets);
  const characterId = part.characterId ? ` data-character-id="${escapeHtml(part.characterId)}"` : '';
  const fadeIn = part.fadeIn != null ? ` data-fade-in="${escapeHtml(String(part.fadeIn))}"` : '';
  const fadeOut = part.fadeOut != null ? ` data-fade-out="${escapeHtml(String(part.fadeOut))}"` : '';
  const durationMode = part.durationMode ? ` data-duration-mode="${escapeHtml(part.durationMode)}"` : '';
  const rain = part.rain ? ` data-rain-options="${escapeHtml(JSON.stringify(part.rain))}"` : '';
  const snow = part.snow ? ` data-snow-options="${escapeHtml(JSON.stringify(part.snow))}"` : '';
  const fog = part.fog ? ` data-fog-options="${escapeHtml(JSON.stringify(part.fog))}"` : '';
  const details = effectDetails(part);
  return [
    `<span class="effect-chip" contenteditable="false" draggable="true" tabindex="0" role="button" data-kind="effect" data-id="${escapeHtml(part.id)}" data-effect-type="${escapeHtml(part.effectType)}" data-target="${escapeHtml(part.target)}"${characterId} data-intensity="${escapeHtml(String(part.intensity))}" data-duration="${escapeHtml(String(part.duration))}"${durationMode}${fadeIn}${fadeOut}${rain}${snow}${fog}>`,
    `<span class="effect-chip-icon">${effectIcon(part.effectType)}</span>`,
    `<span>${escapeHtml(effectLabel(part.effectType))}</span>`,
    details ? `<span class="effect-chip-details">${escapeHtml(details)}</span>` : '',
    `<span class="effect-chip-menu">⋮</span>`,
    '</span>',
  ].join('');
}

function inlinePartsToHtml(
  parts: DocumentInlinePart[] | undefined,
  fallbackText: string,
  audioAssets: VNPlateAudioAsset[] = [],
): string {
  if (parts?.length) {
    const html = parts.map((part) => inlinePartToHtml(part, audioAssets)).join('');
    return html || '<br>';
  }
  return richTextToHtml(fallbackText || '') || '<br>';
}

function blockAlignmentStyle(parts: DocumentInlinePart[] | undefined, fallbackText: string): string {
  const firstText = parts?.find((part): part is Extract<DocumentInlinePart, { type: 'text' }> => part.type === 'text')?.text;
  const alignment = richTextAlignment(firstText ?? fallbackText);
  return alignment === 'left' ? '' : ` style="text-align:${alignment}"`;
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
  return [
    `<div class="void-block background-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="background" data-asset-id="${escapeHtml(assetId)}" data-transition="${escapeHtml(transition)}" data-duration-ms="${escapeHtml(String(duration))}" data-delay="${escapeHtml(String(delay))}">`,
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

const TRANSITION_TYPE_LABELS: Record<string, string> = {
  fade: 'Fade',
  slide: 'Slide',
  instant: 'Instant',
};

function transitionBlockToHtml(
  block: Extract<DocumentBlock, { kind: 'technical' }>,
  scenes: VNPlateSceneRef[],
): string {
  const data = normalizeTransitionData(block.step?.data);
  const targetScene = data.targetSceneId
    ? scenes.find((scene) => scene.id === data.targetSceneId) ?? null
    : null;
  const targetLabel = data.mode === 'end'
    ? 'Кінець історії'
    : data.mode === 'scene'
      ? (targetScene?.name || data.targetSceneId || 'Сцену не вибрано')
      : 'Наступна сцена';
  const dangling = data.mode === 'scene' && (!data.targetSceneId || (scenes.length > 0 && !targetScene));
  const summary = `${TRANSITION_TYPE_LABELS[data.transitionType] || data.transitionType} · ${Number(data.duration.toFixed(2))}s`
    + (dangling ? ' · ⚠ сцена не знайдена' : '');

  return [
    `<div class="void-block transition-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="transition" data-mode="${escapeHtml(data.mode)}" data-target-scene-id="${escapeHtml(data.targetSceneId || '')}" data-transition-type="${escapeHtml(data.transitionType)}" data-duration="${escapeHtml(String(data.duration))}">`,
    '<div class="background-copy">',
    '<div class="background-command-line">',
    '<span class="void-title">/transition</span>',
    `<span class="background-asset">${escapeHtml(targetLabel)}</span>`,
    '</div>',
    `<div class="void-summary">${escapeHtml(summary)}</div>`,
    '</div>',
    '<div class="block-actions">',
    '<button type="button" class="block-button" data-action="edit-transition">Edit</button>',
    '</div>',
    '</div>',
  ].join('');
}

function labelBlockToHtml(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  const data = (block.step?.data ?? {}) as Partial<LabelBlockData>;
  const name = data.name || '';
  return [
    `<div class="void-block label-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="label" data-label-name="${escapeHtml(name)}">`,
    '<div class="background-copy">',
    '<div class="background-command-line">',
    '<span class="void-title">/label</span>',
    `<span class="background-asset">${escapeHtml(name || 'Без назви')}</span>`,
    '</div>',
    '<div class="void-summary">Точка переходу всередині сцени</div>',
    '</div>',
    '<div class="block-actions">',
    '<button type="button" class="block-button" data-action="edit-label">Edit</button>',
    '</div>',
    '</div>',
  ].join('');
}

function gotoBlockToHtml(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  const data = (block.step?.data ?? {}) as Partial<GotoBlockData>;
  const targetLabel = data.targetLabel || '';
  const elseTargetLabel = data.elseTargetLabel || '';
  const condition = data.condition ?? null;
  const conditionAttr = condition ? ` data-condition="${escapeHtml(JSON.stringify(condition))}"` : '';
  const conditionSummary = condition
    ? `якщо ${condition.variableName} ${condition.operator} ${String(condition.value)}`
    : 'завжди';
  const summary = conditionSummary + (elseTargetLabel ? ` · інакше → ${elseTargetLabel}` : '');
  return [
    `<div class="void-block goto-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="goto" data-target-label="${escapeHtml(targetLabel)}" data-else-target-label="${escapeHtml(elseTargetLabel)}"${conditionAttr}>`,
    '<div class="background-copy">',
    '<div class="background-command-line">',
    '<span class="void-title">/goto</span>',
    `<span class="background-asset">${escapeHtml(targetLabel ? `→ ${targetLabel}` : 'Мітку не вибрано')}</span>`,
    '</div>',
    `<div class="void-summary">${escapeHtml(summary)}</div>`,
    '</div>',
    '<div class="block-actions">',
    '<button type="button" class="block-button" data-action="edit-goto">Edit</button>',
    '</div>',
    '</div>',
  ].join('');
}

function stopEffectBlockToHtml(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  const data = (block.step?.data ?? {}) as Partial<StopEffectBlockData>;
  const effectType = data.effectType || 'all';
  const target = data.target || 'all';
  const typeSummary = effectType === 'all' ? 'Усі ефекти' : effectLabel(effectType);
  const targetSummary = target === 'all' ? '' : ` · ${target}`;
  return [
    `<div class="void-block stop-effect-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="stopEffect" data-effect-type="${escapeHtml(effectType)}" data-target="${escapeHtml(target)}">`,
    '<span class="void-title">/stop-effect</span>',
    `<span class="background-asset">${escapeHtml(typeSummary + targetSummary)}</span>`,
    '</div>',
  ].join('');
}

function interactiveObjectBlockToHtml(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  const data = block.step.data as InteractiveObjectBlockData;
  const position = data.position || { x: 50, y: 50, width: 10, height: 10 };
  const actionCount = Array.isArray(data.actions) ? data.actions.length : 0;
  const flags = [data.oneTimeOnly ? 'once' : '', data.pulseAnimation ? 'pulse' : ''].filter(Boolean).join(' · ');
  return [
    `<div class="void-block interactive-object-block" contenteditable="false" tabindex="0" role="button" aria-label="Edit interactive object ${escapeHtml(data.name || 'New Object')}" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="interactive_object" data-object="${escapeHtml(JSON.stringify(data))}">`,
    '<span class="interactive-object-icon" aria-hidden="true">◎</span>',
    '<span class="interactive-object-copy">',
    `<span class="interactive-object-name">${escapeHtml(data.name || 'New Object')}</span>`,
    `<span class="interactive-object-meta">${escapeHtml(`${position.x}%, ${position.y}% · ${position.width}×${position.height}% · ${actionCount} actions${flags ? ` · ${flags}` : ''}`)}</span>`,
    '</span>',
    '</div>',
  ].join('');
}

export function blockToHtml(
  block: DocumentBlock,
  backgroundAssets: VNPlateBackgroundAsset[] = [],
  audioAssets: VNPlateAudioAsset[] = [],
  scenes: VNPlateSceneRef[] = [],
): string {
  if (block.kind === 'text') {
    return `<p data-kind="text" data-id="${escapeHtml(block.id)}"${blockAlignmentStyle(block.parts, block.content)}>${inlinePartsToHtml(block.parts, block.content, audioAssets)}</p>`;
  }

  if (block.kind === 'dialogue') {
    const characterId = block.characterId || '';
    const color = block.tokenColor || '#ff4d6d';
    const openControls = block.openCharacterControls ? ' data-open-character-controls="true"' : '';
    return [
      `<p data-kind="dialogue" data-id="${escapeHtml(block.id)}" data-speaker="${escapeHtml(block.speakerName)}" data-character-id="${escapeHtml(characterId)}" data-sprite-id="${escapeHtml(block.spriteId || '')}"${openControls}${blockAlignmentStyle(block.parts, block.text)}>`,
      `<span class="speaker-token dialogue-badge" contenteditable="false" tabindex="0" role="button" aria-label="Edit character ${escapeHtml(block.speakerName || 'Character')}" data-character-id="${escapeHtml(characterId)}" data-block-id="${escapeHtml(block.id)}" style="--speaker-color:${escapeHtml(color)}">${escapeHtml(block.speakerName || 'Character')}:</span> `,
      inlinePartsToHtml(block.parts, block.text, audioAssets),
      '</p>',
    ].join('');
  }

  if (block.kind === 'choice') {
    const question = block.question || 'Choice';
    const options = block.options && block.options.length
      ? block.options
      : [
          { id: 'choice_a', text: 'Варіант 1', targetSceneId: null },
          { id: 'choice_b', text: 'Варіант 2', targetSceneId: null },
        ];
    const data = { question, options };
    const trimmedQuestion = question.trim();
    const questionHtml = trimmedQuestion && trimmedQuestion !== 'Choice'
      ? `<div class="void-summary choice-question-summary">${escapeHtml(trimmedQuestion)}</div>`
      : '';
    const cards = options.map((option, optionIndex) => {
      const color = branchColorForOptionIndex(optionIndex);
      const cardStyle = `--branch-color: ${color}; --branch-shadow: ${branchShadowColor(color, 0.22)}; --branch-shadow-strong: ${branchShadowColor(color, 0.32)};`;
      return '<div class="choice-option-card-wrap">'
        + `<button type="button" class="choice-option-card" style="${cardStyle}" data-action="select-branch-option" data-option-id="${escapeHtml(option.id)}">`
        + `<span class="choice-option-dot" style="background: ${color};"></span>`
        + `<span class="choice-option-card-text">${escapeHtml(option.text || 'Варіант')}</span>`
        + '</button>'
        + '</div>';
    }).join('');
    return [
      `<div class="void-block choice-block" contenteditable="false" data-kind="choice" data-id="${escapeHtml(block.id)}" data-choice="${escapeHtml(JSON.stringify(data))}">`,
      '<div class="choice-block-header">',
      '<span class="void-title">/choice</span>',
      '</div>',
      questionHtml,
      `<div class="choice-options-grid">${cards}</div>`,
      '<div class="block-actions choice-block-actions">',
      '<button type="button" class="block-button" data-action="edit-choice">Edit</button>',
      '</div>',
      '</div>',
    ].join('');
  }

  if (block.blockType === 'background') {
    return backgroundBlockToHtml(block, backgroundAssets);
  }

  if (block.blockType === 'transition') {
    return transitionBlockToHtml(block, scenes);
  }

  if (block.blockType === 'label') {
    return labelBlockToHtml(block);
  }

  if (block.blockType === 'goto') {
    return gotoBlockToHtml(block);
  }

  if (block.blockType === 'stop_effect') {
    return stopEffectBlockToHtml(block);
  }

  if (block.blockType === 'interactive_object') {
    return interactiveObjectBlockToHtml(block);
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
  audioAssets: VNPlateAudioAsset[] = [],
  characters: Character[] = [],
  scenes: VNPlateSceneRef[] = [],
): string {
  const blocks = scene.blocks.length
    ? scene.blocks
    : [{ id: 'empty', kind: 'text' as const, content: '' }];
  const colorById = new Map(characters.map((character) => [character.id, character.color]));
  return blocks.map((block) => {
    if (block.kind === 'dialogue' && block.characterId && !block.tokenColor) {
      return blockToHtml({ ...block, tokenColor: colorById.get(block.characterId) }, backgroundAssets, audioAssets, scenes);
    }
    return blockToHtml(block, backgroundAssets, audioAssets, scenes);
  }).join('');
}
