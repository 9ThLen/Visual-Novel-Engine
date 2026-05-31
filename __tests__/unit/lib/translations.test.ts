import { allTranslations, SUPPORTED_LANGUAGES } from '@/lib/translations';

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

const REQUIRED_DOCUMENT_UX_KEYS = [
  'editor.documentEditor',
  'common.saving',
  'editor.saved',
  'editor.unsaved',
  'document.sceneCounter',
  'document.commandMenuHint',
  'document.command.background',
  'document.command.background.description',
  'document.command.character',
  'document.command.character.description',
  'document.command.sprite',
  'document.command.sprite.description',
  'document.command.newScene',
  'document.command.newScene.description',
  'document.command.music',
  'document.command.music.description',
  'document.command.sound',
  'document.command.sound.description',
  'document.command.transition',
  'document.command.transition.description',
  'document.command.variable',
  'document.command.variable.description',
  'document.command.effect',
  'document.command.effect.description',
  'document.command.camera',
  'document.command.camera.description',
  'document.command.interactive_object',
  'document.command.interactive_object.description',
  'document.noCommandsFound',
  'document.sceneNamePlaceholder',
  'document.speakerPlaceholder',
  'document.dialoguePlaceholder',
  'document.narrationPlaceholder',
  'document.lineDraftPlaceholder',
  'document.placeholder.assetId',
  'document.placeholder.transition',
  'document.placeholder.characterId',
  'document.placeholder.sprite',
  'document.placeholder.position',
  'document.placeholder.music',
  'document.placeholder.targetScene',
  'document.warning.background',
  'document.warning.character',
  'character.create',
  'character.edit',
  'character.spritePickerUnavailable',
  'sceneSelector.connect',
  'sceneSelector.connectScene',
  'sceneSelector.tapTargetToConnect',
  'splash.remove',
  'splash.removeTitle',
  'splash.removeMessage',
] as const;

describe('translations', () => {
  it('supports English and Ukrainian in the app', () => {
    expect(SUPPORTED_LANGUAGES.map((language) => language.code)).toEqual(['en', 'uk']);
    expect(Object.keys(allTranslations)).toEqual(['en', 'uk']);
  });

  it('contains editor block labels for every supported language', () => {
    for (const language of Object.keys(allTranslations) as (keyof typeof allTranslations)[]) {
      for (const key of REQUIRED_BLOCK_KEYS) {
        expect(allTranslations[language][key], `${language}:${key}`).toBeTruthy();
      }
    }
  });

  it('contains common search label for every supported language', () => {
    for (const language of Object.keys(allTranslations) as (keyof typeof allTranslations)[]) {
      expect(allTranslations[language]['common.search'], `${language}:common.search`).toBeTruthy();
    }
  });

  it('contains document-first UX translations for every supported language', () => {
    for (const language of Object.keys(allTranslations) as (keyof typeof allTranslations)[]) {
      for (const key of REQUIRED_DOCUMENT_UX_KEYS) {
        expect(allTranslations[language][key], `${language}:${key}`).toBeTruthy();
      }
    }
  });
});
