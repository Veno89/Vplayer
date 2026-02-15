//! Audio effects processing module
//!
//! This module wraps audio sources with effects processing (EQ, etc.)
//! and feeds samples to the visualizer buffer.

use rodio::{Source};
use rodio::source::SeekError;
use rodio::cpal::FromSample;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use crate::effects::EffectsProcessor;
use super::visualizer::VisualizerBuffer;

/// EffectsSource wraps a Source and applies audio effects (EQ, etc.) to each sample
pub struct EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    input: I,
    processor: Arc<Mutex<EffectsProcessor>>,
    visualizer_buffer: Arc<Mutex<VisualizerBuffer>>,
    sample_rate_initialized: bool,
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
            sample_rate_initialized: false,
        }
    }
}

impl<I> Iterator for EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        // Initialize effects processor with actual source sample rate on first sample
        if !self.sample_rate_initialized {
            let source_sample_rate = self.input.sample_rate();
            if let Ok(mut processor) = self.processor.lock() {
                processor.set_sample_rate(source_sample_rate);
            }
            self.sample_rate_initialized = true;
        }
        
        let sample = self.input.next();
        
        if sample.is_none() {
            // Log once when source finishes to avoid spamming
            // We can't easily dedup here without more state, but normally this returns None forever once done.
            log::debug!("EffectsSource input returned None - track finished or decode error");
        }

        sample.map(|sample| {
            // Convert sample to f32 first
            let sample_f32: f32 = f32::from_sample_(sample);
            
            // Try to process through effects, but don't block or panic if lock unavailable
            let processed = match self.processor.try_lock() {
                Ok(mut processor) => processor.process(sample_f32),
                Err(_) => {
                    // Lock unavailable (contention) - pass through unprocessed
                    // This prevents audio dropouts when EQ is being adjusted
                    sample_f32
                }
            };
            
            // Send sample to visualizer buffer (don't block if lock fails)
            if let Ok(mut buffer) = self.visualizer_buffer.try_lock() {
                buffer.push(processed);
            }
            
            processed
        })
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

