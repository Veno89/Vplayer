VPlayer Native Rewrite: Complete Implementation Guide for AI AgentProject Overview
Rewrite VPlayer music player from Electron + File System Access API to Tauri + Rust for native performance, proper file system access, and smaller bundle size. Keep existing React UI components and migrate to Tauri backend.Current Project State

Technology: React 18.2.0 + Electron + File System Access API
Problem: Blob/Data URLs don't work in Electron's file:// protocol, causing audio playback failures
Components to Keep: All React UI (windows, contexts, hooks, components)
Components to Replace: Electron main process, File System Access API, IndexedDB storage
Target Technology StackFrontend (Keep/Migrate)

React 18.2.0
Tailwind CSS
Lucide icons
React Window (virtualization)
Web Audio API (for visualizer/equalizer)
Backend (New)

Rust (latest stable)
Tauri 1.5+
Audio: rodio crate (playback)
Metadata: lofty crate (ID3 tags)
Database: rusqlite (library storage)
File system: walkdir crate (scanning)

Phase 1: Project Setup1.1 Install Prerequisites
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node dependencies for Tauri
npm install -D @tauri-apps/cli
npm install @tauri-apps/api

1.2 Initialize Tauri
npx tauri init

When prompted:

App name: VPlayer
Window title: VPlayer
Web assets location: ../dist
Dev server URL: http://localhost:5173
Frontend dev command: npm run dev
Frontend build command: npm run build

1.3 Update package.json Scripts
{
  "scripts": {
    "dev": "vite",
    "tauri:dev": "tauri dev",
    "build": "vite build",
    "tauri:build": "tauri build"
  }
}

1.4 Project Structure After Setup
vplayer/
├── src/                    # React frontend (existing)
│   ├── components/
│   ├── windows/
│   ├── context/
│   ├── hooks/
│   ├── utils/
│   └── VPlayer.jsx
├── src-tauri/              # Rust backend (new)
│   ├── src/
│   │   ├── main.rs
│   │   ├── audio.rs
│   │   ├── scanner.rs
│   │   ├── metadata.rs
│   │   └── database.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.js

Phase 2: Rust Backend - Audio System
[package]
name = "vplayer"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1.5", features = ["dialog-open", "fs-read-dir", "shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rodio = "0.17"
lofty = "0.18"
walkdir = "2"
rusqlite = { version = "0.30", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }

2.2 Create Audio Player Module (src-tauri/src/audio.rs)
use rodio::{Decoder, OutputStream, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct AudioPlayer {
    sink: Arc<Mutex<Sink>>,
    _stream: OutputStream,
    current_path: Arc<Mutex<Option<String>>>,
}

impl AudioPlayer {
    pub fn new() -> Result<Self, String> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| format!("Failed to create audio output: {}", e))?;
        
        let sink = Sink::try_new(&stream_handle)
            .map_err(|e| format!("Failed to create sink: {}", e))?;
        
        Ok(Self {
            sink: Arc::new(Mutex::new(sink)),
            _stream: stream,
            current_path: Arc::new(Mutex::new(None)),
        })
    }
    
    pub fn load(&self, path: String) -> Result<(), String> {
        let file = File::open(&path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Failed to decode audio: {}", e))?;
        
        let sink = self.sink.lock().unwrap();
        sink.clear();
        sink.append(source);
        sink.pause();
        
        *self.current_path.lock().unwrap() = Some(path);
        
        Ok(())
    }
    
    pub fn play(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.play();
        Ok(())
    }
    
    pub fn pause(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.pause();
        Ok(())
    }
    
    pub fn stop(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.stop();
        *self.current_path.lock().unwrap() = None;
        Ok(())
    }
    
    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        let clamped_volume = volume.max(0.0).min(1.0);
        sink.set_volume(clamped_volume);
        Ok(())
    }
    
    pub fn seek(&self, position: f64) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.try_seek(Duration::from_secs_f64(position))
            .map_err(|e| format!("Seek failed: {}", e))?;
        Ok(())
    }
    
    pub fn is_playing(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        !sink.is_paused()
    }
    
    pub fn is_finished(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.empty()
    }
    
    pub fn get_current_path(&self) -> Option<String> {
        self.current_path.lock().unwrap().clone()
    }
}

