// Format duration in seconds to MM:SS or H:MM:SS format
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format byte count into human-readable string (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format a total duration in seconds into a human-readable string.
 *
 * < 60 min  → "Xm"
 * < 24 h    → "Xh Ym"
 * < 7 days  → "X days Yh"
 * ≥ 7 days  → "X weeks D days"
 */
export function formatTotalDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0m';

  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours   = Math.floor(totalSeconds / 3600);
  const totalDays    = Math.floor(totalSeconds / 86400);
  const totalWeeks   = Math.floor(totalDays / 7);

  if (totalWeeks >= 1) {
    const remainingDays = totalDays % 7;
    return remainingDays > 0
      ? `${totalWeeks} week${totalWeeks !== 1 ? 's' : ''} ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`
      : `${totalWeeks} week${totalWeeks !== 1 ? 's' : ''}`;
  }

  if (totalDays >= 1) {
    const remainingHours = totalHours % 24;
    return remainingHours > 0
      ? `${totalDays} day${totalDays !== 1 ? 's' : ''} ${remainingHours}h`
      : `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
  }

  if (totalHours >= 1) {
    const remainingMins = totalMinutes % 60;
    return remainingMins > 0
      ? `${totalHours}h ${remainingMins}m`
      : `${totalHours}h`;
  }

  return `${totalMinutes}m`;
}
