import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { DocumentCommand } from '@/lib/document-editor/types';

export const documentCommandIcons: Record<DocumentCommand['id'], IconSymbolName> = {
  background: 'image',
  character: 'character',
  sprite: 'sprites',
  newScene: 'document',
  music: 'music',
  sound: 'sound',
  transition: 'chevron.right',
  variable: 'settings',
  effect: 'lightning',
  camera: 'preview',
  interactive_object: 'blocks',
};

export function getDocumentCommandTone(commandId: DocumentCommand['id']): 'green' | 'amber' | 'blue' {
  if (commandId === 'background' || commandId === 'newScene') return 'green';
  if (commandId === 'character' || commandId === 'sprite') return 'amber';
  return 'blue';
}