2.3 Create Scanner Module (src-tauri/src/scanner.rs)
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,
    pub date_added: i64,
}

pub struct Scanner;

impl Scanner {
    pub fn scan_directory(path: &str) -> Result<Vec<Track>, String> {
        let mut tracks = Vec::new();
        let audio_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];
        
        let walker = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file());
        
        for entry in walker {
            let path_buf = entry.path();
            
            if let Some(extension) = path_buf.extension() {
                if let Some(ext_str) = extension.to_str() {
                    if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        match Self::extract_track_info(path_buf) {
                            Ok(track) => tracks.push(track),
                            Err(e) => eprintln!("Failed to extract info from {:?}: {}", path_buf, e),
                        }
                    }
                }
            }
        }
        
        Ok(tracks)
    }
    
    fn extract_track_info(path: &Path) -> Result<Track, String> {
        use lofty::{Probe, Accessor, AudioFile};
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let tagged_file = Probe::open(path)
            .map_err(|e| e.to_string())?
            .read()
            .map_err(|e| e.to_string())?;
        
        let tags = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag());
        
        let title = tags.and_then(|t| t.title().map(|s| s.to_string()));
        let artist = tags.and_then(|t| t.artist().map(|s| s.to_string()));
        let album = tags.and_then(|t| t.album().map(|s| s.to_string()));
        
        let duration = tagged_file.properties().duration().as_secs_f64();
        
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();
        
        let path_str = path.to_string_lossy().to_string();
        let id = format!("track_{}", path_str.replace(['/', '\\'], "_"));
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        
        Ok(Track {
            id,
            path: path_str,
            name: file_name,
            title,
            artist,
            album,
            duration,
            date_added: now,
        })
    }
}

2.4 Create Database Module (src-tauri/src/database.rs)
use rusqlite::{Connection, Result, params};
use crate::scanner::Track;
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                title TEXT,
                artist TEXT,
                album TEXT,
                duration REAL NOT NULL,
                date_added INTEGER NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                date_added INTEGER NOT NULL
            )",
            [],
        )?;
        
        Ok(Self { conn })
    }
    
    pub fn add_track(&self, track: &Track) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO tracks (id, path, name, title, artist, album, duration, date_added)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &track.id,
                &track.path,
                &track.name,
                &track.title,
                &track.artist,
                &track.album,
                &track.duration,
                &track.date_added,
            ],
        )?;
        Ok(())
    }
    
    pub fn get_all_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, name, title, artist, album, duration, date_added FROM tracks"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn remove_tracks_by_folder(&self, folder_path: &str) -> Result<usize> {
        let count = self.conn.execute(
            "DELETE FROM tracks WHERE path LIKE ?1",
            params![format!("{}%", folder_path)],
        )?;
        Ok(count)
    }
    
    pub fn add_folder(&self, folder_id: &str, folder_path: &str, folder_name: &str, date_added: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO folders (id, path, name, date_added) VALUES (?1, ?2, ?3, ?4)",
            params![folder_id, folder_path, folder_name, date_added],
        )?;
        Ok(())
    }
    
    pub fn get_all_folders(&self) -> Result<Vec<(String, String, String, i64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, name, date_added FROM folders"
        )?;
        
        let folders = stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(folders)
    }
    
    pub fn remove_folder(&self, folder_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM folders WHERE id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }
}

2.5 Main Tauri Application (src-tauri/src/main.rs)
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod scanner;
mod database;

use audio::AudioPlayer;
use scanner::{Scanner, Track};
use database::Database;
use std::sync::Mutex;
use tauri::{State, Manager};

struct AppState {
    player: Mutex<AudioPlayer>,
    db: Mutex<Database>,
}

#[tauri::command]
fn load_track(path: String, state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.load(path)
}

#[tauri::command]
fn play_audio(state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.play()
}

#[tauri::command]
fn pause_audio(state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.pause()
}

#[tauri::command]
fn stop_audio(state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.stop()
}

#[tauri::command]
fn set_volume(volume: f32, state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.set_volume(volume)
}

