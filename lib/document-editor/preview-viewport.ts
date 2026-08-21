/**
 * Geometry for the inspector's device preview.
 *
 * The preview renders a scene at a real device's pixel size and then scales the
 * whole thing down to fit the stage it is shown in. Nothing is re-laid out for
 * the small panel, so what the author sees is proportionally identical to what
 * the reader gets — the reader's own `getReaderLayout()` is fed the device
 * dimensions defined here.
 */

export type PreviewDevice = 'mobile' | 'desktop';

export interface PreviewDeviceSpec {
  id: PreviewDevice;
  /** Logical pixel width the preview renders at. */
  width: number;
  /** Logical pixel height the preview renders at. */
  height: number;
}

/**
 * Mobile is a 390x844 phone (iPhone 14 class) and desktop a 1440x900 browser
 * viewport. The two land on opposite sides of every breakpoint in
 * `lib/responsive.ts`, so the reader genuinely lays them out differently:
 * portrait puts the dialogue panel along the bottom, landscape puts it in a
 * right-hand column.
 */
export const PREVIEW_DEVICES: Record<PreviewDevice, PreviewDeviceSpec> = {
  mobile: { id: 'mobile', width: 390, height: 844 },
  desktop: { id: 'desktop', width: 1440, height: 900 },
};

export const PREVIEW_DEVICE_IDS: readonly PreviewDevice[] = ['mobile', 'desktop'];

export const DEFAULT_PREVIEW_DEVICE: PreviewDevice = 'mobile';

export function sanitizePreviewDevice(input: unknown): PreviewDevice {
  return input === 'mobile' || input === 'desktop' ? input : DEFAULT_PREVIEW_DEVICE;
}

export interface PreviewStage {
  width: number;
  height: number;
}

export interface PreviewGeometry {
  device: PreviewDevice;
  /** Size the scene is rendered at, before scaling. */
  deviceWidth: number;
  deviceHeight: number;
  /** Uniform scale applied to the rendered device. */
  scale: number;
  /** Size the scaled device occupies on the stage. */
  renderedWidth: number;
  renderedHeight: number;
  /** Letterbox offsets of the scaled device within the stage. */
  offsetX: number;
  offsetY: number;
  /** Stage the device was fitted into. */
  stageWidth: number;
  stageHeight: number;
}

/**
 * Contain-fits `device` into `stage`. The scale is never allowed above 1 in the
 * panel — a device larger than its stage shrinks, a stage larger than the
 * device (the expanded overlay on a big screen) stops at 1:1 unless the caller
 * opts into upscaling.
 */
export function getPreviewGeometry(
  device: PreviewDevice,
  stage: PreviewStage,
  options: { maxScale?: number } = {},
): PreviewGeometry {
  const spec = PREVIEW_DEVICES[sanitizePreviewDevice(device)];
  const maxScale = options.maxScale ?? 1;
  const stageWidth = Math.max(0, stage.width);
  const stageHeight = Math.max(0, stage.height);

  const rawScale = Math.min(stageWidth / spec.width, stageHeight / spec.height);
  const scale = Math.max(0, Math.min(maxScale, Number.isFinite(rawScale) ? rawScale : 0));

  const renderedWidth = spec.width * scale;
  const renderedHeight = spec.height * scale;

  return {
    device: spec.id,
    deviceWidth: spec.width,
    deviceHeight: spec.height,
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: Math.max(0, (stageWidth - renderedWidth) / 2),
    offsetY: Math.max(0, (stageHeight - renderedHeight) / 2),
    stageWidth,
    stageHeight,
  };
}

/**
 * Style for a device-sized layer that is scaled down and centered on the stage.
 *
 * The layer keeps its full device dimensions so children can use real reader
 * pixel values. Transforms scale around the view's center on both React Native
 * and RN Web, so centering the *unscaled* device on the stage also centers the
 * scaled result — no offset bookkeeping needed.
 */
export function getPreviewLayerStyle(geometry: PreviewGeometry) {
  return {
    position: 'absolute' as const,
    left: (geometry.stageWidth - geometry.deviceWidth) / 2,
    top: (geometry.stageHeight - geometry.deviceHeight) / 2,
    width: geometry.deviceWidth,
    height: geometry.deviceHeight,
    transform: [{ scale: geometry.scale }],
  };
}
