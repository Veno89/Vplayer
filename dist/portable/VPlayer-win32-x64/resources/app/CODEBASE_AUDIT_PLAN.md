# VPlayer Codebase Audit & Refactor Plan

## Summary
This document details a deep audit of the VPlayer codebase after the refactoring of `VPlayer.jsx`. It identifies missing files/exports, duplicate/conflicting files, obsolete files, and violations of DRY, SOLID, and KISS principles. A phased plan and actionable todo list are provided for remediation.

---

## Findings

### 1. Missing Files, Exports, or Functions
- **Multiple Window Components:** There are duplicate window components in both `src/` and `src/windows/` (e.g., `PlaylistWindow.jsx`, `LibraryWindow.jsx`, etc.). This causes confusion and possible import/export conflicts.
- **Unused/Redundant Imports:** `VPlayer.jsx` imports components from both `src/windows/` and `src/` (e.g., `PlaylistWindow`), but only one should exist and be used.
- **Context Usage:** Context providers and hooks are correctly defined, but some custom hooks (e.g., `useLibrary`, `useWindows`) are not fully integrated or exported for use in all relevant components.
- **Test Coverage:** Test files exist for hooks and main UI, but coverage for window components and utility functions is incomplete.

### 2. Duplicate/Conflicting Files or Functions
- **Window Components:** There are two sets of window components (e.g., `src/PlaylistWindow.jsx` and `src/windows/PlaylistWindow.jsx`). This is a major source of confusion and bugs.
- **Options/Visualizer/Equalizer/Library/Playlist Windows:** Each has a duplicate in both folders, with different props and UI logic.
- **Component Logic:** Some logic is duplicated between components and window files (e.g., track rendering, folder management).

### 3. Obsolete/Unused Files
- **Obsolete Window Files:** The window files in `src/` (not in `src/windows/`) are likely obsolete after refactoring. They should be removed if not referenced.
- **Redundant Test Files:** Some test files may reference obsolete logic or components.
- **Unused Utility Functions:** Some functions in `libraryUtils.js` are stubs or not used anywhere.

### 4. DRY, SOLID, KISS Violations
- **DRY:** Duplicate window components and repeated logic for rendering tracks/folders.
- **SOLID:** Some components have unclear responsibilities (e.g., window components mixing UI and state logic).
- **KISS:** The existence of multiple versions of the same component and unclear import paths makes the codebase harder to maintain and understand.

### 5. Other Issues
- **Tasks.json:** Contains duplicate tasks for running tests.
- **Imports:** Some imports in `VPlayer.jsx` and other files are unused or redundant.
- **State Management:** Some state is duplicated between context and hooks.

---

## Phased Plan of Attack

### Phase 1: Cleanup & Deduplication
- Remove obsolete window components from `src/` (keep only those in `src/windows/`).
- Remove duplicate tasks from `.vscode/tasks.json`.
- Remove unused imports and functions.

### Phase 2: Refactor & Consolidate
- Ensure all window components are imported from `src/windows/` only.
- Refactor window components to share common logic (e.g., track/folder rendering).
- Move shared logic to utility files or shared components.
- Update tests to cover only the active components.

### Phase 3: Principle Enforcement
- Review all components for DRY, SOLID, and KISS compliance.
- Simplify props and state management in window components.
- Document component responsibilities and usage.

### Phase 4: Final Testing & Documentation
- Run full test suite and add missing tests.
- Update README and code comments to reflect new structure.

---

## Actionable Todo List

1. **Remove obsolete window files from `src/`:**
   - `src/PlaylistWindow.jsx`
   - `src/LibraryWindow.jsx`
   - `src/EqualizerWindow.jsx`
   - `src/VisualizerWindow.jsx`
   - `src/OptionsWindow.jsx`
2. **Remove duplicate tasks from `.vscode/tasks.json`.**
3. **Update imports in `VPlayer.jsx` to use only `src/windows/` components.**
4. **Refactor window components to share logic via shared components/utilities.**
5. **Remove unused functions and imports throughout the codebase.**
6. **Update and add tests for active components only.**
7. **Review and refactor for DRY, SOLID, and KISS compliance.**
8. **Update documentation and README.**

---

## Next Steps
I will proceed with Phase 1: Cleanup & Deduplication, starting with obsolete file and duplicate task removal.
