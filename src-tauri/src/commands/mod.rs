// Command modules - split from main.rs for better organization
// Each module contains related Tauri commands

pub mod audio;
pub mod library;
pub mod playlist;
pub mod smart_playlist;
pub mod watcher;
pub mod effects;
pub mod visualizer;
pub mod lyrics;
pub mod replaygain;
pub mod cache;

// Re-export all commands for easy importing in main.rs
pub use audio::*;
pub use library::*;
pub use playlist::*;
pub use smart_playlist::*;
pub use watcher::*;
pub use effects::*;
pub use visualizer::*;
pub use lyrics::*;
pub use replaygain::*;
pub use cache::*;

// Explicit re-export of batch playlist command
pub use playlist::add_tracks_to_playlist;
