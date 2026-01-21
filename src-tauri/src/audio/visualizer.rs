//! Visualizer buffer for audio visualization
//! 
//! This module provides a ring buffer for storing audio samples
//! that can be used for spectrum analysis and visualization.

use std::collections::VecDeque;

/// Ring buffer for visualizer samples - shared between audio thread and main thread
pub struct VisualizerBuffer {
    samples: VecDeque<f32>,
    capacity: usize,
}

impl VisualizerBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            samples: VecDeque::with_capacity(capacity),
            capacity,
        }
    }
    
    /// Add a sample to the buffer (called from audio thread)
    pub fn push(&mut self, sample: f32) {
        if self.samples.len() >= self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }
    
    /// Get a copy of current samples for visualization
    pub fn get_samples(&self) -> Vec<f32> {
        self.samples.iter().copied().collect()
    }
    
    /// Clear the buffer
    pub fn clear(&mut self) {
        self.samples.clear();
    }
}
