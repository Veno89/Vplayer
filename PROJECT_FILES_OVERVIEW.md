# VPlayer Project File Overview

This document provides a brief explanation of the purpose of each file and folder in the VPlayer project.

## Root Files
- `index.html`: Main HTML entry point for the app.
- `package.json`: Project metadata, dependencies, and scripts.
- `postcss.config.cjs`: PostCSS configuration for CSS processing.
- `README.md`: Project documentation and usage instructions.
- `tailwind.config.cjs`: Tailwind CSS configuration.
- `vite.config.js`: Vite build tool configuration.
- `vitest.config.js`: Vitest testing framework configuration.

## electron/
- `main.js`: Electron main process script, launches the desktop app.

## src/
- `App.jsx`: Main React app entry (may wrap VPlayer).
- `index.css`: Global CSS styles.
- `main.jsx`: React entry point, renders the app.
- `VPlayer.jsx`: Main UI logic, window management, context providers, and app orchestration.

### windows/
- `EqualizerWindow.jsx`: Floating window for audio equalizer controls.
- `LibraryWindow.jsx`: Floating window for managing music folders and library.
- `OptionsWindow.jsx`: Floating window for app options (color scheme, debug, etc.).
- `PlayerWindow.jsx`: Floating window for audio playback controls and track info.
- `PlaylistWindow.jsx`: Floating window for playlist management.
- `VisualizerWindow.jsx`: Floating window for audio visualizations.

### components/
- `LibraryContent.jsx`: UI for displaying and managing music folders.
- `PlaylistContent.jsx`: UI for displaying and managing playlists.
- `Row.jsx`: UI row for displaying individual track info in lists.
- `Window.jsx`: Generic floating window component for draggable/resizable windows.

### context/
- `LibraryContext.jsx`: React context for library state (tracks, folders, scanning).
- `PlayerContext.jsx`: React context for playback state (current track, playing, volume, etc.).
- `UIContext.jsx`: React context for UI state (windows, color scheme, debug panel).

### hooks/
- `useAudio.js`: Custom hook for audio playback, progress, and controls.
- `useAudio.test.js`: Tests for the useAudio hook.
- `useLibrary.js`: Custom hook for library state and persistence.
- `useLibrary.test.js`: Tests for the useLibrary hook.
- `useWindows.js`: Custom hook for floating window state and management.

### storage/
- `idb.js`: IndexedDB utility for persisting folder handles and state.

### test/
- `setupTests.js`: Test environment setup for React and Vitest.

### utils/
- `libraryUtils.js`: Utility functions for scanning folders, extracting metadata, and managing tracks.
- `libraryUtils.test.js`: Tests for libraryUtils functions.
- `libraryUtils.test.mjs`: Additional tests for libraryUtils (ESM format).

