/**
 * Help System Types
 * Contextual help and guided tours for the editor
 */

export type HelpCategory = 'story' | 'media' | 'navigation' | 'settings' | 'advanced';

export interface HelpItem {
  id: string;
  label: string;
  description: string;
  hint?: string;
  category: HelpCategory;
  keywords?: string[];
}

export interface HelpTooltipPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuidedTourStep {
  helpItemId: string;
  order: number;
  title: string;
  message: string;
  highlightDuration?: number;
}

export interface GuidedTour {
  id: string;
  name: string;
  description: string;
  steps: GuidedTourStep[];
  category: HelpCategory;
}

export interface HelpSystemState {
  isHelpModeActive: boolean;
  activeTooltip: string | null;
  tooltipPosition: HelpTooltipPosition | null;
  isGuidedTourActive: boolean;
  currentTourId: string | null;
  currentTourStep: number;
  hasSeenFirstTimeGuide: boolean;
}

// Predefined guided tours
export const GUIDED_TOURS: Record<string, GuidedTour> = {
  firstTime: {
    id: 'first_time_guide',
    name: 'Getting Started',
    description: 'Learn the basics of the visual novel editor',
    category: 'navigation',
    steps: [
      {
        helpItemId: 'story_list',
        order: 0,
        title: 'Welcome to the Editor!',
        message: 'This is your story list. All your visual novel projects appear here.',
      },
      {
        helpItemId: 'add_story_button',
        order: 1,
        title: 'Create Your First Story',
        message: 'Tap here to create a new visual novel project.',
      },
      {
        helpItemId: 'scene_editor',
        order: 2,
        title: 'Scene Editor',
        message: 'Each story is made of scenes. Edit dialogue, choices, and media here.',
      },
      {
        helpItemId: 'preview_button',
        order: 3,
        title: 'Preview Your Work',
        message: 'Test your story anytime by tapping the preview button.',
      },
    ],
  },
  storyBasics: {
    id: 'story_basics',
    name: 'Story Creation',
    description: 'Learn how to create and structure your story',
    category: 'story',
    steps: [
      {
        helpItemId: 'add_scene_button',
        order: 0,
        title: 'Adding Scenes',
        message: 'Scenes are the building blocks of your story. Add a new scene here.',
      },
      {
        helpItemId: 'scene_connections',
        order: 1,
        title: 'Connecting Scenes',
        message: 'Link scenes together to create branching narratives.',
      },
      {
        helpItemId: 'choice_editor',
        order: 2,
        title: 'Player Choices',
        message: 'Add choices that let players shape the story.',
      },
    ],
  },
  mediaGuide: {
    id: 'media_guide',
    name: 'Adding Media',
    description: 'Learn how to add images, audio, and effects',
    category: 'media',
    steps: [
      {
        helpItemId: 'background_picker',
        order: 0,
        title: 'Background Images',
        message: 'Set the scene with background images.',
      },
      {
        helpItemId: 'character_sprite_picker',
        order: 1,
        title: 'Character Sprites',
        message: 'Add character images that appear during dialogue.',
      },
      {
        helpItemId: 'audio_picker',
        order: 2,
        title: 'Background Music',
        message: 'Set the mood with background music and sound effects.',
      },
    ],
  },
};