#[tauri::command]
fn seek_to(position: f64, state: State<AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.seek(position)
}

#[tauri::command]
fn is_playing(state: State<AppState>) -> bool {
    let player = state.player.lock().unwrap();
    player.is_playing()
}

#[tauri::command]
async fn scan_folder(folder_path: String, state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    let tracks = Scanner::scan_directory(&folder_path)?;
    
    // Save tracks to database
    let db = state.db.lock().unwrap();
    for track in &tracks {
        db.add_track(track).map_err(|e| e.to_string())?;
    }
    
    // Save folder info
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    
    let folder_id = format!("folder_{}", now);
    let folder_name = std::path::Path::new(&folder_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&folder_path)
        .to_string();
    
    db.add_folder(&folder_id, &folder_path, &folder_name, now)
        .map_err(|e| e.to_string())?;
    
    Ok(tracks)
}

#[tauri::command]
fn get_all_tracks(state: State<AppState>) -> Result<Vec<Track>, String> {
    let db = state.db.lock().unwrap();
    db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_folder(folder_id: String, folder_path: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.remove_tracks_by_folder(&folder_path).map_err(|e| e.to_string())?;
    db.remove_folder(&folder_id).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize audio player
            let player = AudioPlayer::new()?;
            
            // Initialize database
            let app_dir = app.path_resolver()
                .app_data_dir()
                .ok_or("Failed to get app data dir")?;
            
            std::fs::create_dir_all(&app_dir)
                .map_err(|e| e.to_string())?;
            
            let db_path = app_dir.join("vplayer.db");
            let db = Database::new(&db_path)
                .map_err(|e| e.to_string())?;
            
            // Store state
            app.manage(AppState {
                player: Mutex::new(player),
                db: Mutex::new(db),
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_track,
            play_audio,
            pause_audio,
            stop_audio,
            set_volume,
            seek_to,
            is_playing,
            scan_folder,
            get_all_tracks,
            remove_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

Phase 3: Frontend Integration
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export function useAudioTauri({ onEnded, onTimeUpdate, initialVolume = 1.0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  
  const progressIntervalRef = useRef(null);
  const currentTrackRef = useRef(null);

  // Update progress periodically when playing
  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 0.1;
          if (newProgress >= duration && duration > 0) {
            setIsPlaying(false);
            onEnded?.();
            return 0;
          }
          onTimeUpdate?.(newProgress);
          return newProgress;
        });
      }, 100);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, duration, onEnded, onTimeUpdate]);

  const loadTrack = useCallback(async (track) => {
    try {
      setIsLoading(true);
      await invoke('load_track', { path: track.path });
      currentTrackRef.current = track;
      setDuration(track.duration);
      setProgress(0);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load track:', err);
      setIsLoading(false);
    }
  }, []);

  const play = useCallback(async () => {
    try {
      await invoke('play_audio');
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to play:', err);
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      await invoke('pause_audio');
      setIsPlaying(false);
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke('stop_audio');
      setIsPlaying(false);
      setProgress(0);
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  }, []);

  const changeVolume = useCallback(async (newVolume) => {
    try {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      await invoke('set_volume', { volume: clampedVolume });
      setVolume(clampedVolume);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  }, []);

  const seek = useCallback(async (position) => {
    try {
      await invoke('seek_to', { position });
      setProgress(position);
    } catch (err) {
      console.error('Failed to seek:', err);
    }
  }, []);

  return {
    isPlaying,
    isLoading,
    progress,
    duration,
    volume,
    loadTrack,
    play,
    pause,
    stop,
    changeVolume,
    seek,
  };
}

3.2 Create Tauri Library Hook (src/hooks/useLibraryTauri.js)
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';

export function useLibraryTauri() {
  const [tracks, setTracks] = useState([]);
  const [libraryFolders, setLibraryFolders] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');

  // Load tracks from database on mount
  useEffect(() => {
    loadAllTracks();
  }, []);

  const loadAllTracks = async () => {
    try {
      const dbTracks = await invoke('get_all_tracks');
      setTracks(dbTracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const addFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });

      if (!selected) return 0;

      setIsScanning(true);
      setScanProgress(0);

      const newTracks = await invoke('scan_folder', { folderPath: selected });
      
      setTracks(prev => {
        const existing = new Set(prev.map(t => t.id));
        const filtered = newTracks.filter(t => !existing.has(t.id));
        return [...prev, ...filtered];
      });

      const folderName = selected.split(/[\\/]/).pop();
      setLibraryFolders(prev => [...prev, {
        id: `folder_${Date.now()}`,
        path: selected,
        name: folderName,
        dateAdded: Date.now(),
      }]);

      setIsScanning(false);
      setScanProgress(100);

      return newTracks.length;
    } catch (err) {
      console.error('Failed to add folder:', err);
      setIsScanning(false);
      return 0;
    }
  }, []);

  const removeFolder = useCallback(async (folderId, folderPath) => {
    try {
      await invoke('remove_folder', { folderId, folderPath });
      setTracks(prev => prev.filter(t => !t.path.startsWith(folderPath)));
      setLibraryFolders(prev => prev.filter(f => f.id !== folderId));
      return 0;
    } catch (err) {
      console.error('Failed to remove folder:', err);
      throw err;
    }
  }, []);

  const removeTrack = useCallback((trackId) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, []);

  // Filter and sort tracks
  let filteredTracks = [...tracks];

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredTracks = filteredTracks.filter(t =>
      t.title?.toLowerCase().includes(query) ||
      t.artist?.toLowerCase().includes(query) ||
      t.album?.toLowerCase().includes(query) ||
      t.name?.toLowerCase().includes(query)
    );
  }

  filteredTracks.sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal?.toLowerCase() || '';
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return {
    tracks,
    libraryFolders,
    isScanning,
    scanProgress,
    searchQuery,
    sortBy,
    sortOrder,
    addFolder,
    removeFolder,
    removeTrack,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    filteredTracks,
  };
}

