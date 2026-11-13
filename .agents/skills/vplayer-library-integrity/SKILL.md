---
name: vplayer-library-integrity
description: Diagnose or change VPlayer library scans, missing-file checks, duplicate removal, folder removal, or stale track counts.
---

# VPlayer library integrity

Read the relevant library ownership notes in `docs/readmeforai.md`. The persisted SQLite library, filesystem, and React view can disagree for different reasons; establish which layer is wrong before changing it.

1. Trace the affected operation through `src/hooks/library`, `src/services/TauriAPI.ts`, `src-tauri/src/commands/library_*`, scanner/watcher code, and database queries. Check registered-root scope, path normalization, transaction boundaries, and refresh/invalidation of UI data.
2. Distinguish a missing file from an unregistered or orphan track, duplicate projection, stale cached list, and a filter-only count. Test empty, nested, renamed, removed, and case-variant paths where relevant.
3. Preserve user library data. For destructive repair or deduplication, inspect the existing backup and transaction path and make the before/after integrity report reviewable.
4. Cover the authoritative Rust behavior and the affected frontend refresh path with focused tests. Use the repository's existing frontend and native gates for the final validation; report any filesystem scenarios not exercised live.