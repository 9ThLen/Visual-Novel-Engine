import type { SceneNode } from './sceneTypes';

export type SceneValidationIssue = {
  nodeId?: string;
  line?: number;
  severity: 'warning' | 'error';
  message: string;
};

export function validateSceneNodes(nodes: SceneNode[]): SceneValidationIssue[] {
  return nodes.flatMap<SceneValidationIssue>((node, index) => {
    const line = index + 1;

    if (node.type === 'dialogue' && !node.characterName.trim()) {
      return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Character name is required.' }];
    }

    if (node.type === 'background' && !node.assetId.trim()) {
      return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Background assetId is required.' }];
    }

    if ((node.type === 'music' || node.type === 'sound') && node.mode === 'track' && !node.assetId?.trim()) {
      return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Audio assetId is required for track mode.' }];
    }

    if (node.type === 'choice' && node.options.length < 2) {
      return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Choice needs at least two options.' }];
    }

    if (node.type === 'label' && !node.name.trim()) {
      return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Label name is required.' }];
    }

    if (node.type === 'goto') {
      if (!node.targetLabel.trim()) {
        return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Goto target label is required.' }];
      }
      if (node.condition && !node.condition.variableName.trim()) {
        return [{ nodeId: node.id, line, severity: 'error' as const, message: 'Goto condition variable is required.' }];
      }
    }

    if (node.type === 'command') {
      return [{ nodeId: node.id, line, severity: 'warning' as const, message: 'Unknown command will be saved as text.' }];
    }

    return [];
  });
}
