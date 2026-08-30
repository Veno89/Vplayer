use log::error;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub struct FolderWatcher {
    watcher: Option<RecommendedWatcher>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl FolderWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            watcher: None,
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn start_watching<F>(&mut self, callback: F) -> Result<(), Box<dyn std::error::Error>>
    where
        F: Fn(PathBuf) + Send + 'static,
    {
        let (tx, rx): (_, Receiver<notify::Result<Event>>) = channel();

        let tx_clone = tx.clone();

        let watcher = notify::recommended_watcher(move |res| {
            let _ = tx_clone.send(res);
        })?;

        self.watcher = Some(watcher);
        let watched_paths = self.watched_paths.clone();

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
                    Ok(Ok(event)) => match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                            for path in event.paths {
                                if let Some(ext) = path.extension() {
                                    let ext_str = ext.to_string_lossy().to_lowercase();
                                    if crate::scanner::AUDIO_EXTENSIONS.contains(&ext_str.as_str())
                                    {
                                        pending.insert(path);
                                        last_event = Instant::now();
                                    }
                                }
                            }
                        }
                        _ => {}
                    },
                    Ok(Err(e)) => error!("Watch error: {:?}", e),
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                }

                // Flush batch once the debounce window has elapsed with no new events
                if !pending.is_empty() && last_event.elapsed() >= debounce {
                    let roots = watched_paths
                        .lock()
                        .unwrap_or_else(|error| error.into_inner())
                        .clone();
                    let mut changed_roots = HashSet::new();
                    for path in pending.drain() {
                        if let Some(root) = roots
                            .iter()
                            .filter(|root| path.starts_with(root))
                            .max_by_key(|root| root.components().count())
                        {
                            changed_roots.insert(root.clone());
                        }
                    }
                    for root in changed_roots {
                        callback(root);
                    }
                }
            }
        });

        Ok(())
    }

    pub fn add_path<P: AsRef<Path>>(&mut self, path: P) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        if self
            .watched_paths
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .contains(&path)
        {
            return Ok(());
        }

        if let Some(watcher) = &mut self.watcher {
            watcher.watch(&path, RecursiveMode::Recursive)?;

            let mut watched = self.watched_paths.lock().unwrap_or_else(|e| e.into_inner());
            watched.insert(path);
        }

        Ok(())
    }

    pub fn remove_path<P: AsRef<Path>>(
        &mut self,
        path: P,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let path = path.as_ref().to_path_buf();
        if !self
            .watched_paths
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .contains(&path)
        {
            return Ok(());
        }

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