3.3 Update VPlayer.jsx to Use Tauri Hooks
Replace the existing audio and library hooks:
// In VPlayer.jsx, replace:
import { useAudio } from './hooks/useAudio';
import { useLibraryContext } from './context/LibraryContext';

// With:
import { useAudioTauri } from './hooks/useAudioTauri';
import { useLibraryTauri } from './hooks/useLibraryTauri';

// Then in VPlayerInner component, replace:
const audio = useAudio({...});
const { tracks, addFolder, ... } = useLibraryContext();

// With:
const audio = useAudioTauri({...});
const library = useLibraryTauri();
const { tracks, addFolder, filteredTracks, ... } = library;

3.4 Update Track Loading Logic
// In VPlayer.jsx, replace the loadTrack effect with:
useEffect(() => {
  if (currentTrack !== null && filteredTracks[currentTrack]) {
    const track = filteredTracks[currentTrack];
    audio.loadTrack(track).then(() => {
      if (playing) {
        audio.play();
      }
    });
  }
}, [currentTrack, filteredTracks, audio, playing]);

Phase 4: Remove Electron Dependencies
4.1 Clean Up package.json
{
  "scripts": {
    "dev": "vite",
    "tauri:dev": "tauri dev",
    "build": "vite build",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "jsmediatags": "REMOVE",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-window": "^1.8.7",
    "lucide-react": "^0.278.0"
  },
  "devDependencies": {
    "@tauri-apps/api": "^1.5.0",
    "@tauri-apps/cli": "^1.5.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.24",
    "tailwindcss": "^3.4.7",
    "vite": "^5.1.0"
  }
}

4.2 Delete Electron Files
rm -rf electron/
rm -rf node_modules/electron
rm -rf node_modules/electron-builder

4.3 Remove Old Hooks/Storage
Delete or deprecate:
src/hooks/useLibrary.js (replaced by useLibraryTauri)
src/hooks/useAudio.js (replaced by useAudioTauri)
src/storage/idb.js (no longer needed)
src/utils/libraryUtils.js (logic moved to Rust)

Phase 5: Build and Test
5.1 Development Testing
npm install
npm run tauri:dev

5.2 Production Build
npm run tauri:build

Output will be in src-tauri/target/release/bundle/

