import { getCharacterColor } from './characterColor';
import type { ChoiceNode, GotoNode, MusicNode, SceneNode, SoundNode, StopEffectNode } from './sceneTypes';

const GOTO_OPERATORS = new Set<NonNullable<GotoNode['condition']>['operator']>(
  ['==', '!=', '>', '<', '>=', '<=', 'contains', 'isEmpty', 'has', 'not_has'],
);

const STOP_EFFECT_TYPES = new Set<StopEffectNode['effectType']>(
  ['shake', 'flash', 'blur', 'rain', 'snow', 'fog', 'glitch', 'vignette', 'all'],
);

const STOP_EFFECT_TARGETS = new Set<NonNullable<StopEffectNode['target']>>(
  ['screen', 'character', 'background', 'all'],
);

function nodeId(lineNumber: number, type: SceneNode['type']): string {
  return `scene_${type}_${lineNumber}`;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBinding(tokens: string[], value: string | undefined): 'scene' | 'continuous' | undefined {
  if (value === 'scene' || value === 'continuous') return value;
  if (tokens.includes('scene')) return 'scene';
  if (tokens.includes('continuous')) return 'continuous';
  return undefined;
}

function parseAudio(parts: string[], lineNumber: number): MusicNode | SoundNode | null {
  const [command] = parts;
  let channel: string | undefined;
  let mode: 'track' | 'silence';
  let assetId: string | undefined;
  let tokens: string[];

  if (command === 'play' || command === 'stop' || command === 'fade') {
    channel = parts[1];
    if (channel !== 'music' && channel !== 'sfx' && channel !== 'sound') return null;
    mode = command === 'play' ? 'track' : 'silence';
    assetId = parts[2];
    tokens = parts.slice(3);
  } else if (command === 'silence') {
    channel = parts[1];
    if (channel !== 'music' && channel !== 'sfx' && channel !== 'sound') return null;
    mode = 'silence';
    assetId = parts[2];
    tokens = parts.slice(3);
  } else if (command === 'music' || command === 'sound' || command === 'sfx') {
    channel = command;
    mode = 'track';
    assetId = parts[1];
    tokens = parts.slice(2);
  } else {
    return null;
  }

  const options = new Map(
    tokens
      .map((token) => token.split('='))
      .filter((entry): entry is [string, string] => entry.length === 2),
  );
  const volume = parseNumber(options.get('volume'));
  const fadeIn = parseNumber(options.get('fadeIn'));
  const fadeOut = parseNumber(options.get('fadeOut'));
  const boundTo = parseBinding(tokens, options.get('boundTo'));

  if (channel === 'music') {
    return {
      id: nodeId(lineNumber, 'music'),
      type: 'music',
      mode,
      assetId: assetId || undefined,
      volume: Number.isFinite(volume) ? volume : undefined,
      loop: tokens.includes('loop') || parseBoolean(options.get('loop')),
      fadeIn,
      fadeOut,
      boundTo,
      autoFadeAfter: parseNumber(options.get('autoFadeAfter')),
    };
  }

  return {
    id: nodeId(lineNumber, 'sound'),
    type: 'sound',
    mode,
    assetId: assetId || undefined,
    volume: Number.isFinite(volume) ? volume : undefined,
    loop: tokens.includes('loop') || parseBoolean(options.get('loop')),
    fadeIn,
    fadeOut,
    pitchVariation: parseNumber(options.get('pitchVariation')),
    boundTo,
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

function tokenizeCommand(body: string): string[] {
  return body.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
}

function parseConditionValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Keep malformed quoted input as text so validation/import remains non-destructive.
    }
  }
  return raw;
}

function parseTextToken(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}

function parseGoto(parts: string[], lineNumber: number): GotoNode | null {
  const ifIndex = parts.indexOf('if', 2);
  const elseIndex = parts.indexOf('else', Math.max(ifIndex + 1, 2));
  const operator = ifIndex >= 0 ? parts[ifIndex + 2] : undefined;
  if (ifIndex >= 0 && (!operator || !GOTO_OPERATORS.has(operator as NonNullable<GotoNode['condition']>['operator']))) {
    return null;
  }
  const condition = ifIndex >= 0 && operator && GOTO_OPERATORS.has(operator as NonNullable<GotoNode['condition']>['operator'])
    ? {
        variableName: parts[ifIndex + 1] ?? '',
        operator: operator as NonNullable<GotoNode['condition']>['operator'],
        value: parseConditionValue(parts.slice(ifIndex + 3, elseIndex >= 0 ? elseIndex : undefined).join(' ')),
      }
    : null;

  return {
    id: nodeId(lineNumber, 'goto'),
    type: 'goto',
    targetLabel: parseTextToken(parts[1] ?? ''),
    condition,
    elseTargetLabel: elseIndex >= 0 ? parseTextToken(parts[elseIndex + 1] ?? '') || null : null,
  };
}

function parseSceneLine(line: string, lineNumber: number): SceneNode | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const bracketMatch = /^\[(.+)\]$/.exec(trimmed);
  if (bracketMatch) {
    const parts = tokenizeCommand(bracketMatch[1]);
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

    if (command === 'label') {
      return {
        id: nodeId(lineNumber, 'label'),
        type: 'label',
        name: parseTextToken(parts.slice(1).join(' ')),
      };
    }

    if (command === 'goto') {
      const goto = parseGoto(parts, lineNumber);
      if (goto) return goto;
    }

    if (command === 'stop_effect') {
      const effectType = (parts[1] ?? 'all') as StopEffectNode['effectType'];
      const target = parts[2] as StopEffectNode['target'] | undefined;
      if (STOP_EFFECT_TYPES.has(effectType) && (!target || STOP_EFFECT_TARGETS.has(target))) {
        return {
          id: nodeId(lineNumber, 'stop_effect'),
          type: 'stop_effect',
          effectType,
          target,
        };
      }
    }

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
