export type PhoneComposerPanel = 'blocks' | 'timeline' | 'properties';

export function getPhoneComposerPanel(options: {
  showBlockLibrary: boolean;
  showProperties: boolean;
  hasSelectedBlock: boolean;
}): PhoneComposerPanel {
  if (options.showBlockLibrary) {
    return 'blocks';
  }

  if (options.showProperties && options.hasSelectedBlock) {
    return 'properties';
  }

  return 'timeline';
}
