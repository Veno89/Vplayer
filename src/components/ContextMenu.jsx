import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Plus, Trash2, Edit3, Copy, Info, Star, 
  Music, FolderOpen, ListPlus, Eye, EyeOff 
} from 'lucide-react';

export function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-2 min-w-[200px]"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        maxHeight: '400px',
        overflowY: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={index} className="h-px bg-slate-700 my-2" />;
        }

        return (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick?.();
              onClose();
            }}
            disabled={item.disabled}
            className={`
              w-full flex items-center gap-3 px-4 py-2 text-sm text-left
              transition-colors
              ${item.disabled 
                ? 'text-slate-500 cursor-not-allowed' 
                : 'text-white hover:bg-slate-700 cursor-pointer'
              }
              ${item.danger ? 'hover:bg-red-600/20 hover:text-red-400' : ''}
            `}
          >
            {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-slate-500">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Track context menu items generator
export function getTrackContextMenuItems({ 
  track, 
  onPlay, 
  onAddToQueue, 
  onAddToPlaylist, 
  onRemove, 
  onEditTags, 
  onShowInfo,
  onSetRating,
  currentTrack,
}) {
  return [
    {
      icon: Play,
      label: 'Play Now',
      onClick: onPlay,
    },
    {
      icon: Plus,
      label: 'Add to Queue',
      onClick: onAddToQueue,
    },
    {
      icon: ListPlus,
      label: 'Add to Playlist...',
      onClick: onAddToPlaylist,
    },
    {
      type: 'separator'
    },
    {
      icon: Star,
      label: 'Set Rating...',
      onClick: onSetRating,
    },
    {
      icon: Edit3,
      label: 'Edit Tags',
      onClick: onEditTags,
    },
    {
      icon: Info,
      label: 'Show Info',
      onClick: onShowInfo,
    },
    {
      type: 'separator'
    },
    {
      icon: Copy,
      label: 'Copy File Path',
      onClick: () => {
        navigator.clipboard.writeText(track.path);
      },
    },
    {
      icon: FolderOpen,
      label: 'Show in Folder',
      onClick: () => {
        // Would need Tauri command to open file explorer
        console.log('Show in folder:', track.path);
      },
    },
    {
      type: 'separator'
    },
    {
      icon: Trash2,
      label: 'Remove from Library',
      onClick: onRemove,
      danger: true,
    },
  ];
}

// Playlist context menu items generator
export function getPlaylistContextMenuItems({
  playlist,
  onPlay,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  isActive,
}) {
  return [
    {
      icon: Play,
      label: 'Play Playlist',
      onClick: onPlay,
      disabled: playlist.trackCount === 0,
    },
    {
      type: 'separator'
    },
    {
      icon: Edit3,
      label: 'Rename',
      onClick: onRename,
    },
    {
      icon: Copy,
      label: 'Duplicate',
      onClick: onDuplicate,
    },
    {
      icon: FolderOpen,
      label: 'Export as M3U...',
      onClick: onExport,
    },
    {
      type: 'separator'
    },
    {
      icon: Trash2,
      label: 'Delete Playlist',
      onClick: onDelete,
      danger: true,
      disabled: isActive,
    },
  ];
}

// Folder context menu items generator
export function getFolderContextMenuItems({
  folder,
  onRescan,
  onRemove,
  onShowInExplorer,
}) {
  return [
    {
      icon: Music,
      label: 'Rescan Folder',
      onClick: onRescan,
    },
    {
      icon: FolderOpen,
      label: 'Show in Explorer',
      onClick: onShowInExplorer,
    },
    {
      type: 'separator'
    },
    {
      icon: Trash2,
      label: 'Remove from Library',
      onClick: onRemove,
      danger: true,
    },
  ];
}
