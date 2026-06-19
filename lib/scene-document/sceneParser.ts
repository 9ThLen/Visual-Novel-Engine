import { getCharacterColor } from './characterColor';
import type { ChoiceNode, MusicNode, SceneNode, SoundNode } from './sceneTypes';

function nodeId(lineNumber: number, type: SceneNode['type']): string {
  return `scene_${type}_${lineNumber}`;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseAudio(parts: string[], lineNumber: number): MusicNode | SoundNode | null {
  const [action, channel, assetId, ...tokens] = parts;
  if (action !== 'play' && action !== 'stop' && action !== 'fade') return null;
  if (channel !== 'music' && channel !== 'sfx' && channel !== 'sound') return null;

  const options = new Map(
    tokens
      .map((token) => token.split('='))
      .filter((entry): entry is [string, string] => entry.length === 2),
  );
  const volume = options.has('volume') ? Number(options.get('volume')) : undefined;

  if (channel === 'music') {
    return {
      id: nodeId(lineNumber, 'music'),
      type: 'music',
      action,
      assetId,
      volume: Number.isFinite(volume) ? volume : undefined,
      loop: tokens.includes('loop') || parseBoolean(options.get('loop')),
    };
  }

  return {
    id: nodeId(lineNumber, 'sound'),
    type: 'sound',
    action: action === 'stop' ? 'stop' : 'play',
    assetId,
    volume: Number.isFinite(volume) ? volume : undefined,
    loop: tokens.includes('loop') || parseBoolean(options.get('loop')),
  };
}

function parseChoice(raw: string, lineNumber: number): ChoiceNode {
  const body = raw.replace(/^\[choice\s*/i, '').replace(/\]$/, '').trim();
  const parts = body.split('|').map((part) => part.trim()).filter(Boolean);
  const prompt = parts[0];
  const optionParts = parts.slice(1);
  const options = optionParts.map((option, index) => {
    const [label, targetSceneId] = option.split('->').map((part) => part.trim());
    return {
      id: `choice_${lineNumber}_${index + 1}`,
      label: label || `Option ${index + 1}`,
      targetSceneId: targetSceneId || undefined,
    };
  });

  return {
    id: nodeId(lineNumber, 'choice'),
    type: 'choice',
    prompt,
    options,
  };
}

function parseSceneLine(line: string, lineNumber: number): SceneNode | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const bracketMatch = /^\[(.+)\]$/.exec(trimmed);
  if (bracketMatch) {
    const parts = bracketMatch[1].split(/\s+/).filter(Boolean);
    const [command] = parts;

    if (command === 'background') {
      return {
        id: nodeId(lineNumber, 'background'),
        type: 'background',
        assetId: parts[1] ?? '',
      };
    }

    const audio = parseAudio(parts, lineNumber);
    if (audio) return audio;

    if (command === 'choice') return parseChoice(trimmed, lineNumber);

    return {
      id: nodeId(lineNumber, 'command'),
      type: 'command',
      raw: trimmed,
    };
  }

  const dialogueMatch = /^([^:\n]{1,40}):\s*(.*)$/.exec(trimmed);
  if (dialogueMatch) {
    const characterName = dialogueMatch[1].trim();
    return {
      id: nodeId(lineNumber, 'dialogue'),
      type: 'dialogue',
      characterName,
      text: dialogueMatch[2].trim(),
      color: getCharacterColor(characterName),
    };
  }

  return {
    id: nodeId(lineNumber, 'narration'),
    type: 'narration',
    text: line,
  };
}

export function parseSceneText(input: string): SceneNode[] {
  return input
    .split(/\r?\n/)
    .map((line, index) => parseSceneLine(line, index + 1))
    .filter((node): node is SceneNode => Boolean(node));
}
