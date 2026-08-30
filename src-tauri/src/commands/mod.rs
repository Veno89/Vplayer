// Command modules - split from main.rs for better organization
// Each module contains related Tauri commands

pub mod audio;
pub mod cache;
pub mod effects;
pub mod library;
pub mod library_maintenance;
pub mod library_scan;
pub mod library_tracks;
pub mod lyrics;
pub(crate) mod path_authority;
pub mod playlist;
pub mod replaygain;
pub mod smart_playlist;
pub mod tray;
pub mod visualizer;
pub mod watcher;

// Re-export all commands for easy importing in main.rs
pub use audio::*;
pub use cache::*;
pub use effects::*;
pub use library::*;
pub use lyrics::*;
pub use playlist::*;
pub use replaygain::*;
pub use smart_playlist::*;
pub use tray::*;
pub use visualizer::*;
pub use watcher::*;
