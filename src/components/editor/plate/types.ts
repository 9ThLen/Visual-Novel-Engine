// Plate transports the same document model used by the native/document editor.
// The SceneRecord conversion is centralized in lib/document-editor adapters,
// so the Plate layer intentionally does not define a second block schema.
export type {
  DocumentBlock as PlateSceneBlock,
  DocumentChoiceBlock as PlateChoiceBlock,
  DocumentCommandId as PlateCommandId,
  DocumentDialogueBlock as PlateDialogueBlock,
  DocumentScene as PlateDocumentScene,
  DocumentTechnicalBlock as PlateTechnicalBlock,
  DocumentTextBlock as PlateTextBlock,
} from '@/lib/document-editor/types';

export type {
  SceneRecord as PlateSceneRecord,
  TimelineStep as PlateTimelineStep,
} from '@/lib/engine/types';
