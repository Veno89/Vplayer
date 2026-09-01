//! Visualizer buffer for audio visualization
//!
//! Lock-free SPSC ring buffer for storing audio samples.
//! The audio thread pushes samples without any locking, and the
//! visualization command reads a snapshot using atomic indices.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

/// Lock-free ring buffer for visualizer samples.
///
/// The audio thread writes via `push()` (no locks, no allocation).
/// The UI thread reads via `get_samples()` (snapshot of recent data).
pub struct VisualizerBuffer {
    /// Sample data stored as f32 bits in AtomicU32 for lock-free access.
    samples: Box<[AtomicU32]>,
    /// Total number of samples ever pushed (monotonically increasing).
    write_pos: AtomicU64,
    /// Collection is disabled unless the visualizer is actually on screen.
    active: AtomicBool,
    capacity: usize,
}

impl VisualizerBuffer {
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        let samples: Vec<AtomicU32> = (0..capacity)
            .map(|_| AtomicU32::new(0.0_f32.to_bits()))
            .collect();
        Self {
            samples: samples.into_boxed_slice(),
            write_pos: AtomicU64::new(0),
            active: AtomicBool::new(false),
            capacity,
        }
    }

    /// Add a sample to the buffer (called from audio thread, lock-free).
    pub fn push(&self, sample: f32) {
        if !self.active.load(Ordering::Relaxed) {
            return;
        }
        let total = self.write_pos.fetch_add(1, Ordering::Relaxed);
        let pos = (total % self.capacity as u64) as usize;
        self.samples[pos].store(sample.to_bits(), Ordering::Relaxed);
    }

    /// Get a copy of current samples for visualization.
    pub fn get_samples(&self) -> Vec<f32> {
        let total = self.write_pos.load(Ordering::Relaxed);
        let len = (total.min(self.capacity as u64)) as usize;
        let mut result = Vec::with_capacity(len);

        let start = total.saturating_sub(self.capacity as u64);
        for i in start..total {
            let idx = (i % self.capacity as u64) as usize;
            result.push(f32::from_bits(self.samples[idx].load(Ordering::Relaxed)));
        }
        result
    }

    /// Clear the buffer.
    pub fn clear(&self) {
        self.write_pos.store(0, Ordering::Relaxed);
    }

    /// Enable collection only while a visible visualizer needs samples.
    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::Relaxed);
        if !active {
            self.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── F-017b: VisualizerBuffer correctness & overflow safety ───────────────

    #[test]
    fn test_visualizer_basic_push_and_read() {
        let buf = VisualizerBuffer::new(8);
        buf.set_active(true);
        buf.push(0.1);
        buf.push(0.2);
        buf.push(0.3);
        let samples = buf.get_samples();
        assert_eq!(samples.len(), 3);
        assert!((samples[0] - 0.1).abs() < 1e-6);
        assert!((samples[1] - 0.2).abs() < 1e-6);
        assert!((samples[2] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn test_visualizer_capacity_wraps_correctly() {
        let cap = 4;
        let buf = VisualizerBuffer::new(cap);
        buf.set_active(true);
        // Push more samples than capacity; only the last `cap` should be readable.
        for i in 0..8u32 {
            buf.push(i as f32);
        }
        let samples = buf.get_samples();
        assert_eq!(
            samples.len(),
            cap,
            "get_samples should return exactly capacity samples when full"
        );
        // Expected: samples 4, 5, 6, 7
        for (i, &s) in samples.iter().enumerate() {
            let expected = (i + 4) as f32;
            assert!(
                (s - expected).abs() < 1e-6,
                "sample[{}] = {} expected {}",
                i,
                s,
                expected
            );
        }
    }

    #[test]
    fn test_visualizer_clear_resets_length() {
        let buf = VisualizerBuffer::new(8);
        buf.set_active(true);
        buf.push(1.0);
        buf.push(2.0);
        buf.clear();
        let samples = buf.get_samples();
        assert_eq!(
            samples.len(),
            0,
            "get_samples after clear should return empty"
        );
    }

    #[test]
    fn test_visualizer_does_not_collect_while_inactive() {
        let buf = VisualizerBuffer::new(8);
        buf.push(1.0);
        assert!(buf.get_samples().is_empty());

        buf.set_active(true);
        buf.push(2.0);
        assert_eq!(buf.get_samples(), vec![2.0]);

        buf.set_active(false);
        buf.push(3.0);
        assert!(buf.get_samples().is_empty());
    }
}