// Help content database
export const HELP_CONTENT: Record<string, HelpItem> = {
  // Story Management
  story_list: {
    id: 'story_list',
    label: 'Story List',
    description: 'View and manage all your visual novel projects',
    hint: 'Tap a story to edit it',
    category: 'story',
    keywords: ['project', 'list', 'manage'],
  },
  add_story_button: {
    id: 'add_story_button',
    label: 'Add Story',
    description: 'Create a new visual novel project',
    hint: 'Give your story a title and description',
    category: 'story',
    keywords: ['create', 'new', 'project'],
  },
  delete_story_button: {
    id: 'delete_story_button',
    label: 'Delete Story',
    description: 'Permanently remove this story from your library',
    hint: 'This action cannot be undone',
    category: 'story',
    keywords: ['remove', 'delete'],
  },

  // Scene Management
  scene_editor: {
    id: 'scene_editor',
    label: 'Scene Editor',
    description: 'Edit dialogue, choices, and scene properties',
    hint: 'Each scene represents a moment in your story',
    category: 'story',
    keywords: ['edit', 'scene', 'dialogue'],
  },
  add_scene_button: {
    id: 'add_scene_button',
    label: 'Add Scene',
    description: 'Create a new scene in your story',
    hint: 'Scenes can be connected to create branching paths',
    category: 'story',
    keywords: ['create', 'scene', 'new'],
  },
  scene_connections: {
    id: 'scene_connections',
    label: 'Scene Connections',
    description: 'Visual graph showing how scenes connect',
    hint: 'Drag to connect scenes, creating story flow',
    category: 'story',
    keywords: ['flow', 'graph', 'connections'],
  },
  scene_text_editor: {
    id: 'scene_text_editor',
    label: 'Dialogue Editor',
    description: 'Write the dialogue and narration for this scene',
    hint: 'Use line breaks to create pauses',
    category: 'story',
    keywords: ['text', 'dialogue', 'write'],
  },

  // Choices
  choice_editor: {
    id: 'choice_editor',
    label: 'Choice Editor',
    description: 'Add player choices that branch the story',
    hint: 'Each choice can lead to a different scene',
    category: 'story',
    keywords: ['choice', 'branch', 'decision'],
  },
  add_choice_button: {
    id: 'add_choice_button',
    label: 'Add Choice',
    description: 'Create a new choice option for the player',
    hint: 'Choices appear as buttons during gameplay',
    category: 'story',
    keywords: ['choice', 'option', 'branch'],
  },

  // Media
  background_picker: {
    id: 'background_picker',
    label: 'Background Image',
    description: 'Select or upload a background image for this scene',
    hint: 'Recommended size: 1920x1080 or larger',
    category: 'media',
    keywords: ['image', 'background', 'scene'],
  },
  character_sprite_picker: {
    id: 'character_sprite_picker',
    label: 'Character Sprite',
    description: 'Add character images that appear during dialogue',
    hint: 'Use transparent PNG for best results',
    category: 'media',
    keywords: ['character', 'sprite', 'image'],
  },
  audio_picker: {
    id: 'audio_picker',
    label: 'Background Music',
    description: 'Select background music or sound effects',
    hint: 'Supports MP3, WAV, and OGG formats',
    category: 'media',
    keywords: ['audio', 'music', 'sound'],
  },

  // Navigation
  preview_button: {
    id: 'preview_button',
    label: 'Preview Story',
    description: 'Test your story in the reader view',
    hint: 'See how players will experience your story',
    category: 'navigation',
    keywords: ['test', 'play', 'preview'],
  },
  save_button: {
    id: 'save_button',
    label: 'Save Changes',
    description: 'Save all changes to your story',
    hint: 'Changes are auto-saved periodically',
    category: 'navigation',
    keywords: ['save', 'persist'],
  },
  back_button: {
    id: 'back_button',
    label: 'Back',
    description: 'Return to the previous screen',
    hint: 'Unsaved changes will be lost',
    category: 'navigation',
    keywords: ['back', 'return', 'exit'],
  },

  // Advanced
  interactive_objects_button: {
    id: 'interactive_objects_button',
    label: 'Interactive Objects',
    description: 'Add clickable objects to scenes',
    hint: 'Objects can trigger actions when clicked',
    category: 'advanced',
    keywords: ['interactive', 'object', 'click'],
  },
  splash_screen_button: {
    id: 'splash_screen_button',
    label: 'Splash Screen',
    description: 'Add an intro screen before this scene',
    hint: 'Great for chapter titles or dramatic reveals',
    category: 'advanced',
    keywords: ['splash', 'intro', 'title'],
  },
};

// Category metadata
export const HELP_CATEGORIES: Record<HelpCategory, { name: string; icon: string; color: string }> = {
  story: {
    name: 'Story',
    icon: '📖',
    color: '#C17A5C',
  },
  media: {
    name: 'Media',
    icon: '🎨',
    color: '#7FA66F',
  },
  navigation: {
    name: 'Navigation',
    icon: '🧭',
    color: '#8FA8B8',
  },
  settings: {
    name: 'Settings',
    icon: '⚙️',
    color: '#9B8B7E',
  },
  advanced: {
    name: 'Advanced',
    icon: '⚡',
    color: '#D4A574',
  },
};
