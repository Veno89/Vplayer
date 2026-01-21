import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Pause, Plus, Trash2, Edit3, Copy, Info, Star,
  Music, FolderOpen, ListPlus, Eye, EyeOff, ListEnd, RotateCcw
} from 'lucide-react';
import { TauriAPI } from '../services/TauriAPI';

export function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ x, y });

  // Update position when props change
  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let newX = x;
      let newY = y;

      // Horizontal check (right edge)
      if (newX + rect.width > window.innerWidth) {
        newX = Math.max(0, x - rect.width);
      }

      // Vertical check (bottom edge)
      if (newY + rect.height > window.innerHeight) {
        newY = Math.max(0, y - rect.height);
      }

      setPosition({ x: newX, y: newY });
    }
  }, [x, y, items]);

  useEffect(() => {
    // ... (existing handlers)
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    // ...
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Block scroll on body while menu is open to prevent detaching
    // or we can attach listener to reposition? For now, close on scroll.
    const handleScroll = () => {
      // Optional: Close on scroll?
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[10000] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-2 min-w-[200px] text-white"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: '400px',
        overflowY: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        // ... (existing items map)
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
    </div>,
    document.body
  );
}

// Track context menu items generator
// Track context menu items generator
export function getTrackContextMenuItems({
  track,
  onPlay,
  onAddToQueue,
  // onPlayNext removed
  onAddToPlaylist,
  onRemove,
  // onEditTags removed (merged into onShowInfo)
  onShowInfo,
  onSetRating,
  currentTrack,
  isPlaylist = false,
}) {
  const items = [
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
    // Only show "Add to Playlist" if NOT in a playlist
    !isPlaylist && {
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
      icon: Info,
      label: 'Track Info & Editor',
      onClick: onShowInfo, // Merged handler
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
      onClick: async () => {
        try {
          await TauriAPI.showInFolder(track.path);
        } catch (err) {
          console.error('Failed to show in folder:', err);
        }
      },
    },
    // Removed Reset Play Count
    {
      type: 'separator'
    },
    {
      icon: Trash2,
      label: isPlaylist ? 'Remove from Playlist' : 'Remove from Library',
      onClick: onRemove,
      danger: true,
    },
  ];

  return items.filter(Boolean); // Filter out false/null values
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
