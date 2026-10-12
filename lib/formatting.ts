/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }

  const rounded = Math.floor(seconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  const paddedMins = hrs > 0 ? String(mins).padStart(2, '0') : String(mins);
  const paddedSecs = String(secs).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }
  return `${paddedMins.padStart(2, '0')}:${paddedSecs}`;
}

/**
 * Formats a timestamp range: e.g. "03:14 - 03:34"
 */
export function formatTimeRange(startSeconds: number, endSeconds: number | null): string {
  const startStr = formatTime(startSeconds);
  if (endSeconds == null) {
    return `${startStr} · detected`;
  }
  return `${startStr} - ${formatTime(endSeconds)}`;
}
