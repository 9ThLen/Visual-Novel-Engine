import type { DocumentBlock, DocumentScene } from '@/lib/document-editor/types';
import { escapeHtml } from './embedded-utils';

function technicalSummary(block: Extract<DocumentBlock, { kind: 'technical' }>): string {
  if (block.blockType === 'background') {
    const data = block.step.data as { assetId?: string; transition?: string; duration?: number };
    const name = data.assetId ? data.assetId.replace(/^asset_/, '') : 'No background selected';
    return `${name}${data.transition ? ` Â· ${data.transition}` : ''}${data.duration ? ` Â· ${data.duration}ms` : ''}`;
  }
  return block.summary || block.label || block.blockType;
}

export function blockToHtml(block: DocumentBlock): string {
  if (block.kind === 'text') {
    const content = escapeHtml(block.content || '');
    return `<p data-kind="text" data-id="${escapeHtml(block.id)}">${content || '<br>'}</p>`;
  }

  if (block.kind === 'dialogue') {
    return [
      `<p data-kind="dialogue" data-id="${escapeHtml(block.id)}" data-speaker="${escapeHtml(block.speakerName)}">`,
      `<span class="dialogue-badge" contenteditable="false">${escapeHtml(block.speakerName || 'Character')}:</span> `,
      `${escapeHtml(block.text || '') || '<br>'}`,
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

  return [
    `<div class="void-block" contenteditable="false" data-kind="technical" data-id="${escapeHtml(block.id)}" data-command="${escapeHtml(block.commandId)}">`,
    `<div class="void-title">/${escapeHtml(block.commandId)}</div>`,
    `<div class="void-summary">${escapeHtml(technicalSummary(block))}</div>`,
    '</div>',
  ].join('');
}

export function sceneToEditorHtml(scene: DocumentScene): string {
  const blocks = scene.blocks.length
    ? scene.blocks
    : [{ id: 'empty', kind: 'text' as const, content: '' }];
  return blocks.map(blockToHtml).join('');
}
