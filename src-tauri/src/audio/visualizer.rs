//! Visualizer buffer for audio visualization
//! 
//! Lock-free SPSC ring buffer for storing audio samples.
//! The audio thread pushes samples without any locking, and the
//! visualization command reads a snapshot using atomic indices.

use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};

/// Lock-free ring buffer for visualizer samples.
///
/// The audio thread writes via `push()` (no locks, no allocation).
/// The UI thread reads via `get_samples()` (snapshot of recent data).
pub struct VisualizerBuffer {
    /// Sample data stored as f32 bits in AtomicU32 for lock-free access.
    samples: Box<[AtomicU32]>,
    /// Total number of samples ever pushed (monotonically increasing).
    write_pos: AtomicUsize,
    capacity: usize,
}

// Safety: All fields use atomic operations. No mutable aliasing occurs.
unsafe impl Send for VisualizerBuffer {}
unsafe impl Sync for VisualizerBuffer {}

impl VisualizerBuffer {
    pub fn new(capacity: usize) -> Self {
        let samples: Vec<AtomicU32> = (0..capacity)
            .map(|_| AtomicU32::new(0.0_f32.to_bits()))
            .collect();
        Self {
            samples: samples.into_boxed_slice(),
            write_pos: AtomicUsize::new(0),
            capacity,
        }
    }
    
    /// Add a sample to the buffer (called from audio thread, lock-free).
    pub fn push(&self, sample: f32) {
        let total = self.write_pos.fetch_add(1, Ordering::Relaxed);
        let pos = total % self.capacity;
        self.samples[pos].store(sample.to_bits(), Ordering::Relaxed);
    }
    
    /// Get a copy of current samples for visualization.
    pub fn get_samples(&self) -> Vec<f32> {
        let total = self.write_pos.load(Ordering::Relaxed);
        let len = total.min(self.capacity);
        let mut result = Vec::with_capacity(len);
        
        let start = if total > self.capacity { total - self.capacity } else { 0 };
        for i in start..total {
            let idx = i % self.capacity;
            result.push(f32::from_bits(self.samples[idx].load(Ordering::Relaxed)));
        }
        result
    }
    
    /// Clear the buffer.
    pub fn clear(&self) {
        self.write_pos.store(0, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── F-017b: VisualizerBuffer correctness & overflow safety ───────────────

    #[test]
    fn test_visualizer_basic_push_and_read() {
        let buf = VisualizerBuffer::new(8);
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
        // Push more samples than capacity; only the last `cap` should be readable.
        for i in 0..8u32 {
            buf.push(i as f32);
        }
        let samples = buf.get_samples();
        assert_eq!(samples.len(), cap, "get_samples should return exactly capacity samples when full");
        // Expected: samples 4, 5, 6, 7
        for (i, &s) in samples.iter().enumerate() {
            let expected = (i + 4) as f32;
            assert!((s - expected).abs() < 1e-6, "sample[{}] = {} expected {}", i, s, expected);
        }
    }

    #[test]
    fn test_visualizer_write_pos_overflow() {
        // Simulate a write_pos that is near usize::MAX to verify no panic on
        // the modulo index calculation when it wraps through zero.
        //
        // We can't push usize::MAX samples, so we directly initialise write_pos
        // to a value two steps before overflow (usize::MAX - 1) and push a few
        // more samples to cross the boundary.
        let cap = 16;
        let buf = VisualizerBuffer::new(cap);

        // Pre-fill the sample ring with sentinel values so we can verify reads
        // still return finite data after overflow.
        for i in 0..cap {
            buf.samples[i].store((i as f32).to_bits(), Ordering::Relaxed);
        }

        // Manually place write_pos just before overflow.
        buf.write_pos.store(usize::MAX - 1, Ordering::Relaxed);

        // These two pushes increment write_pos to usize::MAX and then to 0 (wrapping).
        buf.push(0.42);
        buf.push(0.84);

        // Must not panic and must return finite, non-empty samples.
        let samples = buf.get_samples();
        assert!(!samples.is_empty(), "get_samples must return data after write_pos overflow");
        for (i, &s) in samples.iter().enumerate() {
            assert!(s.is_finite(), "sample[{}] = {} is not finite after overflow", i, s);
        }
    }

    #[test]
    fn test_visualizer_clear_resets_length() {
        let buf = VisualizerBuffer::new(8);
        buf.push(1.0);
        buf.push(2.0);
        buf.clear();
        let samples = buf.get_samples();
        assert_eq!(samples.len(), 0, "get_samples after clear should return empty");
    }
}
