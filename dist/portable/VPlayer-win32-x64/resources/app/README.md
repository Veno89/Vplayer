# VPlayer

Minimal Vite + React desktop music player, refactored for maintainability and test coverage.

Quick start (Windows PowerShell):

```powershell
npm install
npm run dev
```

Notes:
- The project uses Tailwind CSS. For browser use, the File System Access API ("Add Folder") works in Chromium-based browsers (Chrome, Edge) on localhost.
- The codebase now uses shared components for playlist and library rendering, with window logic consolidated in `src/windows/`.
- Test coverage includes hooks, shared components, and main UI. See `src/components/*.test.jsx` and `src/hooks/*.test.js`.
 
Packaging to Windows installer (MSI/NSIS)
---------------------------------------

To produce a Windows installer (MSI or NSIS) you can use the provided electron-builder config. Notes and prerequisites:

- The project uses `electron-builder` which can create NSIS installers out of the box. NSIS builds typically work without extra tools.
- To produce an MSI installer you must install the WiX Toolset (3.11 or newer) on your Windows machine and ensure its binaries are on your PATH. electron-builder uses WiX to produce MSI packages.

Prerequisites (on Windows):

1. Install Node.js and npm (you already have these).
2. Install WiX Toolset (for MSI builds): https://wixtoolset.org/releases/
	- Make sure `candle.exe` and `light.exe` are on your PATH.
3. (Optional) Install NSIS if you want custom NSIS builds (electron-builder can download NSIS automatically on Windows, but local installation is OK).

Build steps (PowerShell):

```powershell
cd C:\Users\Zhitn\Desktop\Vplayer
npm install        # installs dependencies
npm run build      # produces the static renderer in dist/
npm test           # runs the full test suite
npm run package    # runs electron-builder and creates installer(s)
```

Notes about common failures:

- If `npm run package` fails complaining about missing `candle.exe`/`light.exe`, install WiX and re-run.
- If you see permission or cache errors when running Electron in dev, try running PowerShell as Administrator or ensure your TEMP/TMP directories are writable.

If you want, I can attempt a package build here and report errors (most likely the environment lacks WiX). If you prefer, I can instead generate a portable ZIP/NSIS build first and then help you install WiX locally to create an MSI.

## Codebase Structure

- `src/windows/` — All window components (Playlist, Library, Equalizer, Visualizer, Options)
- `src/components/` — Shared UI components (Row, PlaylistContent, LibraryContent)
- `src/context/` — React context providers for Player, Library, UI
- `src/hooks/` — Custom hooks for state and logic
- `src/utils/` — Utility functions for library management
- `src/__tests__/` — Main UI tests
- `src/components/*.test.jsx` — Component tests
- `src/hooks/*.test.js` — Hook tests

## Principles

The codebase is refactored for:
- DRY: Shared logic/components
- SOLID: Clear responsibilities
- KISS: Simple, maintainable structure

## Contributing

Run `npm test` before submitting changes. Add tests for new components or logic.

Troubleshooting packaging errors
------------------------------

Common issues and fixes when running `npm run package` on Windows:

- Permission / symlink errors while electron-builder extracts helper tools:
	- Run PowerShell as Administrator and re-run `npm run package`.
	- Alternatively, enable Developer Mode in Windows Settings > Update & Security > For developers — this allows creating symlinks without elevated privileges.

- Missing WiX tooling for MSI builds:
	- Install WiX Toolset (https://wixtoolset.org/releases/) and ensure `candle.exe` and `light.exe` are available on PATH.

- If you only need a quick test installer, build the NSIS installer first (electron-builder will usually produce NSIS without WiX):

```powershell
npm run build
npx electron-builder --win nsis
```

If you want, I can try to run the packaging here (I already attempted and reported the extractor privilege error). If you prefer I can continue making config changes to reduce friction (for instance: add a custom icon, add a `prepack` hook, or create a portable zip), tell me which you'd like.
