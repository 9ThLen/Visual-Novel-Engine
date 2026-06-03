/**
 * components/editor/properties/registry.ts — Form lookup map.
 *
 * Maps each BlockType to its dedicated form subcomponent. The orchestrating
 * `PropertiesPanel` dispatches via `formRegistry[block.blockType]`.
 */
import type { ComponentType } from 'react';
import type { BlockType } from '@/lib/engine/types';
import type { PropertiesFormProps } from './types';
import BackgroundPropertiesForm from './BackgroundPropertiesForm';
import CharacterPropertiesForm from './CharacterPropertiesForm';
import TextPropertiesForm from './TextPropertiesForm';
import DialoguePropertiesForm from './DialoguePropertiesForm';
import ChoicePropertiesForm from './ChoicePropertiesForm';
import EffectPropertiesForm from './EffectPropertiesForm';
import MusicPropertiesForm from './MusicPropertiesForm';
import SoundPropertiesForm from './SoundPropertiesForm';
import InteractiveObjectPropertiesForm from './InteractiveObjectPropertiesForm';
import CameraPropertiesForm from './CameraPropertiesForm';
import VariablePropertiesForm from './VariablePropertiesForm';
import TransitionPropertiesForm from './TransitionPropertiesForm';

// We type each entry as ComponentType<PropertiesFormProps<any>> because the
// orchestrator dispatches by blockType and the per-component generic T is
// preserved at the call site (via the data/upd props).
type AnyForm = ComponentType<PropertiesFormProps<any>>;

export const formRegistry: Record<BlockType, AnyForm> = {
  background: BackgroundPropertiesForm as AnyForm,
  character: CharacterPropertiesForm as AnyForm,
  text: TextPropertiesForm as AnyForm,
  dialogue: DialoguePropertiesForm as AnyForm,
  choice: ChoicePropertiesForm as AnyForm,
  effect: EffectPropertiesForm as AnyForm,
  music: MusicPropertiesForm as AnyForm,
  sound: SoundPropertiesForm as AnyForm,
  interactive_object: InteractiveObjectPropertiesForm as AnyForm,
  camera: CameraPropertiesForm as AnyForm,
  variable: VariablePropertiesForm as AnyForm,
  transition: TransitionPropertiesForm as AnyForm,
};
