import type { AtomBlock } from '@/lib/atom-types';
import type { MoleculeBlock } from '@/lib/molecule-types';
import { getAudioData, isAudioAtom } from '@/lib/atom-types';

export interface LegoAudioExport {
  musicUri?: string;
  voiceUri?: string;
}

function collectAtoms(elements: (AtomBlock | MoleculeBlock)[]): AtomBlock[] {
  const atoms: AtomBlock[] = [];
  for (const el of elements) {
    if ('snapPoints' in el) {
      atoms.push(el);
    } else if ('atoms' in el && Array.isArray(el.atoms)) {
      atoms.push(...el.atoms);
    }
  }
  return atoms;
}

/**
 * Extract music/voice URIs from Lego audio atoms for StoryScene playback fields.
 * Form values take precedence when merged: `formUri || legoExport.musicUri`.
 */
export function extractAudioUrisFromLegoElements(
  elements: (AtomBlock | MoleculeBlock)[],
): LegoAudioExport {
  const result: LegoAudioExport = {};

  for (const atom of collectAtoms(elements)) {
    if (!isAudioAtom(atom)) continue;
    const data = getAudioData(atom);
    if (!data?.uri || !data.uri.trim() || data.uri.trim() === ' ') continue;

    const uri = data.uri.trim();
    if (data.type === 'music' && !result.musicUri) {
      result.musicUri = uri;
    } else if (data.type === 'voice' && !result.voiceUri) {
      result.voiceUri = uri;
    }
  }

  return result;
}