Phase 6: Advanced Features (Continued)6.1 Audio Progress Tracking (Real-time Position)The current implementation estimates progress. For accurate position tracking, enhance the audio module:Update src-tauri/src/audio.rs:
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub struct AudioPlayer {
    sink: Arc<Mutex<Sink>>,
    _stream: OutputStream,
    current_path: Arc<Mutex<Option<String>>>,
    start_time: Arc<Mutex<Option<Instant>>>,
    paused_duration: Arc<Mutex<Duration>>,
    pause_start: Arc<Mutex<Option<Instant>>>,
}

impl AudioPlayer {
    pub fn new() -> Result<Self, String> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| format!("Failed to create audio output: {}", e))?;
        
        let sink = Sink::try_new(&stream_handle)
            .map_err(|e| format!("Failed to create sink: {}", e))?;
        
        Ok(Self {
            sink: Arc::new(Mutex::new(sink)),
            _stream: stream,
            current_path: Arc::new(Mutex::new(None)),
            start_time: Arc::new(Mutex::new(None)),
            paused_duration: Arc::new(Mutex::new(Duration::ZERO)),
            pause_start: Arc::new(Mutex::new(None)),
        })
    }
    
    pub fn play(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.play();
        
        // Handle resume from pause
        if let Some(pause_start) = self.pause_start.lock().unwrap().take() {
            let pause_duration = pause_start.elapsed();
            *self.paused_duration.lock().unwrap() += pause_duration;
        } else {
            // Starting fresh
            *self.start_time.lock().unwrap() = Some(Instant::now());
            *self.paused_duration.lock().unwrap() = Duration::ZERO;
        }
        
        Ok(())
    }
    
    pub fn pause(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.pause();
        *self.pause_start.lock().unwrap() = Some(Instant::now());
        Ok(())
    }
    
    pub fn get_position(&self) -> f64 {
        if let Some(start) = *self.start_time.lock().unwrap() {
            let elapsed = start.elapsed();
            let paused = *self.paused_duration.lock().unwrap();
            let playing_time = elapsed - paused;
            playing_time.as_secs_f64()
        } else {
            0.0
        }
    }
    
    pub fn seek(&self, position: f64) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.try_seek(Duration::from_secs_f64(position))
            .map_err(|e| format!("Seek failed: {}", e))?;
        
        // Reset timing
        *self.start_time.lock().unwrap() = Some(Instant::now());
        *self.paused_duration.lock().unwrap() = Duration::from_secs_f64(position);
        
        Ok(())
    }
}

Add Tauri command for position:
#[tauri::command]
fn get_position(state: State<AppState>) -> f64 {
    let player = state.player.lock().unwrap();
    player.get_position()
}

Update frontend hook:
// In useAudioTauri.js
useEffect(() => {
  if (isPlaying) {
    progressIntervalRef.current = setInterval(async () => {
      try {
        const pos = await invoke('get_position');
        setProgress(pos);
        onTimeUpdate?.(pos);
        
        if (pos >= duration && duration > 0) {
          setIsPlaying(false);
          onEnded?.();
        }
      } catch (err) {
        console.error('Failed to get position:', err);
      }
    }, 100);
  } else {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
  }
  
  return () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
  };
}, [isPlaying, duration, onEnded, onTimeUpdate]);

6.2 Equalizer SupportCreate equalizer module (src-tauri/src/equalizer.rs):
use std::sync::{Arc, Mutex};

pub struct EqualizerBand {
    pub frequency: f32,
    pub gain: f32,
    pub q: f32,
}

pub struct Equalizer {
    bands: Arc<Mutex<Vec<EqualizerBand>>>,
}

impl Equalizer {
    pub fn new() -> Self {
        let default_bands = vec![
            EqualizerBand { frequency: 60.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 170.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 310.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 600.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 1000.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 3000.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 6000.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 12000.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 14000.0, gain: 0.0, q: 1.0 },
            EqualizerBand { frequency: 16000.0, gain: 0.0, q: 1.0 },
        ];
        
        Self {
            bands: Arc::new(Mutex::new(default_bands)),
        }
    }
    
