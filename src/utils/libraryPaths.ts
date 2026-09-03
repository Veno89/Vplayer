/**
 * Case-insensitive, separator-aware library ownership check.
 *
 * A sibling such as `C:/Music Extended` must not be treated as belonging to
 * `C:/Music`, while both Windows and slash-normalized paths are accepted.
 */
export function isTrackWithinFolder(trackPath: string, folderPath: string): boolean {
  const normalizedTrack = trackPath.replace(/\\/g, '/').toLocaleLowerCase();
  const normalizedFolder = folderPath.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
  return normalizedTrack === normalizedFolder || normalizedTrack.startsWith(`${normalizedFolder}/`);
}

export function shouldStopPlaybackAfterFolderRemoval(
  currentTrack: Pick<{ id: string; path: string }, 'id' | 'path'> | null,
  removedFolderPath: string,
  remainingTracks: ReadonlyArray<Pick<{ id: string }, 'id'>>,
): boolean {
  return currentTrack !== null
    && isTrackWithinFolder(currentTrack.path, removedFolderPath)
    && !remainingTracks.some(track => track.id === currentTrack.id);
}
