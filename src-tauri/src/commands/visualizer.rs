// Visualizer commands
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::visualizer::{VisualizerData, VisualizerMode};
use rodio::{Decoder, Source};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static LATEST_WAVEFORM_REQUEST: AtomicU64 = AtomicU64::new(0);

// ─────────────────────────────────────────────────────────────────────────────
// File-system waveform cache
// ─────────────────────────────────────────────────────────────────────────────

/// Directory under the system temp folder used for cached waveforms.
fn waveform_cache_dir() -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push("vplayer_waveform_cache");
    dir
}

/// Deterministic filename for a (path, bars) pair.
fn cache_key(path: &str, bars: usize) -> String {
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    bars.hash(&mut h);
    format!("{:016x}.waveform", h.finish())
}

/// Try to read a cached waveform from disk.
fn read_cached_waveform(path: &str, bars: usize) -> Option<Vec<f32>> {
    let file_path = waveform_cache_dir().join(cache_key(path, bars));
    let bytes = fs::read(&file_path).ok()?;
    let (samples, remainder) = bytes.as_chunks::<4>();
    if !remainder.is_empty() || samples.len() != bars {
        let _ = fs::remove_file(file_path);
        return None;
    }
    Some(
        samples
            .iter()
            .map(|sample| f32::from_le_bytes(*sample))
            .collect(),
    )
}

/// Persist a waveform to disk cache (best-effort, failure is silent).
fn write_cached_waveform(path: &str, bars: usize, data: &[f32], request_id: u64) {
    let dir = waveform_cache_dir();
    let _ = fs::create_dir_all(&dir);
    let key = cache_key(path, bars);
    let file_path = dir.join(&key);
    let temp_path = dir.join(format!("{key}.{request_id}.tmp"));
    let bytes: Vec<u8> = data.iter().flat_map(|v| v.to_le_bytes()).collect();
    if fs::write(&temp_path, bytes).is_ok() && fs::rename(&temp_path, file_path).is_err() {
        let _ = fs::remove_file(temp_path);
    }
}

/// Get visualization data from current audio playback
/// This reads samples from the audio player's internal buffer and processes them with FFT
#[tauri::command]
pub fn get_visualizer_data(state: tauri::State<'_, AppState>) -> AppResult<VisualizerData> {
    // Get samples from the audio player's visualizer buffer
    let (samples, sample_rate) = state.player.get_visualizer_samples();

    // Process samples with the visualizer (FFT analysis)
    let mut vis = state
        .visualizer
        .lock()
        .map_err(|e| AppError::InvalidState(format!("Failed to lock visualizer: {}", e)))?;
    vis.set_sample_rate(sample_rate);

    // Match the frontend's 20 Hz single-flight polling cadence.
    let delta_time = 0.05;

    Ok(vis.process(&samples, delta_time))
}

/// Enable sample capture only while the frontend is actively rendering it.
#[tauri::command]
pub fn set_visualizer_active(active: bool, state: tauri::State<'_, AppState>) {
    state.player.set_visualizer_active(active);
}

/// Set visualizer mode
#[tauri::command]
pub fn set_visualizer_mode(
    mode: VisualizerMode,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    let mut vis = state
        .visualizer
        .lock()
        .map_err(|e| AppError::InvalidState(format!("Failed to lock visualizer: {}", e)))?;
    vis.set_mode(mode);
    Ok(())
}

/// Set beat detection sensitivity
#[tauri::command]
pub fn set_beat_sensitivity(sensitivity: f32, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let mut vis = state
        .visualizer
        .lock()
        .map_err(|e| AppError::InvalidState(format!("Failed to lock visualizer: {}", e)))?;
    vis.set_beat_sensitivity(sensitivity);
    Ok(())
}

