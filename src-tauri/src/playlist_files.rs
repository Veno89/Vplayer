use crate::scanner::Track;
use serde::Serialize;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Missing,
    RootUnavailable,
    Inaccessible,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistFileIssue {
    pub track_id: String,
    pub title: String,
    pub path: String,
    pub status: FileStatus,
    pub reason: String,
}

fn path_key(path: &str) -> String {
    let key = path.replace('\\', "/").trim_end_matches('/').to_owned();
    if cfg!(windows) {
        key.to_lowercase()
    } else {
        key
    }
}

fn track_root(path: &str, roots: &[String]) -> PathBuf {
    let key = path_key(path);
    if let Some(root) = roots
        .iter()
        .filter(|root| {
            let root = path_key(root);
            key == root
                || key
                    .strip_prefix(&root)
                    .is_some_and(|rest| rest.starts_with('/'))
        })
        .max_by_key(|root| root.len())
    {
        return PathBuf::from(root);
    }
    // A deleted parent directory on an online volume still means a missing song.
    Path::new(path)
        .components()
        .take_while(|part| matches!(part, Component::Prefix(_) | Component::RootDir))
        .collect()
}

fn root_issue(root: &Path) -> Option<(FileStatus, String)> {
    match std::fs::metadata(root) {
        Ok(meta) if meta.is_dir() => None,
        Ok(_) => Some((
            FileStatus::Inaccessible,
            "Music root is not a directory".into(),
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Some((
            FileStatus::RootUnavailable,
            format!("Music folder or drive unavailable: {}", root.display()),
        )),
        Err(error) => Some((FileStatus::Inaccessible, error.to_string())),
    }
}

/// Metadata only: never decode audio, change the library or touch music files.
pub fn check_playlist_files(
    tracks: &[Track],
    roots: &[String],
    cancel: &AtomicBool,
    mut progress: impl FnMut(usize),
) -> Result<Vec<PlaylistFileIssue>, String> {
    let mut root_health = HashMap::<PathBuf, Option<(FileStatus, String)>>::new();
    let mut issues = Vec::new();
    progress(0);
    for (index, track) in tracks.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("Check cancelled".into());
        }
        let root = track_root(&track.path, roots);
        let health =
            root_health
                .entry(root.clone())
                .or_insert_with(|| match std::fs::metadata(&root) {
                    Ok(meta) if meta.is_dir() => None,
                    Ok(_) => Some((
                        FileStatus::Inaccessible,
                        "Music root is not a directory".into(),
                    )),
                    Err(error) if error.kind() == ErrorKind::NotFound => Some((
                        FileStatus::RootUnavailable,
                        format!("Music folder or drive unavailable: {}", root.display()),
                    )),
                    Err(error) => Some((FileStatus::Inaccessible, error.to_string())),
                });
        let issue = if let Some(health) = health {
            Some(health.clone())
        } else {
            match std::fs::metadata(&track.path) {
                Ok(meta) if meta.is_file() => None,
                Ok(_) => Some((FileStatus::Inaccessible, "Path is not a file".into())),
                Err(error) if error.kind() == ErrorKind::NotFound => {
                    root_issue(&root).or_else(|| {
                        Some((
                            FileStatus::Missing,
                            "File no longer exists at this path".into(),
                        ))
                    })
                }
                Err(error) => Some((FileStatus::Inaccessible, error.to_string())),
            }
        };
        if let Some((status, reason)) = issue {
            issues.push(PlaylistFileIssue {
                track_id: track.id.clone(),
                title: track.title.clone().unwrap_or_else(|| track.name.clone()),
                path: track.path.clone(),
                status,
                reason,
            });
        }
        if (index + 1) % 32 == 0 || index + 1 == tracks.len() {
            progress(index + 1);
        }
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Check cancelled".into());
    }
    Ok(issues)
}
