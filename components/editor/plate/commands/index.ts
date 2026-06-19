export {
  DOCUMENT_COMMANDS as PLATE_SCENE_COMMANDS,
  findDocumentCommand as findPlateSceneCommand,
  searchDocumentCommands as searchPlateSceneCommands,
} from '@/lib/document-editor/commands';

export type { DocumentCommand as PlateSceneCommand } from '@/lib/document-editor/types';
export { isValidTimelineStep } from './step-validation';
