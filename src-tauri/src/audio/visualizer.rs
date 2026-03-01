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
