//! Audio effects processing module
//!
//! This module wraps audio sources with effects processing (EQ, etc.)
//! and feeds samples to the visualizer buffer.

use super::visualizer::VisualizerBuffer;
use crate::effects::EffectsProcessor;
use rodio::cpal::FromSample;
use rodio::source::SeekError;
use rodio::Source;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// EffectsSource wraps a Source and applies audio effects (EQ, etc.) to each sample
///
/// Uses batched processing: reads up to BATCH_SIZE samples from the input,
/// acquires the effects lock once, processes the whole batch, then yields
/// samples one at a time from the internal buffer. This reduces lock
/// acquisitions from ~88,200/sec to ~172/sec at 44.1kHz stereo.
const BATCH_SIZE: usize = 512;

pub struct EffectsSource<I>
where
    I: Source,
    f32: FromSample<I::Item>,
{
    input: I,
    processor: Arc<Mutex<EffectsProcessor>>,
    effects_enabled: Arc<AtomicBool>,
    effects_configured: Arc<AtomicBool>,
    visualizer_buffer: Arc<VisualizerBuffer>,
    /// Shared atomic balance value (f32 stored as u32 bits).
    /// -1.0 = full left, 0.0 = center, 1.0 = full right.
    balance: Arc<AtomicU32>,
    sample_rate_initialized: bool,
    /// Tracks interleaved channel position (0 = left, 1 = right, etc.)
    channel_index: u16,
    /// Internal buffer for batched processing
    batch_buf: Vec<f32>,
    /// Read position within batch_buf
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
        effects_enabled: Arc<AtomicBool>,
        effects_configured: Arc<AtomicBool>,
        visualizer_buffer: Arc<VisualizerBuffer>,
        balance: Arc<AtomicU32>,
    ) -> Self {
        Self {
            input,
            processor,
            effects_enabled,
            effects_configured,
            visualizer_buffer,
            balance,
            sample_rate_initialized: false,
            channel_index: 0,
            batch_buf: Vec::with_capacity(BATCH_SIZE),
            batch_pos: 0,
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

        // If the batch buffer is exhausted, refill it
        if self.batch_pos >= self.batch_buf.len() {
            self.batch_buf.clear();
            self.batch_pos = 0;

            // Read up to BATCH_SIZE raw samples from input
            for _ in 0..BATCH_SIZE {
                match self.input.next() {
                    Some(s) => self.batch_buf.push(f32::from_sample_(s)),
                    None => break,
                }
            }

            if self.batch_buf.is_empty() {
                log::debug!("EffectsSource input returned None - track finished or decode error");
                return None;
            }

            // Acquire effects lock once for the whole batch
            if self.effects_enabled.load(Ordering::Relaxed)
                && self.effects_configured.load(Ordering::Relaxed)
            {
                match self.processor.try_lock() {
                    Ok(mut processor) => {
                        processor.process_buffer(&mut self.batch_buf);
                    }
                    Err(_) => {
                        // Lock contention — pass batch through unprocessed
                        // to avoid audio dropouts during EQ adjustment
                    }
                }
            }
        }

        // Yield the next sample from the batch
        let processed = self.batch_buf[self.batch_pos];
        self.batch_pos += 1;

        // Apply stereo balance (lock-free atomic read)
        let channels = self.input.channels();
        let balanced = if channels >= 2 {
            let balance = f32::from_bits(self.balance.load(Ordering::Relaxed));
            let gain = if self.channel_index == 0 {
                if balance > 0.0 {
                    1.0 - balance
                } else {
                    1.0
                }
            } else if self.channel_index == 1 {
                if balance < 0.0 {
                    1.0 + balance
                } else {
                    1.0
                }
            } else {
                1.0
            };
            self.channel_index = (self.channel_index + 1) % channels;
            processed * gain
        } else {
            processed
        };

        // Send sample to visualizer buffer (lock-free)
        self.visualizer_buffer.push(balanced);

        Some(balanced)
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
        let result = self.input.try_seek(pos);
        if result.is_ok() {
            // Discard stale pre-seek samples so the next iterator call reads
            // fresh audio from the seeked position rather than leftover batch data.
            self.batch_buf.clear();
            self.batch_pos = 0;
        }
        result
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effects::{EffectsConfig, EffectsProcessor};
    use rodio::buffer::SamplesBuffer;

    fn source(enabled: bool, configured: bool) -> EffectsSource<SamplesBuffer> {
        EffectsSource::new(
            SamplesBuffer::new(1, 44_100, vec![0.95]),
            Arc::new(Mutex::new(EffectsProcessor::new(
                44_100,
                EffectsConfig::default(),
            ))),
            Arc::new(AtomicBool::new(enabled)),
            Arc::new(AtomicBool::new(configured)),
            Arc::new(VisualizerBuffer::new(8)),
            Arc::new(AtomicU32::new(0.0_f32.to_bits())),
        )
    }

    #[test]
    fn disabled_effects_bypass_dsp() {
        let mut disabled = source(false, true);
        assert_eq!(disabled.next(), Some(0.95));

        let mut enabled = source(true, true);
        assert!(enabled.next().expect("sample") < 0.95);
    }

    #[test]
    fn flat_effects_config_bypasses_dsp() {
        let mut flat = source(true, false);
        assert_eq!(flat.next(), Some(0.95));
    }
}
