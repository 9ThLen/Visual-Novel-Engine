/**
 * The release gate.
 *
 * Preflight answers one question — may this story be published right now — and
 * deliberately does **not** re-check story health. `lib/story-doctor.ts` already
 * validates the scene graph, missing assets, dead ends, variables and theme
 * contrast; preflight folds its report in and adds only what is specific to
 * *releasing*: is the story presentable, is it playable to an end, is the
 * version newer than what is already out, is it small enough to be worth
 * downloading.
 *
 * Duplicating the doctor's checks here would report every problem twice in a UI
 * that shows both, which is why the split is by question rather than by
 * severity.
 *
 * Pure: everything is a function of its arguments, so the gate is unit-testable
 * without a store, and the same report drives the checklist card, the publish
 * sheet and the CLI exporter.
 */
import type { AudioLibraryItem } from '@/lib/audio-types';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { RELEASE_LIMITS, type ReleaseChannel, type ReleaseStats } from '@/lib/release/types';
import { isNewerReleaseVersion, isReleaseVersion } from '@/lib/release/version';
import {
  countBranches,
  countTerminalScenes,
  estimateReadMinutes,
} from '@/lib/showcase/story-showcase';
import { runStoryDoctor, type StoryDoctorFinding } from '@/lib/story-doctor';
import type { StoryMetadata } from '@/lib/story-domain';
import { computeStoryStats } from '@/lib/story-stats';

export type ReleaseFindingSeverity = 'blocker' | 'warning';

export interface ReleaseFinding {
  severity: ReleaseFindingSeverity;
  /** Stable identifier for tests and telemetry; never shown to a reader. */
  code: string;
  /** Key into `lib/translations.ts`; the UI owns the wording. */
  messageKey: string;
  messageParams?: Record<string, string | number>;
  /** Present when the finding can be opened in the editor. */
  sceneId?: string;
  stepId?: string;
  /** True when the finding came from the story doctor rather than this gate. */
  fromStoryDoctor?: boolean;
}

export interface ReleasePreflightInput {
  metadata: StoryMetadata;
  scenes: SceneRecord[];
  characters?: Character[];
  mediaAssets?: LibraryAsset[];
  audioAssets?: AudioLibraryItem[];
  /** Where this release is headed; a store page demands more than a bundle. */
  channel: ReleaseChannel;
  /** The version the author intends to publish, if they have chosen one yet. */
  version?: string;
  /** Highest already-published version, or null for a first release. */
  previousVersion?: string | null;
  /**
   * Total bytes the release is expected to weigh, when the caller knows. R2
   * supplies the real figure; before then the size check simply does not run
   * rather than reporting a guess.
   */
  estimatedBytes?: number;
}

export interface ReleasePreflightReport {
  blockers: ReleaseFinding[];
  warnings: ReleaseFinding[];
  stats: ReleaseStats;
  /** True when nothing blocks publication. Warnings do not affect it. */
  ready: boolean;
}

