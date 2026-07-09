import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import {
  buildAssetUsageReport,
  collectAssetReferences,
  toSpriteUsageAssetId,
  type AssetReference,
  type AssetUsageKind,
  type AvailableAsset,
} from '@/lib/asset-usage';
import {
  validateSceneGraph,
  type SceneGraphIssue,
} from '@/lib/document-editor/scene-graph-validator';
import type {
  ChoiceBlockData,
  Condition,
  DialogueBlockData,
  SceneRecord,
  TextBlockData,
  TimelineStep,
  TransitionBlockData,
  VariableBlockData,
} from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';

export type StoryDoctorSeverity = 'error' | 'warning';

export interface StoryDoctorFinding {
  severity: StoryDoctorSeverity;
  sceneId?: string;
  stepId?: string;
  code: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
}

export interface StoryDoctorSummary {
  errors: number;
  warnings: number;
}

export interface StoryDoctorReport {
  findings: StoryDoctorFinding[];
  summary: StoryDoctorSummary;
}

export interface StoryDoctorInput {
  scenes: SceneRecord[];
  mediaAssets?: LibraryAsset[];
  audioAssets?: AudioLibraryItem[];
  characters?: Character[];
}

const BUILTIN_VARIABLE_PREFIX = '_';

function isEnabled(step: TimelineStep): boolean {
  return step.enabled !== false;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isBuiltinVariable(name: string): boolean {
  return name.startsWith(BUILTIN_VARIABLE_PREFIX);
}

function isUriLikeAssetRef(assetRef: string): boolean {
  return /^(file|content|blob|data|https?):/i.test(assetRef)
    || assetRef.startsWith('/')
    || assetRef.startsWith('assets/')
    || assetRef.startsWith('bundle://');
}

function mapGraphIssue(issue: SceneGraphIssue): StoryDoctorFinding {
  switch (issue.type) {
    case 'noStartScene':
      return {
        severity: 'error',
        code: 'graph.noStartScene',
        messageKey: 'storyDoctor.issue.noStartScene',
      };
    case 'danglingChoiceTarget':
      return {
        severity: 'error',
        sceneId: issue.sceneId,
        stepId: issue.choiceStepId,
        code: 'graph.danglingChoiceTarget',
        messageKey: 'storyDoctor.issue.danglingChoiceTarget',
        messageParams: { targetSceneId: issue.targetSceneId },
      };
    case 'danglingNextTarget':
      return {
        severity: 'error',
        sceneId: issue.sceneId,
        code: 'graph.danglingNextTarget',
        messageKey: 'storyDoctor.issue.danglingNextTarget',
        messageParams: { targetSceneId: issue.targetSceneId },
      };
    case 'unreachableScene':
      return {
        severity: 'warning',
        sceneId: issue.sceneId,
        code: 'graph.unreachableScene',
        messageKey: 'storyDoctor.issue.unreachableScene',
      };
  }
}

function addEmptyContentFindings(scene: SceneRecord, findings: StoryDoctorFinding[]): void {
  if ((scene.timeline ?? []).length === 0) {
    findings.push({
      severity: 'warning',
      sceneId: scene.id,
      code: 'content.emptyScene',
      messageKey: 'storyDoctor.issue.emptyScene',
    });
  }

  for (const step of scene.timeline ?? []) {
    if (!isEnabled(step)) continue;

    if (step.blockType === 'text' && isBlank((step.data as TextBlockData).content)) {
      findings.push({
        severity: 'warning',
        sceneId: scene.id,
        stepId: step.id,
        code: 'content.emptyText',
        messageKey: 'storyDoctor.issue.emptyText',
      });
    }

    if (step.blockType === 'dialogue') {
      const data = step.data as DialogueBlockData;
      for (const entry of data.entries ?? []) {
        if (isBlank(entry.text)) {
          findings.push({
            severity: 'warning',
            sceneId: scene.id,
            stepId: step.id,
            code: 'content.emptyDialogue',
            messageKey: 'storyDoctor.issue.emptyDialogue',
          });
          break;
        }
      }
    }

    if (step.blockType === 'choice') {
      const data = step.data as ChoiceBlockData;
      if ((data.options ?? []).length === 0) {
        findings.push({
          severity: 'error',
          sceneId: scene.id,
          stepId: step.id,
          code: 'content.emptyChoice',
          messageKey: 'storyDoctor.issue.emptyChoice',
        });
      }
      for (const option of data.options ?? []) {
        if (isBlank(option.text)) {
          findings.push({
            severity: 'error',
            sceneId: scene.id,
            stepId: step.id,
            code: 'content.emptyChoiceOption',
            messageKey: 'storyDoctor.issue.emptyChoiceOption',
          });
        }
      }
    }
  }
}

function collectConditionReads(conditions: (Condition | undefined)[], reads: Map<string, { sceneId: string; stepId?: string }>, sceneId: string, stepId?: string): void {
  for (const condition of conditions) {
    const variableName = condition?.variableName?.trim();
    if (!variableName || isBuiltinVariable(variableName)) continue;
    if (!reads.has(variableName)) reads.set(variableName, { sceneId, stepId });
  }
}

function addVariableFindings(scenes: SceneRecord[], findings: StoryDoctorFinding[]): void {
  const reads = new Map<string, { sceneId: string; stepId?: string }>();
  const writes = new Map<string, { sceneId: string; stepId?: string }>();

  for (const scene of scenes) {
    for (const step of scene.timeline ?? []) {
      if (!isEnabled(step)) continue;
      collectConditionReads(step.conditions ?? [], reads, scene.id, step.id);

      if (step.blockType === 'choice') {
        for (const option of (step.data as ChoiceBlockData).options ?? []) {
          collectConditionReads([option.condition], reads, scene.id, step.id);
        }
      }

      if (step.blockType === 'variable') {
        const variableName = (step.data as VariableBlockData).variableName?.trim();
        if (variableName && !isBuiltinVariable(variableName) && !writes.has(variableName)) {
          writes.set(variableName, { sceneId: scene.id, stepId: step.id });
        }
      }
    }
  }

  for (const [variableName, source] of reads) {
    if (!writes.has(variableName)) {
      findings.push({
        severity: 'warning',
        sceneId: source.sceneId,
        stepId: source.stepId,
        code: 'variable.possiblyUndefined',
        messageKey: 'storyDoctor.issue.possiblyUndefinedVariable',
        messageParams: { variableName },
      });
    }
  }

  for (const [variableName, source] of writes) {
    if (!reads.has(variableName)) {
      findings.push({
        severity: 'warning',
        sceneId: source.sceneId,
        stepId: source.stepId,
        code: 'variable.unread',
        messageKey: 'storyDoctor.issue.unreadVariable',
        messageParams: { variableName },
      });
    }
  }
}

function hasExplicitEndingOrRedirect(scene: SceneRecord, sceneIds: Set<string>): boolean {
  return (scene.timeline ?? []).some((step) => {
    if (!isEnabled(step) || step.blockType !== 'transition') return false;
    const data = step.data as TransitionBlockData;
    if (data.mode === 'end') return true;
    if (data.mode === 'scene' && data.targetSceneId && sceneIds.has(data.targetSceneId)) return true;
    return false;
  });
}

function hasOutgoingPath(scene: SceneRecord, sceneIds: Set<string>): boolean {
  if ((scene.connections ?? []).some((connection) => connection.outputPort === 'next' && sceneIds.has(connection.targetSceneId))) {
    return true;
  }

  for (const step of scene.timeline ?? []) {
    if (!isEnabled(step) || step.blockType !== 'choice') continue;
    const data = step.data as ChoiceBlockData;
    if ((data.options ?? []).some((option) => option.targetSceneId && sceneIds.has(option.targetSceneId))) {
      return true;
    }
  }

  return hasExplicitEndingOrRedirect(scene, sceneIds);
}

function addDeadEndFindings(scenes: SceneRecord[], findings: StoryDoctorFinding[]): void {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  for (const scene of scenes) {
    if (!hasOutgoingPath(scene, sceneIds)) {
      findings.push({
        severity: 'warning',
        sceneId: scene.id,
        code: 'flow.deadEnd',
        messageKey: 'storyDoctor.issue.deadEnd',
      });
    }
  }
}

function summarize(findings: StoryDoctorFinding[]): StoryDoctorSummary {
  return findings.reduce<StoryDoctorSummary>(
    (summary, finding) => {
      if (finding.severity === 'error') summary.errors += 1;
      else summary.warnings += 1;
      return summary;
    },
    { errors: 0, warnings: 0 },
  );
}

function audioKind(type: AudioLibraryItem['type']): AssetUsageKind {
  return type === 'music' ? 'music' : 'sound';
}

function buildAvailableAssetsForDoctor(input: StoryDoctorInput): AvailableAsset[] {
  const mediaAssets: AvailableAsset[] = (input.mediaAssets ?? []).map((asset) => ({
    id: asset.id,
    kind: asset.type === 'image' ? 'background' : 'sound',
    name: asset.name,
    aliases: [asset.uri],
  }));
  const audioAssets: AvailableAsset[] = (input.audioAssets ?? []).map((asset) => ({
    id: asset.id,
    kind: audioKind(asset.type),
    name: asset.name,
    aliases: [asset.uri],
  }));
  const spriteAssets: AvailableAsset[] = (input.characters ?? []).flatMap((character) =>
    character.sprites.map((sprite) => ({
      id: toSpriteUsageAssetId(character.id, sprite.id),
      kind: 'sprite' as const,
      name: `${character.name} / ${sprite.name}`,
      aliases: [sprite.id, sprite.uri],
    })),
  );

  return [...mediaAssets, ...audioAssets, ...spriteAssets];
}

function spriteIdFromUsageAssetId(assetId: string): string {
  const separatorIndex = assetId.indexOf(':');
  return separatorIndex === -1 ? assetId : assetId.slice(separatorIndex + 1);
}

function findingForBrokenReference(reference: AssetReference): StoryDoctorFinding {
  switch (reference.kind) {
    case 'background':
      return {
        severity: 'error',
        sceneId: reference.sceneId,
        stepId: reference.stepId,
        code: 'asset.missingBackground',
        messageKey: 'storyDoctor.issue.missingBackgroundAsset',
        messageParams: { assetId: reference.assetId },
      };
    case 'sprite':
      return {
        severity: 'error',
        sceneId: reference.sceneId,
        stepId: reference.stepId,
        code: 'asset.missingCharacterSprite',
        messageKey: 'storyDoctor.issue.missingCharacterSprite',
        messageParams: { spriteId: spriteIdFromUsageAssetId(reference.assetId) },
      };
    case 'music':
      return {
        severity: 'error',
        sceneId: reference.sceneId,
        stepId: reference.stepId,
        code: 'asset.missingMusic',
        messageKey: 'storyDoctor.issue.missingMusicAsset',
        messageParams: { assetId: reference.assetId },
      };
    case 'sound':
      return {
        severity: 'error',
        sceneId: reference.sceneId,
        stepId: reference.stepId,
        code: 'asset.missingSound',
        messageKey: 'storyDoctor.issue.missingSoundAsset',
        messageParams: { assetId: reference.assetId },
      };
    case 'object':
      return {
        severity: 'error',
        sceneId: reference.sceneId,
        stepId: reference.stepId,
        code: 'asset.missingObject',
        messageKey: 'storyDoctor.issue.missingObjectAsset',
        messageParams: { assetId: reference.assetId },
      };
  }
}

function addMissingAssetFindings(input: StoryDoctorInput, findings: StoryDoctorFinding[]): void {
  const references = collectAssetReferences(input.scenes ?? [])
    .filter((reference) => reference.enabled && !isUriLikeAssetRef(reference.assetId));
  const report = buildAssetUsageReport(references, buildAvailableAssetsForDoctor(input));
  findings.push(...report.brokenReferences.map(findingForBrokenReference));
}

export function runStoryDoctor(input: StoryDoctorInput): StoryDoctorReport {
  const scenes = input.scenes ?? [];
  const findings: StoryDoctorFinding[] = validateSceneGraph(scenes).map(mapGraphIssue);

  for (const scene of scenes) {
    addEmptyContentFindings(scene, findings);
  }
  addMissingAssetFindings(input, findings);
  addVariableFindings(scenes, findings);
  addDeadEndFindings(scenes, findings);

  return {
    findings,
    summary: summarize(findings),
  };
}
