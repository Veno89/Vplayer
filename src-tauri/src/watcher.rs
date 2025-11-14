use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, EventKind};
use std::sync::mpsc::{channel, Sender, Receiver};
use std::path::{Path, PathBuf};
use std::thread;
use std::sync::{Arc, Mutex};
use std::collections::HashSet;

pub struct FolderWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    tx: Option<Sender<notify::Result<Event>>>,
}

impl FolderWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            watcher: None,
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
            tx: None,
        })
    }

    pub fn start_watching<F>(&mut self, callback: F) -> Result<(), Box<dyn std::error::Error>>
    where
        F: Fn(PathBuf) + Send + 'static,
    {
        let (tx, rx): (Sender<notify::Result<Event>>, Receiver<notify::Result<Event>>) = channel();
        
        // Clone tx before moving into closure
        let tx_clone = tx.clone();
        
        let watcher = notify::recommended_watcher(move |res| {
            let _ = tx_clone.send(res);
        })?;

        // Store tx for adding watched paths later
        self.tx = Some(tx);
        self.watcher = Some(watcher);

        // Spawn thread to handle file system events
        thread::spawn(move || {
            for res in rx {
                match res {
                    Ok(event) => {
                        // Filter for file creation, modification, and deletion
                        match event.kind {
                            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                                for path in event.paths {
                                    // Check if it's an audio file
                                    if let Some(ext) = path.extension() {
                                        let ext_str = ext.to_string_lossy().to_lowercase();
                                        if matches!(ext_str.as_str(), "mp3" | "flac" | "ogg" | "wav" | "aac" | "m4a" | "wma" | "opus") {
                                            callback(path.clone());
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Err(e) => eprintln!("Watch error: {:?}", e),
                }
            }
        });

        Ok(())
    }

    pub fn add_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        
        if let Some(watcher) = &mut self.watcher {
            watcher.watch(&path, RecursiveMode::Recursive)?;
            
            let mut watched = self.watched_paths.lock().unwrap();
            watched.insert(path);
        }
        
        Ok(())
    }

    pub fn remove_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        
        if let Some(watcher) = &mut self.watcher {
            watcher.unwatch(&path)?;
            
            let mut watched = self.watched_paths.lock().unwrap();
            watched.remove(&path);
        }
        
        Ok(())
    }

    pub fn get_watched_paths(&self) -> Vec<PathBuf> {
        let watched = self.watched_paths.lock().unwrap();
        watched.iter().cloned().collect()
    }
}