/** Channels that put the story in front of a browsing reader. */
function isStorefrontChannel(channel: ReleaseChannel): boolean {
  return channel === 'page' || channel === 'both';
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function fromDoctorFinding(finding: StoryDoctorFinding): ReleaseFinding {
  const mapped: ReleaseFinding = {
    severity: finding.severity === 'error' ? 'blocker' : 'warning',
    code: finding.code,
    messageKey: finding.messageKey,
    fromStoryDoctor: true,
  };
  if (finding.messageParams) mapped.messageParams = finding.messageParams;
  if (finding.sceneId) mapped.sceneId = finding.sceneId;
  if (finding.stepId) mapped.stepId = finding.stepId;
  return mapped;
}

export function computeReleaseStats(scenes: SceneRecord[]): ReleaseStats {
  const authored = computeStoryStats(scenes);
  return {
    scenes: authored.scenes,
    words: authored.words,
    readMinutes: estimateReadMinutes(scenes),
    // The true count, not the showcase's display floor: a manifest that claims
    // an ending a reader can never reach is worse than an honest zero, which
    // the gate below blocks anyway.
    endings: countTerminalScenes(scenes),
    branches: countBranches(scenes),
  };
}

/**
 * Presentation checks. A missing cover is fatal for a store page and merely
 * unfortunate for a downloadable bundle, which is why severity depends on the
 * channel rather than being fixed per field.
 */
function checkPresentation(
  metadata: StoryMetadata,
  channel: ReleaseChannel,
  findings: ReleaseFinding[],
): void {
  const storefront = isStorefrontChannel(channel);
  const presentationSeverity: ReleaseFindingSeverity = storefront ? 'blocker' : 'warning';

  if (isBlank(metadata.title)) {
    findings.push({
      severity: 'blocker',
      code: 'release.missingTitle',
      messageKey: 'releasePreflight.issue.missingTitle',
    });
  }
  if (isBlank(metadata.author)) {
    findings.push({
      severity: presentationSeverity,
      code: 'release.missingAuthor',
      messageKey: 'releasePreflight.issue.missingAuthor',
    });
  }
  if (isBlank(metadata.description)) {
    findings.push({
      severity: presentationSeverity,
      code: 'release.missingDescription',
      messageKey: 'releasePreflight.issue.missingDescription',
    });
  }
  if (isBlank(metadata.thumbnailUri)) {
    findings.push({
      severity: presentationSeverity,
      code: 'release.missingCover',
      messageKey: 'releasePreflight.issue.missingCover',
    });
  }
}

/**
 * Publication checks. Content rating and language are what a reader needs
 * before they open a story, so a storefront release cannot omit them; a bundle
 * the author hands to someone directly can.
 */
function checkPublication(
  metadata: StoryMetadata,
  channel: ReleaseChannel,
  findings: ReleaseFinding[],
): void {
  const severity: ReleaseFindingSeverity = isStorefrontChannel(channel) ? 'blocker' : 'warning';

  if (!metadata.contentRating) {
    findings.push({
      severity,
      code: 'release.missingContentRating',
      messageKey: 'releasePreflight.issue.missingContentRating',
    });
  }
  if (!metadata.languages?.length) {
    findings.push({
      severity,
      code: 'release.missingLanguages',
      messageKey: 'releasePreflight.issue.missingLanguages',
    });
  }
  // Not a gate on the author's honesty — a nudge that the field exists, and only
  // where a stranger is choosing whether to read.
  if (isStorefrontChannel(channel) && metadata.aiAssisted === undefined) {
    findings.push({
      severity: 'warning',
      code: 'release.undeclaredAiAssistance',
      messageKey: 'releasePreflight.issue.undeclaredAiAssistance',
    });
  }
}

/** Playability checks the story doctor does not make. */
function checkPlayability(
  metadata: StoryMetadata,
  scenes: SceneRecord[],
  stats: ReleaseStats,
  findings: ReleaseFinding[],
): void {
  if (scenes.length === 0) {
    findings.push({
      severity: 'blocker',
      code: 'release.noScenes',
      messageKey: 'releasePreflight.issue.noScenes',
    });
    return;
  }

  if (isBlank(metadata.startSceneId) || !scenes.some((scene) => scene.id === metadata.startSceneId)) {
    findings.push({
      severity: 'blocker',
      code: 'release.missingStartScene',
      messageKey: 'releasePreflight.issue.missingStartScene',
    });
  }

  // A story with no ending never finishes: the reader runs out of scenes rather
  // than arriving somewhere. The doctor reports individual dead ends; this asks
  // whether the story can be completed at all.
  if (stats.endings === 0) {
    findings.push({
      severity: 'blocker',
      code: 'release.noEndings',
      messageKey: 'releasePreflight.issue.noEndings',
    });
  }

  if (stats.words === 0) {
    findings.push({
      severity: 'blocker',
      code: 'release.noContent',
      messageKey: 'releasePreflight.issue.noContent',
    });
  }
}

function checkVersion(input: ReleasePreflightInput, findings: ReleaseFinding[]): void {
  const { version, previousVersion } = input;
  if (version === undefined) return;

  if (!isReleaseVersion(version)) {
    findings.push({
      severity: 'blocker',
      code: 'release.invalidVersion',
      messageKey: 'releasePreflight.issue.invalidVersion',
      messageParams: { version: String(version) },
    });
    return;
  }
  if (!isNewerReleaseVersion(version, previousVersion)) {
    findings.push({
      severity: 'blocker',
      code: 'release.versionNotNewer',
      messageKey: 'releasePreflight.issue.versionNotNewer',
      messageParams: { version, previousVersion: String(previousVersion) },
    });
  }
}

function checkSize(input: ReleasePreflightInput, findings: ReleaseFinding[]): void {
  const { estimatedBytes } = input;
  if (estimatedBytes === undefined) return;

  if (estimatedBytes > RELEASE_LIMITS.maxPayloadBytes + RELEASE_LIMITS.maxWebUncompressedBytes) {
    findings.push({
      severity: 'blocker',
      code: 'release.tooLarge',
      messageKey: 'releasePreflight.issue.tooLarge',
      messageParams: { bytes: estimatedBytes },
    });
    return;
  }
  // Advisory only. Sideloaded apps have no ceiling at all, so the engine warns
  // about size and never refuses it; the per-channel hard limits are checked
  // against a real artifact, not an estimate.
  if (estimatedBytes > RELEASE_LIMITS.softWarnBytes) {
    findings.push({
      severity: 'warning',
      code: 'release.largeDownload',
      messageKey: 'releasePreflight.issue.largeDownload',
      messageParams: { bytes: estimatedBytes },
    });
  }
}

export function runReleasePreflight(input: ReleasePreflightInput): ReleasePreflightReport {
  const scenes = input.scenes ?? [];
  const stats = computeReleaseStats(scenes);

  const doctor = runStoryDoctor({
    scenes,
    characters: input.characters,
    mediaAssets: input.mediaAssets,
    audioAssets: input.audioAssets,
    metadata: input.metadata,
  });

  const findings: ReleaseFinding[] = doctor.findings.map(fromDoctorFinding);

  checkPresentation(input.metadata, input.channel, findings);
  checkPublication(input.metadata, input.channel, findings);
  checkPlayability(input.metadata, scenes, stats, findings);
  checkVersion(input, findings);
  checkSize(input, findings);

  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  const warnings = findings.filter((finding) => finding.severity === 'warning');

  return { blockers, warnings, stats, ready: blockers.length === 0 };
}