    pub fn set_band_gain(&self, index: usize, gain: f32) -> Result<(), String> {
        let mut bands = self.bands.lock().unwrap();
        if index < bands.len() {
            bands[index].gain = gain.max(-12.0).min(12.0);
            Ok(())
        } else {
            Err("Invalid band index".to_string())
        }
    }
    
    pub fn get_bands(&self) -> Vec<EqualizerBand> {
        self.bands.lock().unwrap().clone()
    }
    
    pub fn reset(&self) {
        let mut bands = self.bands.lock().unwrap();
        for band in bands.iter_mut() {
            band.gain = 0.0;
        }
    }
}

Note: For actual audio filtering, you'll need to integrate with a DSP library like biquad or use rodio's filter capabilities. The above provides the state management structure.6.3 Playlist ManagementAdd to database.rs:
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistTrack {
    pub playlist_id: String,
    pub track_id: String,
    pub position: i32,
}

impl Database {
    pub fn create_playlist(&self, name: &str) -> Result<String> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        
        let id = format!("playlist_{}", now);
        
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id),
                FOREIGN KEY (track_id) REFERENCES tracks(id),
                PRIMARY KEY (playlist_id, track_id)
            )",
            [],
        )?;
        
        self.conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![&id, name, now],
        )?;
        
        Ok(id)
    }
    
    pub fn add_track_to_playlist(&self, playlist_id: &str, track_id: &str) -> Result<()> {
        // Get next position
        let position: i32 = self.conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;
        
        self.conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, position],
        )?;
        
        Ok(())
    }
    
    pub fn get_playlist_tracks(&self, playlist_id: &str) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.path, t.name, t.title, t.artist, t.album, t.duration, t.date_added
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position"
        )?;
        
        let tracks = stmt.query_map(params![playlist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                title: row.get(3)?,
                artist: row.get(4)?,
                album: row.get(5)?,
                duration: row.get(6)?,
                date_added: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(tracks)
    }
    
    pub fn get_all_playlists(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, created_at FROM playlists"
        )?;
        
        let playlists = stmt.query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
        
        Ok(playlists)
    }
    
    pub fn delete_playlist(&self, playlist_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        
        self.conn.execute(
            "DELETE FROM playlists WHERE id = ?1",
            params![playlist_id],
        )?;
        
        Ok(())
    }
}

Add Tauri commands:
#[tauri::command]
fn create_playlist(name: String, state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    db.create_playlist(&name).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_to_playlist(playlist_id: String, track_id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.add_track_to_playlist(&playlist_id, &track_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_playlist_tracks(playlist_id: String, state: State<AppState>) -> Result<Vec<Track>, String> {
    let db = state.db.lock().unwrap();
    db.get_playlist_tracks(&playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_playlists(state: State<AppState>) -> Result<Vec<Playlist>, String> {
    let db = state.db.lock().unwrap();
    db.get_all_playlists().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_playlist(playlist_id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_playlist(&playlist_id).map_err(|e| e.to_string())
}

6.4 Keyboard Shortcuts
Update src-tauri/Cargo.toml:
[dependencies]
tauri = { version = "1.5", features = ["dialog-open", "fs-read-dir", "shell-open", "global-shortcut"] }

Add to main.rs:
use tauri::GlobalShortcutManager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Previous setup code...
            
            // Register global shortcuts
            let mut shortcuts = app.global_shortcut_manager();
            
            shortcuts.register("Space", || {
                // Toggle play/pause
            })?;
            
            shortcuts.register("MediaPlayPause", || {
                // Toggle play/pause
            })?;
            
            shortcuts.register("MediaNextTrack", || {
                // Next track
            })?;
            
            shortcuts.register("MediaPrevTrack", || {
                // Previous track
            })?;
            
            shortcuts.register("CommandOrControl+L", || {
                // Focus search
            })?;
            
            Ok(())
        })
        // Rest of builder...
}

6.6 Drag & Drop Support
Update tauri.conf.json:
{
  "tauri": {
    "windows": [
      {
        "fileDropEnabled": true
      }
    ]
  }
}
Add file drop handler in main.rs:
use tauri::{Manager, Window};

#[tauri::command]
fn handle_file_drop(paths: Vec<String>, state: State<AppState>) -> Result<Vec<Track>, String> {
    let mut new_tracks = Vec::new();
    
    for path in paths {
        if std::path::Path::new(&path).is_dir() {
            // Scan directory
            let tracks = Scanner::scan_directory(&path)?;
            new_tracks.extend(tracks);
        } else if std::path::Path::new(&path).is_file() {
            // Add single file
            if let Ok(track) = Scanner::extract_track_info(std::path::Path::new(&path)) {
                new_tracks.push(track);
            }
        }
    }
    
    // Save to database
    let db = state.db.lock().unwrap();
    for track in &new_tracks {
        db.add_track(track).map_err(|e| e.to_string())?;
    }
    
    Ok(new_tracks)
}

Frontend integration:
// In VPlayer.jsx
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen('tauri://file-drop', async (event) => {
    try {
      const tracks = await invoke('handle_file_drop', { paths: event.payload });
      // Add tracks to library
      setTracks(prev => [...prev, ...tracks]);
    } catch (err) {
      console.error('Failed to handle drop:', err);
    }
  });
  
  return () => {
    unlisten.then(f => f());
  };
}, []);
6.7 Album Art Extraction
Update scanner.rs:
use lofty::Picture;
use base64::{Engine as _, engine::general_purpose};

pub fn extract_album_art(path: &Path) -> Option<String> {
    let tagged_file = Probe::open(path).ok()?.read().ok()?;
    
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag())?;
    
    let picture = tag.pictures().first()?;
    
    // Convert to base64 data URL
    let mime_type = picture.mime_type().as_str();
    let encoded = general_purpose::STANDARD.encode(picture.data());
    
    Some(format!("data:{};base64,{}", mime_type, encoded))
}

