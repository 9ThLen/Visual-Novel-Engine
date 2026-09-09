/**
 * How the media library writes a file's numbers.
 *
 * Both of these were copied into the grid and the inspector separately, and a
 * third copy was about to appear in the track list. The library speaks in whole
 * KB below a megabyte and one decimal above it — deliberately coarser than
 * `formatFileSize` in `web-utils`, which is for a storage report where the
 * exact figure is the point.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `m:ss`. Never `h:mm:ss`: nothing in a story's library runs that long. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
