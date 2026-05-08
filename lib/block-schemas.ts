import { z } from 'zod';

export const dialogueSchema = z.object({
  character: z.string(),
  text: z.string().min(1, 'Text is required'),
});

export const narrationSchema = z.object({
  text: z.string().min(1, 'Text is required'),
});

export const showCharacterSchema = z.object({
  characterId: z.string().min(1, 'Character is required'),
  position: z.enum(['left', 'center', 'right']).default('center'),
  expression: z.string().default('neutral'),
});

export const hideCharacterSchema = z.object({
  characterId: z.string().min(1, 'Character is required'),
});

export const characterAnimationSchema = z.object({
  characterId: z.string().min(1, 'Character is required'),
  animation: z.enum(['shake', 'bounce', 'slide_in_left', 'slide_in_right', 'fade_in', 'fade_out']).default('shake'),
});

export const setBackgroundSchema = z.object({
  backgroundUri: z.string().min(1, 'Background is required').refine(
    (val) => {
      // Accept valid URLs or relative/absolute file paths
      try {
        new URL(val);
        return true;
      } catch {
        return val.startsWith('/') || val.startsWith('./') || val.startsWith('../') || val.includes('://');
      }
    },
    { message: 'Must be a valid URL or file path' }
  ),
});

export const playMusicSchema = z.object({
  musicUri: z.string().min(1, 'Music file is required').refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return val.startsWith('/') || val.startsWith('./') || val.startsWith('../') || val.includes('://');
      }
    },
    { message: 'Must be a valid URL or file path' }
  ),
  loop: z.boolean().default(true),
  volume: z.number().min(0).max(100).default(80),
});

export const playSfxSchema = z.object({
  sfxUri: z.string().min(1, 'Sound file is required').refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return val.startsWith('/') || val.startsWith('./') || val.startsWith('../') || val.includes('://');
      }
    },
    { message: 'Must be a valid URL or file path' }
  ),
  volume: z.number().min(0).max(100).default(80),
});

export const playVoiceSchema = z.object({
  voiceUri: z.string().min(1, 'Voice file is required').refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return val.startsWith('/') || val.startsWith('./') || val.startsWith('../') || val.includes('://');
      }
    },
    { message: 'Must be a valid URL or file path' }
  ),
});

export const choiceSchema = z.object({
  text: z.string().min(1, 'Choice text is required'),
  nextSceneId: z.string().min(1, 'Target scene is required'),
});

export const conditionSchema = z.object({
  variable: z.string().min(1, 'Variable name is required'),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']).default('equals'),
  value: z.union([z.string(), z.number(), z.boolean()], { errorMap: () => ({ message: 'Value must be string, number, or boolean' }) }),
});

export const setVariableSchema = z.object({
  variable: z.string().min(1, 'Variable name is required'),
  value: z.union([z.string(), z.number(), z.boolean()], { errorMap: () => ({ message: 'Value must be string, number, or boolean' }) }),
});

export const transitionSchema = z.object({
  type: z.enum(['fade', 'dissolve', 'slide_left', 'slide_right', 'wipe', 'instant']).default('fade'),
  duration: z.number().min(0).max(5000).default(500),
});

export const waitSchema = z.object({
  duration: z.number().min(0).max(60000).default(1000),
});

export const groupSchema = z.object({
  title: z.string().min(1, 'Title is required').default('Group'),
});

export const blockSchemas: Record<string, z.ZodTypeAny> = {
  dialogue: dialogueSchema,
  narration: narrationSchema,
  show_character: showCharacterSchema,
  hide_character: hideCharacterSchema,
  character_animation: characterAnimationSchema,
  set_background: setBackgroundSchema,
  play_music: playMusicSchema,
  play_sfx: playSfxSchema,
  play_voice: playVoiceSchema,
  choice: choiceSchema,
  condition: conditionSchema,
  set_variable: setVariableSchema,
  transition: transitionSchema,
  wait: waitSchema,
  group: groupSchema,
};

export function validateBlockData(type: string, data: Record<string, any>): { valid: boolean; errors?: string[] } {
  const schema = blockSchemas[type];
  if (!schema) return { valid: true };
  const result = schema.safeParse(data);
  if (result.success) return { valid: true };
  return {
    valid: false,
    errors: result.error.issues.map((i) => i.message),
  };
}
