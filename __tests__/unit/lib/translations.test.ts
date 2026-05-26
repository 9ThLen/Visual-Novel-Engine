import { describe, expect, it } from 'vitest';

import { allTranslations } from '@/lib/translations';

const REQUIRED_BLOCK_KEYS = [
  'editor.block.background',
  'editor.block.character',
  'editor.block.text',
  'editor.block.dialogue',
  'editor.block.choice',
  'editor.block.music',
  'editor.block.sound',
  'editor.block.effect',
  'editor.block.transition',
  'editor.block.camera',
  'editor.block.variable',
  'editor.block.interactive_object',
] as const;

describe('translations', () => {
  it('contains editor block labels for every supported language', () => {
    for (const language of Object.keys(allTranslations) as Array<keyof typeof allTranslations>) {
      for (const key of REQUIRED_BLOCK_KEYS) {
        expect(allTranslations[language][key], `${language}:${key}`).toBeTruthy();
      }
    }
  });

  it('contains common search label for every supported language', () => {
    for (const language of Object.keys(allTranslations) as Array<keyof typeof allTranslations>) {
      expect(allTranslations[language]['common.search'], `${language}:common.search`).toBeTruthy();
    }
  });
});
