// Remove a folder and its tracks from the library
export function handleRemoveFolder(path, tracks, libraryFolders, setTracks, setLibraryFolders, setFolderPermissions, setWindows, setCurrentTrack, colorScheme) {
  const normalizedPath = normalizePath(path);
  try {
    const currentTracks = Array.isArray(tracks) ? tracks : [];
    const newTracks = currentTracks.filter((track) => {
      if (!track || !track.path) return true;
      const t = normalizePath(track.path);
      const tRoot = t.split('/')[0];
      if (tRoot === normalizedPath) return false;
      if (t.includes('/' + normalizedPath + '/')) return false;
      if (t === normalizedPath || t.startsWith(normalizedPath + '/')) return false;
      return true;
    });
    setTracks(newTracks);
    const newLibraryFolders = (Array.isArray(libraryFolders) ? libraryFolders : []).filter((folder) => normalizePath(folder.path) !== normalizedPath);
    setLibraryFolders(newLibraryFolders);
    try {
      // TODO: removeFolderHandle(path) should be called in the component if needed
    } catch (err) {
      console.warn('Failed to remove folder handle', err);
    }
    try {
      const serializableTracks = newTracks.map(t => { const { file, ...rest } = t || {}; return rest; });
      const state = {
        tracks: serializableTracks,
        libraryFolders: newLibraryFolders,
        colorScheme,
        windows: setWindows ? setWindows : {},
        currentTrack: (setCurrentTrack !== null && setCurrentTrack < serializableTracks.length) ? setCurrentTrack : (serializableTracks.length > 0 ? 0 : null)
      };
      localStorage.setItem('vplayer_state', JSON.stringify(state));
    } catch (err) {
      console.warn('Failed to persist state after removing folder', err);
    }
  } catch (err) {
    console.warn('Error during handleRemoveFolder cleanup', err);
  }
}

// Rescan all folders (stub)
export function handleRescanAll(libraryFolders) {
  if (libraryFolders.length === 0) {
    alert("No folders to scan. Please add a folder first.");
    return;
  }
  // TODO: Implement actual rescan logic. Currently just alerts user to re-add folders.
  alert("Please re-add your folders to rescan. Click 'Add Folder' to select directories again.");
}
// Utility functions for library management

export function normalizePath(p) {
  return (p || '').replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

export async function findFileInDir(dir, filename) {
  try {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file' && entry.name === filename) {
        return await entry.getFile();
      }
      if (entry.kind === 'directory') {
        const found = await findFileInDir(entry, filename);
        if (found) return found;
      }
    }
  } catch (err) {
    // ignore and continue
  }
  return null;
}

// Add more utility functions as needed

// Scan a single persisted handle and merge discovered files into tracks/libraryFolders
export async function scanHandleAndMerge(handle, setTracks, setLibraryFolders) {
  if (!handle) return 0;
  try {
    // Ensure we have permission to read
    if (handle.queryPermission && handle.requestPermission) {
      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') {
        console.warn('[VPlayer] permission not granted for handle', handle.name);
        return 0;
      }
    }
    const musicFiles = [];
    const findAndScan = async (dir, path = '') => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            const audioExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma', '.opus', '.webm'];
            const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            if (audioExtensions.includes(ext)) {
              let title = null, artist = null, album = null;
              try {
                const mod = await import('jsmediatags/dist/jsmediatags.min.js');
                const jm = (mod && (mod.default || mod));
                await new Promise((resolve) => {
                  jm.read(file, {
                    onSuccess: function(tag) {
                      const tags = tag.tags || {};
                      title = tags.title || null;
                      artist = tags.artist || null;
                      album = tags.album || null;
                      resolve();
                    },
                    onError: function() { resolve(); }
                  });
                });
              } catch (err) {}
              const fileName = file.name.substring(0, file.name.lastIndexOf('.'));
              const parts = fileName.split(' - ');
              // Extract duration using Audio object
              let durationStr = '0:00';
              try {
                durationStr = await new Promise((resolve) => {
                  const audio = document.createElement('audio');
                  audio.preload = 'metadata';
                  audio.src = URL.createObjectURL(file);
                  audio.onloadedmetadata = () => {
                    const dur = audio.duration;
                    if (!isNaN(dur) && dur > 0) {
                      const min = Math.floor(dur / 60);
                      const sec = Math.round(dur % 60).toString().padStart(2, '0');
                      resolve(`${min}:${sec}`);
                    } else {
                      resolve('0:00');
                    }
                    URL.revokeObjectURL(audio.src);
                  };
                  audio.onerror = () => {
                    resolve('0:00');
                    URL.revokeObjectURL(audio.src);
                  };
                });
              } catch (err) {
                durationStr = '0:00';
              }
              musicFiles.push({
                title: title || (parts.length > 1 ? parts[1].trim() : fileName),
                artist: artist || (parts.length > 1 ? parts[0].trim() : 'Unknown Artist'),
                duration: durationStr,
                album: album || 'Unknown Album',
                path: path + '/' + file.name,
                file: file
              });
            }
          } catch (err) {
            console.warn('Could not read file during scanHandleAndMerge:', err);
          }
        } else if (entry.kind === 'directory') {
          await findAndScan(entry, path + '/' + entry.name);
        }
      }
    };
    await findAndScan(handle, handle.name || '');
    if (musicFiles.length > 0) {
      setTracks(prev => {
        const map = new Map();
        (prev || []).forEach(t => { if (t && t.path) map.set(t.path, t); });
        (musicFiles || []).forEach(m => { if (m && m.path) map.set(m.path, m); });
        return Array.from(map.values());
      });
      setLibraryFolders(prev => {
        const existing = Array.isArray(prev) ? prev.slice() : [];
        const entry = { path: handle.name || 'unknown', tracks: musicFiles.length, status: 'Indexed', dateAdded: new Date().toLocaleDateString() };
        const idx = existing.findIndex(f => f && String(f.path) === String(entry.path));
        if (idx !== -1) { existing[idx] = entry; }
        else { existing.push(entry); }
        return existing;
      });
    }
    return musicFiles.length;
  } catch (err) {
    console.warn('[VPlayer] scanHandleAndMerge failed', err);
    return 0;
  }
}
