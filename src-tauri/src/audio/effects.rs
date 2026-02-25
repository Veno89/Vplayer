//! Audio effects processing module
//!
//! This module wraps audio sources with effects processing (EQ, balance, etc.)
//! and feeds samples to the visualizer buffer.
//!
//! # Batched Processing
//!
//! Instead of acquiring the effects Mutex for every single sample (88,200
//! lock attempts/sec at 44.1kHz stereo), we collect samples into a local
//! chunk buffer and process the entire chunk under a single lock acquisition.
//! This dramatically reduces lock contention on the audio hot path.

use rodio::Source;
use rodio::source::SeekError;
use rodio::cpal::FromSample;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use crate::effects::EffectsProcessor;
use super::visualizer::VisualizerBuffer;

/// Number of samples to batch before acquiring the effects processor lock.
/// 512 samples ≈ 11.6ms at 44.1kHz — low enough latency for real-time,
/// high enough to amortize the lock overhead.
const BATCH_SIZE: usize = 512;

/// EffectsSource wraps a Source and applies audio effects (EQ, balance, etc.)
/// to batches of samples, then feeds them to the visualizer buffer.
pub struct EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    input: I,
    processor: Arc<Mutex<EffectsProcessor>>,
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
    initialized: bool,
    /// Pre-processed sample buffer (filled from input, then processed in batch)
    batch: Vec<f32>,
    /// Read cursor into `batch` — when it reaches `batch.len()`, we refill.
    batch_pos: usize,
}

impl<I> EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    pub fn new(
        input: I,
        processor: Arc<Mutex<EffectsProcessor>>,
        visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
    ) -> Self {
        Self {
            input,
            processor,
            visualizer_buffer,
            initialized: false,
            batch: Vec::with_capacity(BATCH_SIZE),
            batch_pos: 0,
        }
    }

    /// Fill the batch buffer from the input source, then process the
    /// entire batch under a single effects-processor lock.
    fn refill_batch(&mut self) -> bool {
        self.batch.clear();
        self.batch_pos = 0;

        // Collect up to BATCH_SIZE raw samples
        for _ in 0..BATCH_SIZE {
            match self.input.next() {
                Some(sample) => self.batch.push(f32::from_sample_(sample)),
                None => break,
            }
        }

        if self.batch.is_empty() {
            return false;
        }

        // Process the entire batch under one lock acquisition
        if let Ok(mut proc) = self.processor.try_lock() {
            proc.process_buffer(&mut self.batch);
        }
        // If lock unavailable (contention), batch passes through unprocessed.
        // This prevents audio dropouts when EQ is being adjusted.

        // Push processed samples to the visualizer (also batched)
        if let Ok(mut buffer) = self.visualizer_buffer.try_lock() {
            for &sample in &self.batch {
                buffer.push(sample);
            }
        }

        true
    }
}

impl<I> Iterator for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        // One-time initialization: tell the processor about sample rate and channels
        if !self.initialized {
            let sr = self.input.sample_rate();
            let ch = self.input.channels();
            if let Ok(mut processor) = self.processor.lock() {
                processor.set_sample_rate(sr);
                processor.set_channels(ch);
            }
            self.initialized = true;
        }

        // Serve from the current batch if available
        if self.batch_pos < self.batch.len() {
            let sample = self.batch[self.batch_pos];
            self.batch_pos += 1;
            return Some(sample);
        }

        // Batch exhausted — refill
        if self.refill_batch() {
            let sample = self.batch[self.batch_pos];
            self.batch_pos += 1;
            Some(sample)
        } else {
            None
        }
    }
}

impl<I> Source for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.input.current_span_len()
    }

    fn channels(&self) -> u16 {
        self.input.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.input.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.input.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        // Invalidate the batch on seek so we don't serve stale samples
        self.batch.clear();
        self.batch_pos = 0;
        self.input.try_seek(pos)
    }
}

impl<I> Drop for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    fn drop(&mut self) {
        log::info!("EffectsSource dropped - track finished or removed from sink");
    }
}