// Add to Track struct
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,
    pub date_added: i64,
    pub album_art: Option<String>,  // Base64 data URL
}
Update database schema:
conn.execute(
    "CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration REAL NOT NULL,
        date_added INTEGER NOT NULL,
        album_art TEXT
    )",
    [],
)?;
Phase 7: Performance Optimization
7.1 Async Scanning with Progress Updates
Update scanner to use channels:
use std::sync::mpsc::{channel, Sender};

pub fn scan_directory_with_progress(
    path: &str,
    progress_tx: Sender<ScanProgress>,
) -> Result<Vec<Track>, String> {
    let mut tracks = Vec::new();
    let audio_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac"];
    
    // First pass: count files
    let total_files = WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| audio_extensions.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .count();
    
    progress_tx.send(ScanProgress::Total(total_files)).ok();
    
    // Second pass: process files
    let mut processed = 0;
    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        if let Some(ext) = entry.path().extension() {
            if let Some(ext_str) = ext.to_str() {
                if audio_extensions.contains(&ext_str.to_lowercase().as_str()) {
                    match Self::extract_track_info(entry.path()) {
                        Ok(track) => {
                            tracks.push(track);
                            processed += 1;
                            let percent = (processed * 100) / total_files;
                            progress_tx.send(ScanProgress::Progress(percent as u32)).ok();
                        }
                        Err(e) => eprintln!("Failed to extract: {}", e),
                    }
                }
            }
        }
    }
    
    progress_tx.send(ScanProgress::Complete).ok();
    Ok(tracks)
}

#[derive(Debug)]
pub enum ScanProgress {
    Total(usize),
    Progress(u32),
    Complete,
}

Update Tauri command to emit events:
#[tauri::command]
async fn scan_folder(
    folder_path: String,
    window: Window,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let (tx, rx) = channel();
    
    let folder_path_clone = folder_path.clone();
    let scan_handle = tokio::task::spawn_blocking(move || {
        Scanner::scan_directory_with_progress(&folder_path_clone, tx)
    });
    
    // Forward progress to frontend
    tokio::spawn(async move {
        while let Ok(progress) = rx.recv() {
            match progress {
                ScanProgress::Total(total) => {
                    window.emit("scan-total", total).ok();
                }
                ScanProgress::Progress(percent) => {
                    window.emit("scan-progress", percent).ok();
                }
                ScanProgress::Complete => {
                    window.emit("scan-complete", ()).ok();
                    break;
                }
            }
        }
    });
    
    let tracks = scan_handle.await.map_err(|e| e.to_string())??;
    
    // Save to database
    let db = state.db.lock().unwrap();
    for track in &tracks {
        db.add_track(track).map_err(|e| e.to_string())?;
    }
    
    Ok(tracks)
}

