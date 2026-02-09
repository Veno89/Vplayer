import React, { useState, useEffect } from 'react';
import { Music, FolderOpen, Search, Image, RefreshCw, FileAudio, Eye, Globe, Plus, Trash2, Loader } from 'lucide-react';
import { TauriAPI } from '../../services/TauriAPI';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../../store/useStore';
import { nativeConfirm } from '../../utils/nativeDialog';
import { SettingToggle, SettingSelect, SettingCard, SettingButton, SettingInfo, SettingDivider, SettingBadge } from './SettingsComponents';

interface LibraryFolder {
  id: string;
  path: string;
  name: string;
  dateAdded: number;
  track_count: number;
}

export function LibraryTab() {
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  
  // Get settings from store
  const autoScanOnStartup = useStore(state => state.autoScanOnStartup);
  const setAutoScanOnStartup = useStore(state => state.setAutoScanOnStartup);
  const watchFolderChanges = useStore(state => state.watchFolderChanges);
  const setWatchFolderChanges = useStore(state => state.setWatchFolderChanges);
  const duplicateSensitivity = useStore(state => state.duplicateSensitivity);
  const setDuplicateSensitivity = useStore(state => state.setDuplicateSensitivity);
  
  // New settings
  const showHiddenFiles = useStore(state => state.showHiddenFiles);
  const setShowHiddenFiles = useStore(state => state.setShowHiddenFiles);
  const metadataLanguage = useStore(state => state.metadataLanguage);
  const setMetadataLanguage = useStore(state => state.setMetadataLanguage);
  const albumArtSize = useStore(state => state.albumArtSize);
  const setAlbumArtSize = useStore(state => state.setAlbumArtSize);
  const autoFetchAlbumArt = useStore(state => state.autoFetchAlbumArt);
  const setAutoFetchAlbumArt = useStore(state => state.setAutoFetchAlbumArt);

  useEffect(() => {
    loadLibraryInfo();
  }, []);

  const loadLibraryInfo = async () => {
    try {
      setLoading(true);
      // get_all_folders returns [(id, path, name, date_added), ...]
      const folders = await TauriAPI.getAllFolders().catch(() => []);
      // Get all tracks to count them
      const tracks = await TauriAPI.getAllTracks().catch(() => []);
      
      // Transform folders to include track count
      const foldersWithCounts = folders.map(([id, path, name, dateAdded]) => {
        const folderTracks = tracks.filter(t => t.folder_id === id);
        return {
          id,
          path,
          name,
          dateAdded,
          track_count: folderTracks.length
        };
      });
      
      setLibraryFolders(foldersWithCounts);
      setTrackCount(tracks.length);
    } catch (err) {
      console.error('Failed to load library info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder'
      });
      if (selected) {
        setScanning(true);
        await TauriAPI.scanFolder(selected);
        await loadLibraryInfo();
      }
    } catch (err) {
      console.error('Failed to add folder:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleRemoveFolder = async (folder: LibraryFolder) => {
    const path = typeof folder === 'object' ? folder.path : folder;
    const folderId = typeof folder === 'object' ? folder.id : null;
    if (!await nativeConfirm(`Remove "${path}" from library? Files will not be deleted.`)) return;
    try {
      if (folderId) {
        await TauriAPI.removeFolder(folderId, path);
      }
      await loadLibraryInfo();
    } catch (err) {
      console.error('Failed to remove folder:', err);
    }
  };

  const handleRescan = async () => {
    try {
      setScanning(true);
      // Rescan each folder
      for (const folder of libraryFolders) {
        const path = typeof folder === 'object' ? folder.path : folder;
        await TauriAPI.scanFolder(path).catch(err => {
          console.warn(`Failed to scan ${path}:`, err);
        });
      }
      await loadLibraryInfo();
    } catch (err) {
      console.error('Failed to rescan:', err);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Library Folders */}
      <SettingCard title="Music Folders" icon={FolderOpen} accent="amber">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500">
            Add folders containing your music collection
          </p>
          <button
            onClick={handleAddFolder}
            onMouseDown={e => e.stopPropagation()}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all hover:scale-105"
          >
            <Plus className="w-3 h-3" />
            Add Folder
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading library info...</span>
          </div>
        ) : libraryFolders.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl">
            <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No folders added yet</p>
            <p className="text-slate-600 text-xs mt-1">Add a folder to start building your library</p>
          </div>
        ) : (
          <div className="space-y-2">
            {libraryFolders.map((folder, idx) => (
              <div
                key={folder.id || idx}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 group"
              >
                <FolderOpen className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {folder.name || folder.path?.split(/[/\\]/).pop()}
                  </p>
                  <p className="text-slate-500 text-xs truncate">
                    {folder.path}
                  </p>
                </div>
                {folder.track_count !== undefined && (
                  <SettingBadge variant="primary">{folder.track_count} tracks</SettingBadge>
                )}
                <button
                  onClick={() => handleRemoveFolder(folder)}
                  onMouseDown={e => e.stopPropagation()}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Library stats */}
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <SettingInfo 
              label="Total Tracks" 
              value={trackCount.toLocaleString()} 
              icon={FileAudio} 
            />
            <SettingButton
              label={scanning ? "Scanning..." : "Rescan Library"}
              onClick={handleRescan}
              icon={RefreshCw}
              variant="default"
              loading={scanning}
            />
          </div>
        </div>
      </SettingCard>

      {/* Scanning Options */}
      <SettingCard title="Scanning" icon={Search} accent="cyan">
        <SettingToggle
          label="Auto-scan on Startup"
          description="Automatically check for new music when the app launches"
          checked={autoScanOnStartup}
          onChange={setAutoScanOnStartup}
          icon={RefreshCw}
        />
        
        <SettingToggle
          label="Watch Folder Changes"
          description="Automatically detect when files are added, removed, or modified"
          checked={watchFolderChanges}
          onChange={setWatchFolderChanges}
          icon={Eye}
        />
        
        <SettingToggle
          label="Include Hidden Files"
          description="Scan files and folders that start with a dot (.)"
          checked={showHiddenFiles}
          onChange={setShowHiddenFiles}
        />
        
        <SettingSelect
          label="Duplicate Detection"
          description="How strictly to identify potential duplicate tracks"
          value={duplicateSensitivity}
          onChange={v => setDuplicateSensitivity(v as 'low' | 'medium' | 'high')}
          options={[
            { value: 'low', label: 'Low - Exact file matches only' },
            { value: 'medium', label: 'Medium - Similar title & artist' },
            { value: 'high', label: 'High - Fuzzy matching (may have false positives)' },
          ]}
        />
      </SettingCard>

      {/* Metadata & Album Art */}
      <SettingCard title="Metadata & Album Art" icon={Image} accent="pink">
        <SettingToggle
          label="Auto-fetch Missing Album Art"
          description="Download album covers from online sources when not embedded in files"
          checked={autoFetchAlbumArt}
          onChange={setAutoFetchAlbumArt}
          icon={Image}
        />
        
        <SettingSelect
          label="Album Art Size"
          description="Resolution for cached album artwork thumbnails"
          value={albumArtSize}
          onChange={v => setAlbumArtSize(v as 'small' | 'medium' | 'large')}
          options={[
            { value: 'small', label: 'Small (128px) - Faster, less storage' },
            { value: 'medium', label: 'Medium (256px) - Balanced' },
            { value: 'large', label: 'Large (512px) - Best quality' },
          ]}
        />
        
        <SettingSelect
          label="Preferred Metadata Language"
          description="Language preference for artist/album names when multiple are available"
          value={metadataLanguage}
          onChange={setMetadataLanguage}
          icon={Globe}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ja', label: 'Japanese (日本語)' },
            { value: 'ko', label: 'Korean (한국어)' },
            { value: 'zh', label: 'Chinese (中文)' },
            { value: 'original', label: 'Original (as tagged)' },
          ]}
        />
      </SettingCard>
    </div>
  );
}
