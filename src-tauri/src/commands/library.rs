// Library commands — re-export barrel module.
//
// The actual implementations live in domain-specific sub-modules:
//   - library_scan.rs       — folder scanning (full & incremental)
//   - library_tracks.rs     — track CRUD, ratings, play counts, album art, tags, duplicates
//   - library_maintenance.rs — missing-file checks, show-in-folder, write-text-file, dedup folders

pub use super::library_scan::*;
pub use super::library_tracks::*;
pub use super::library_maintenance::*;