Frontend listens for progress:
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlistenProgress = listen('scan-progress', (event) => {
    setScanProgress(event.payload);
  });
  
  const unlistenComplete = listen('scan-complete', () => {
    setIsScanning(false);
  });
  
  return () => {
    unlistenProgress.then(f => f());
    unlistenComplete.then(f => f());
  };
}, []);

7.2 Database Indexing
Add indices for faster queries:
impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // Create tables...
        
        // Add indices
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title)",
            [],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tracks_date_added ON tracks(date_added DESC)",
            [],
        )?;
        
        Ok(Self { conn })
    }
}

7.3 Memory-Mapped Audio Streaming
For very large files, use memory-mapped I/O:
use memmap2::Mmap;

pub fn load_large_file(path: &Path) -> Result<Decoder<impl Read>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mmap = unsafe { Mmap::map(&file).map_err(|e| e.to_string())? };
    let cursor = std::io::Cursor::new(mmap);
    Decoder::new(cursor).map_err(|e| e.to_string())
}

Phase 8: Distribution
8.1 Update tauri.conf.json for Production
{
  "package": {
    "productName": "VPlayer",
    "version": "1.0.0"
  },
  "build": {
    "distDir": "../dist",
    "devPath": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "tauri": {
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.vplayer.app",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": ""
      },
      "macOS": {
        "entitlements": null,
        "exceptionDomain": "",
        "frameworks": [],
        "providerShortName": null,
        "signingIdentity": null
      },
      "deb": {
        "depends": []
      }
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "title": "VPlayer",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": true
      }
    ]
  }
}
8.2 Build Commands
# Development
npm run tauri:dev

# Production builds
npm run tauri:build

# Platform-specific
npm run tauri:build -- --target x86_64-pc-windows-msvc  # Windows
Testing Checklist
Functionality Tests

 Add folder and scan tracks
 Play/pause/stop audio
 Volume control
 Seek through track
 Next/previous track
 Shuffle mode
 Repeat modes (off/all/one)
 Search tracks
 Sort tracks (by title/artist/album/date)
 Remove folder
 Remove individual track
 Create playlist
 Add tracks to playlist
 Delete playlist
 Visualizer works
 Equalizer controls
 Window drag/resize/minimize
 Keyboard shortcuts
 Drag & drop files/folders
 Album art displays
 Track metadata displays correctly
 Progress bar accurate
 Database persists between sessions

Performance Tests

 Scan 1000+ track folder completes
 Large file (100MB+) plays smoothly
 UI remains responsive during scan
 Memory usage stable during playback
 No audio stuttering
 Fast search on large library

Platform Tests

 Windows 10/11 build works
 macOS Intel build works
 macOS Apple Silicon build works
 Linux (Ubuntu/Fedora) build works

Troubleshooting Common Issues
Issue: "Failed to create audio output"
Solution: Ensure audio drivers are installed. On Linux, install libasound2-dev.
Issue: "Failed to decode audio"
Solution: Check if audio format is supported. Install codec pack or use supported formats.
Issue: Database locked
Solution: Close other instances of the app. Check file permissions on database file.
Issue: Can't find tracks after restart
Solution: Verify database path is correct. Check app data directory permissions.
Issue: High CPU during playback
Solution: Reduce visualizer update frequency. Check for memory leaks.
Final Notes

Estimated total development time: 6-8 weeks
Lines of Rust code: ~2,000-3,000
Lines of JavaScript/React: Keep existing (~5,000+)
Bundle size: 3-10MB (vs 100MB+ with Electron)
Memory usage: 50-100MB (vs 200-400MB with Electron)

This implementation provides a solid foundation for a native desktop music player with all the features of modern players like Foobar2000 or Winamp, while maintaining your existing React UI.