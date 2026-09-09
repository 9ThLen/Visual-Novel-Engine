/**
 * Pure layout/virtualization math for the continuous document scene list.
 * Kept framework-free so it can be unit tested without rendering React Native components.
 */

export interface SceneLayoutEntry {
  y: number;
  height: number;
}

export type SceneLayoutMap = Map<string, SceneLayoutEntry>;

export interface ComputeMountDeltaParams {
  order: string[];
  layout: SceneLayoutMap;
  scrollY: number;
  viewportHeight: number;
  mounted: ReadonlySet<string>;
  /** Multiple of viewportHeight beyond which scenes are mounted. */
  mountLeadFactor?: number;
  /** Multiple of viewportHeight beyond which mounted scenes are released (must be >= mountLeadFactor). */
  keepLeadFactor?: number;
}

export interface MountDeltaResult {
  toMount: string[];
  toUnmount: string[];
}

const DEFAULT_MOUNT_LEAD_FACTOR = 2.5;
const DEFAULT_KEEP_LEAD_FACTOR = 5;
const FALLBACK_VIEWPORT_HEIGHT = 800;

/**
 * Scenes without a known layout entry are left untouched (neither mounted nor
 * unmounted) — they get resolved once their placeholder/frame reports onLayout.
 */
export function computeMountDelta(params: ComputeMountDeltaParams): MountDeltaResult {
  const {
    order,
    layout,
    scrollY,
    mounted,
    mountLeadFactor = DEFAULT_MOUNT_LEAD_FACTOR,
    keepLeadFactor = DEFAULT_KEEP_LEAD_FACTOR,
  } = params;
  const viewportHeight = params.viewportHeight > 0 ? params.viewportHeight : FALLBACK_VIEWPORT_HEIGHT;

  const mountLead = viewportHeight * mountLeadFactor;
  const keepLead = viewportHeight * keepLeadFactor;
  const viewTop = scrollY;
  const viewBottom = scrollY + viewportHeight;

  const toMount: string[] = [];
  const toUnmount: string[] = [];

  for (const sceneId of order) {
    const entry = layout.get(sceneId);
    if (!entry) continue;

    const top = entry.y;
    const bottom = entry.y + entry.height;
    const isMounted = mounted.has(sceneId);
    const withinMountZone = bottom >= viewTop - mountLead && top <= viewBottom + mountLead;

    if (withinMountZone) {
      if (!isMounted) toMount.push(sceneId);
      continue;
    }

    const withinKeepZone = bottom >= viewTop - keepLead && top <= viewBottom + keepLead;
    if (isMounted && !withinKeepZone) {
      toUnmount.push(sceneId);
    }
  }

  return { toMount, toUnmount };
}

export interface ComputeActiveSceneIdParams {
  order: string[];
  layout: SceneLayoutMap;
  scrollY: number;
  /** Extra pixels below the viewport top counted as "still active" (accounts for sticky headers). */
  leadOffset?: number;
}

/**
 * The active scene is the last one in document order whose top edge has
 * scrolled past (scrollY + leadOffset). Falls back to the first scene in
 * `order` when nothing has a known layout yet.
 */
export function computeActiveSceneId(params: ComputeActiveSceneIdParams): string | undefined {
  const { order, layout, scrollY, leadOffset = 80 } = params;
  const threshold = scrollY + leadOffset;

  let active: string | undefined;
  for (const sceneId of order) {
    const entry = layout.get(sceneId);
    if (!entry) continue;
    if (entry.y <= threshold) {
      active = sceneId;
    } else {
      break;
    }
  }
  return active ?? order[0];
}

/**
 * Initial mount set before any layout is known: the given center scene plus
 * `radius` neighbors on either side, by list order.
 */
export function seedMountedSceneIds(order: string[], centerId: string, radius = 2): Set<string> {
  const ids = new Set<string>();
  const centerIndex = order.indexOf(centerId);
  if (centerIndex === -1) {
    if (order[0]) ids.add(order[0]);
    return ids;
  }
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(order.length - 1, centerIndex + radius);
  for (let i = start; i <= end; i += 1) {
    ids.add(order[i]);
  }
  return ids;
}
