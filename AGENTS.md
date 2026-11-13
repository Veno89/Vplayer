# VPlayer agent instructions

- Rust owns audio playback and SQLite owns library truth; React/Zustand presents state through `src/services/TauriAPI.ts`. Avoid parallel UI-owned copies of authoritative data or direct component `invoke()` calls.
- Preserve the distinction between registered folders, persisted tracks, current filesystem state, and filtered UI counts when changing library behavior.
- Use `docs/readmeforai.md` for relevant module conventions, `docs/README.md` for architecture, and `docs/release.md` only for release work. Treat historical bug notes as leads, not current defects.