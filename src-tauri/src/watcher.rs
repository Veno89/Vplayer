use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, EventKind};
use std::sync::mpsc::{channel, Sender, Receiver};
use std::path::{Path, PathBuf};
use std::thread;
use std::sync::{Arc, Mutex};
use std::collections::HashSet;
use std::time::{Duration, Instant};
use log::error;

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

        // Spawn thread to handle file system events with debounced batching.
        // Accumulates changed paths over a 300ms window then fires the callback
        // once per path, preventing UI thrashing from rapid file-system bursts.
        thread::spawn(move || {
            let debounce = Duration::from_millis(300);
            let mut pending: HashSet<PathBuf> = HashSet::new();
            let mut last_event = Instant::now();

            loop {
                // Use a short recv timeout so we can flush the batch periodically
                match rx.recv_timeout(debounce) {
                    Ok(Ok(event)) => {
                        match event.kind {
                            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                                for path in event.paths {
                                    if let Some(ext) = path.extension() {
                                        let ext_str = ext.to_string_lossy().to_lowercase();
                                        if crate::scanner::AUDIO_EXTENSIONS.contains(&ext_str.as_str()) {
                                            pending.insert(path);
                                            last_event = Instant::now();
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Ok(Err(e)) => error!("Watch error: {:?}", e),
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                }

                // Flush batch once the debounce window has elapsed with no new events
                if !pending.is_empty() && last_event.elapsed() >= debounce {
                    for path in pending.drain() {
                        callback(path);
                    }
                }
            }
        });

        Ok(())
    }

    pub fn add_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        
        if let Some(watcher) = &mut self.watcher {
            watcher.watch(&path, RecursiveMode::Recursive)?;
            
            let mut watched = self.watched_paths.lock().unwrap_or_else(|e| e.into_inner());
            watched.insert(path);
        }
        
        Ok(())
    }

    pub fn remove_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        
        if let Some(watcher) = &mut self.watcher {
            watcher.unwatch(&path)?;
            
            let mut watched = self.watched_paths.lock().unwrap_or_else(|e| e.into_inner());
            watched.remove(&path);
        }
        
        Ok(())
    }

    pub fn get_watched_paths(&self) -> Vec<PathBuf> {
        let watched = self.watched_paths.lock().unwrap_or_else(|e| e.into_inner());
        watched.iter().cloned().collect()
    }
}
