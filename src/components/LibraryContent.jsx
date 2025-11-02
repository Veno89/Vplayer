import React from 'react';

export const LibraryContent = React.memo(({ libraryFolders, tracksCount, isScanning, scanProgress, handleAddFolder, handleRemoveFolder, currentColors }) => {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Music Folders</h3>
        <div className="flex gap-2">
          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleAddFolder(); }}
            disabled={isScanning}
            className={`px-3 py-1 bg-blue-700 text-white text-xs rounded hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Add Folder
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {libraryFolders.length === 0 ? (
          <div className="text-slate-400 text-sm">No folders added yet.</div>
        ) : (
          libraryFolders.map((folder, idx) => (
            <div key={folder.path || idx} className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded">
              <span className="text-white text-xs font-medium truncate">{folder.path}</span>
              <span className="text-slate-400 text-xs">{folder.tracks} tracks</span>
              <span className="text-slate-500 text-xs">{folder.status}</span>
              <span className="text-slate-500 text-xs">{folder.dateAdded}</span>
              <button 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); handleRemoveFolder(folder.id, folder.path); }}
                disabled={isScanning}
                className="ml-2 px-2 py-1 bg-red-700 text-white text-xs rounded hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-4">
        <span className="text-slate-400 text-xs">Total tracks: {tracksCount}</span>
        {isScanning && (
          <span className="ml-4 text-blue-400 text-xs">Scanning... {scanProgress}%</span>
        )}
      </div>
    </div>
  );
});