/// Pre-compute a low-resolution waveform for the entire track.
///
/// Decodes the file and returns `num_bars` peak amplitude values (0.0–1.0).
/// Intended for rendering a static waveform behind the seekbar.
#[tauri::command]
pub async fn get_track_waveform(
    track_id: String,
    path: String,
    num_bars: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<f32>> {
    let path = super::path_authority::authorize_track_path(&state.db, &track_id, &path)?;
    let bars = num_bars.unwrap_or(200).clamp(16, 2048);
    let request_id = LATEST_WAVEFORM_REQUEST.fetch_add(1, Ordering::SeqCst) + 1;

    // A cold-cache waveform scans and decodes the entire track. Keep that work
    // off Tauri's command-dispatch lane so playback and volume IPC stay
    // responsive while the waveform is being generated.
    tauri::async_runtime::spawn_blocking(move || compute_track_waveform(&path, bars, request_id))
        .await
        .map_err(|error| AppError::Audio(format!("Waveform worker failed: {error}")))?
}

fn ensure_current_waveform_request(request_id: u64) -> AppResult<()> {
    if LATEST_WAVEFORM_REQUEST.load(Ordering::SeqCst) == request_id {
        Ok(())
    } else {
        Err(AppError::Audio(
            "Stale waveform request ignored".to_string(),
        ))
    }
}

fn compute_track_waveform(path: &str, bars: usize, request_id: u64) -> AppResult<Vec<f32>> {
    ensure_current_waveform_request(request_id)?;

    // Check file-system cache first
    if let Some(cached) = read_cached_waveform(path, bars) {
        return Ok(cached);
    }

    let file = File::open(path)
        .map_err(|e| AppError::Io(std::io::Error::other(format!("Failed to open file: {}", e))))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| AppError::Decode(format!("Failed to decode audio: {}", e)))?;
    let channels = usize::from(source.channels().get());
    let sample_rate = source.sample_rate().get() as usize;
    let estimated_frames = source
        .total_duration()
        .map(|duration| (duration.as_secs_f64() * sample_rate as f64) as usize)
        .unwrap_or(sample_rate * 60 * 60 * 8);
    let frames_per_bar = (estimated_frames / bars).max(1);
    let max_samples = sample_rate
        .saturating_mul(channels)
        .saturating_mul(60 * 60 * 8);
    let mut peaks = vec![0.0_f32; bars];
    for (sample_index, sample) in source.take(max_samples).enumerate() {
        if sample_index % 16_384 == 0 {
            ensure_current_waveform_request(request_id)?;
        }
        let frame = sample_index / channels.max(1);
        let bucket = (frame / frames_per_bar).min(bars - 1);
        peaks[bucket] = peaks[bucket].max((sample / i16::MAX as f32).abs());
    }

    // Normalize to 0.0–1.0
    let max_peak = peaks.iter().cloned().fold(0.0_f32, f32::max);
    if max_peak > 0.0 {
        for p in &mut peaks {
            *p /= max_peak;
        }
    }

    // Persist to file-system cache
    ensure_current_waveform_request(request_id)?;
    write_cached_waveform(path, bars, &peaks, request_id);

    Ok(peaks)
}

#[cfg(test)]
mod tests {
    use super::{
        LATEST_WAVEFORM_REQUEST, Ordering, cache_key, ensure_current_waveform_request,
        read_cached_waveform, waveform_cache_dir, write_cached_waveform,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn newer_waveform_request_cancels_older_work() {
        let older = LATEST_WAVEFORM_REQUEST.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(ensure_current_waveform_request(older).is_ok());

        let newer = LATEST_WAVEFORM_REQUEST.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(ensure_current_waveform_request(older).is_err());
        assert!(ensure_current_waveform_request(newer).is_ok());
    }

    #[test]
    fn waveform_cache_requires_exact_bar_count_and_uses_complete_files() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = format!("waveform-cache-test-{nonce}");
        let bars = 16;
        let cache_path = waveform_cache_dir().join(cache_key(&path, bars));
        fs::create_dir_all(waveform_cache_dir()).expect("failed to create waveform cache dir");

        fs::write(&cache_path, vec![0_u8; (bars - 1) * 4])
            .expect("failed to write malformed waveform cache");
        assert!(read_cached_waveform(&path, bars).is_none());
        assert!(!cache_path.exists());

        let expected: Vec<f32> = (0..bars).map(|index| index as f32 / bars as f32).collect();
        write_cached_waveform(&path, bars, &expected, 1);
        assert_eq!(read_cached_waveform(&path, bars), Some(expected));

        let _ = fs::remove_file(cache_path);
    }
}
